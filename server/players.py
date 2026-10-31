"""Player view: filtered data, token movement, actions (rolls, attacks, spells, resources)."""
import copy
import math
import random
import re
import string
import time

from . import deck, items, money, rules, shop, storage
from .dice import crit_expr, fmod, roll
from .i18n import t
from .sheets import XP_TABLE
from .storage import add_patch, bump, load_camp, load_chars, load_mons, save_camp, write_json

SEEN = {}    # character id -> last poll (s)
PINGS = []   # map pings


def new_id():
    return "j" + format(int(time.time() * 1000), "x") + "".join(random.choices(string.ascii_lowercase + string.digits, k=5))


def esc(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def b(s):
    return f"<b>{esc(s)}</b>"


def player_map(camp):
    mid = camp.get("playerMap") or camp.get("currentMap")
    return next((x for x in camp.get("maps", []) if x.get("id") == mid), None)


def _route_upto(pts, d):
    """Route points up to the distance d (pixels): the part already traveled by the party."""
    out = pts[:1]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        ln = math.hypot(b["x"] - a["x"], b["y"] - a["y"])
        if d >= acc + ln:
            out.append(b)
        else:
            if d > acc and ln:
                k = (d - acc) / ln
                out.append({"x": a["x"] + (b["x"] - a["x"]) * k, "y": a["y"] + (b["y"] - a["y"]) * k, "mode": b.get("mode")})
            break
        acc += ln
    return out


def pub_world(m):
    """World map seen by the players: no hidden pins, GM notes or halts not reached yet; only the traveled part
    of a route unless the GM shows it whole."""
    pins = [{k: p.get(k) for k in ("id", "x", "y", "name", "icon")} for p in m.get("pins") or [] if not p.get("hidden")]
    routes = []
    for r in m.get("routes") or []:
        pts = [p for p in r.get("pts") or [] if isinstance(p, dict) and "x" in p and "y" in p]
        prog = float(r.get("prog") or 0)
        if not r.get("shown"):
            pts = _route_upto(pts, prog)
        halts = [{k: h.get(k) for k in ("id", "d", "name", "hidden")} for h in r.get("halts") or []
                 if (not h.get("hidden") and r.get("shown")) or float(h.get("d") or 0) <= prog + 0.5]
        routes.append({"id": r.get("id"), "name": r.get("name"), "color": r.get("color"), "shown": bool(r.get("shown")),
                       "pts": pts, "halts": halts, "prog": prog})
    return dict(m, pins=pins, routes=routes)


def pub_travel(camp, m):
    """The last move of the party, only if it happened on the map shown to the players."""
    tr = camp.get("travel")
    if not isinstance(tr, dict) or not m or tr.get("map") != m.get("id"):
        return None
    return {k: tr.get(k) for k in ("id", "map", "route", "from", "to", "dur")}


def current_cb(camp):
    c = camp.get("combat") or {}
    lst = c.get("list") or []
    turn = c.get("turn", 0)
    return lst[turn] if c.get("active") and 0 <= turn < len(lst) else None


# ---------------------------------------------------------------- visible state

PRIVATE_CHAR = ("notes", "levelHistory")   # GM notes (also present in level-up snapshots)


def pub_quest(q):
    """A quest seen by the players: its reward only when the GM shows it, or once it is given."""
    r = q.get("reward")
    out = {k: q.get(k) for k in ("t", "done", "pub")}
    if isinstance(r, dict) and (r.get("pub") or r.get("given")):
        out["reward"] = {k: r.get(k) for k in ("coins", "coinMode", "xp", "xpMode", "text", "given")}
        out["reward"]["items"] = [{"name": i.get("name"), "qty": i.get("qty")} for i in r.get("items") or []]
    return out


def player_state(me=None):
    camp = load_camp()
    chars = load_chars()
    mons = load_mons()
    combat = camp.get("combat") or {}
    clist = combat.get("list") or []
    cbs = {c.get("uid"): c for c in clist}
    m = player_map(camp)
    pub_mons = {}
    if m:
        fog = m.get("fog") or {}
        rev = fog.get("rev") or {}
        toks = []
        for tk in m.get("tokens", []):
            ref = tk.get("ref") or {}
            cb = cbs.get(ref.get("id")) if ref.get("kind") == "cb" else None
            if tk.get("hidden") or (cb and cb.get("hidden")):
                continue
            is_pc = ref.get("kind") == "pc" or (cb and cb.get("kind") == "pc")
            sz = tk.get("size") or 1
            if not is_pc and fog.get("on") and f"{math.floor(tk['x'] + sz / 2)},{math.floor(tk['y'] + sz / 2)}" not in rev:
                continue
            toks.append(tk)
            if ref.get("kind") == "mon" and ref.get("id") in mons:
                mo = mons[ref["id"]]
                pub_mons[mo["id"]] = {"id": mo["id"], "name": mo.get("name"), "portrait": mo.get("portrait", "")}
        m = dict(m, tokens=toks, view=None)
        if m.get("kind") == "world":
            m = pub_world(m)
    pub_list, turn = [], -1
    cur = current_cb(camp)
    for c in clist:
        if c.get("hidden"):
            continue
        if cur and c.get("uid") == cur.get("uid"):
            turn = len(pub_list)
        if c.get("kind") == "pc":
            pub_list.append({k: c.get(k) for k in ("uid", "kind", "charId", "init", "eco")})
        else:
            # opponents' hit points are reduced to a state from 0 (down) to 4 (unhurt)
            hp, mx = c.get("hp", 0), c.get("hpMax") or 1
            state = 0 if hp <= 0 else (1 if hp / mx < .25 else 2 if hp / mx < .5 else 3 if hp < mx else 4)
            pub_list.append({"uid": c.get("uid"), "kind": c.get("kind"), "name": c.get("name"),
                             "portrait": c.get("portrait") or (mons.get(c.get("monId")) or {}).get("portrait", ""),
                             "color": c.get("color", ""), "init": c.get("init"), "conditions": c.get("conditions") or [],
                             "dead": bool(c.get("dead")) or hp <= 0, "hp": state, "hpMax": 4})
    keys = ("id", "kind", "text", "who", "label", "expr", "total", "detail", "crit", "fumble", "adv", "t", "char", "src")
    log = [{k: e.get(k) for k in keys} for e in (camp.get("log") or [])
           if not e.get("secret") or (me and e.get("char") == me)][:40]
    journal = camp.get("journal") or {}
    meta = storage.meta(storage.active())
    st = camp.get("settings") or {}
    return {"rev": storage.data_rev(), "me": me,
            "campaignMeta": {"id": meta["id"], "name": meta.get("name", "")},
            "monsters": pub_mons,
            "characters": {k: {f: v for f, v in c.items() if f not in PRIVATE_CHAR} for k, c in chars.items()},
            "campaign": {"maps": [m] if m else [], "playerMap": m and m["id"], "currentMap": m and m["id"],
                         "combat": {"active": bool(combat.get("active")), "round": combat.get("round", 0), "turn": turn, "list": pub_list},
                         "log": log, "playerFocus": camp.get("playerFocus"), "handout": camp.get("handout"),
                         "travel": pub_travel(camp, m), "unroll": camp.get("unroll"), "cue": camp.get("cue"),
                         "quests": [pub_quest(q) for q in journal.get("quests", []) if q.get("pub")],
                         "npcs": [{"name": p.get("name"), "role": p.get("role", ""), "pub": p.get("pubDesc", "")}
                                  for p in journal.get("npcs", []) if p.get("pub")],
                         "settings": {"playerMove": st.get("playerMove", "always"), "playerActions": st.get("playerActions", "turn"),
                                      "playerLevelUp": bool(st.get("playerLevelUp")), "rules": st.get("rules", "2024")},
                         "deck": deck.player_view(camp, me),
                         "shop": shop.player_view(camp, me, chars.get(me) if me else None)}}


def presence():
    now = time.time()
    return {k: round(now - v) for k, v in SEEN.items() if now - v < 120}


def pings():
    now = time.time()
    PINGS[:] = [p for p in PINGS if now - p["t"] < 6]
    return [dict(p, age=round(now - p["t"], 1)) for p in PINGS]


def add_ping(d, who):
    try:
        x, y = float(d.get("x")), float(d.get("y"))
    except (TypeError, ValueError):
        return 400, t("Invalid position.")
    PINGS.append({"x": x, "y": y, "map": str(d.get("map", ""))[:80], "who": str(who)[:40], "color": str(d.get("color", ""))[:20],
                  "t": time.time(), "id": new_id()})
    del PINGS[:-20]
    return 200, "ok"


# ---------------------------------------------------------------- movement

def player_move(d):
    char, tid = str(d.get("char", "")), str(d.get("token", ""))
    try:
        x, y = float(d.get("x")), float(d.get("y"))
    except (TypeError, ValueError):
        return 400, t("Invalid position.")
    camp = load_camp()
    mode = (camp.get("settings") or {}).get("playerMove", "always")
    if mode == "off":
        return 403, t("The GM has locked token movement.")
    m = player_map(camp)
    tk = next((x for x in (m or {}).get("tokens", []) if x.get("id") == tid), None)
    if not tk:
        return 404, t("Token not found.")
    ref = tk.get("ref") or {}
    clist = (camp.get("combat") or {}).get("list") or []
    owner = ref.get("id") if ref.get("kind") == "pc" else next(
        (c.get("charId") for c in clist if c.get("uid") == ref.get("id") and c.get("kind") == "pc"), None)
    if owner != char:
        return 403, t("This token is not yours.")
    if mode == "turn" and (camp.get("combat") or {}).get("active"):
        cur = current_cb(camp) or {}
        if not (cur.get("kind") == "pc" and cur.get("charId") == char):
            return 403, t("It is not your turn.")
    g = m.get("grid") or {}
    size = g.get("size") or 70
    maxx = max(0, ((m.get("w") or 0) - (g.get("ox") or 0)) / size - (tk.get("size") or 1))
    maxy = max(0, ((m.get("h") or 0) - (g.get("oy") or 0)) / size - (tk.get("size") or 1))
    tk["x"] = round(min(max(x, -1), maxx + 1) * 2) / 2
    tk["y"] = round(min(max(y, -1), maxy + 1) * 2) / 2
    save_camp(camp)
    r = bump()
    add_patch("move", r, map=m["id"], tok=tid, x=tk["x"], y=tk["y"])
    return 200, r


# ---------------------------------------------------------------- actions

class Denied(Exception):
    def __init__(self, msg, code=403):
        super().__init__(msg)
        self.code = code


class Action:
    """Collects the changes made by one action, writes them, then records the merge patches."""

    def __init__(self, char_id):
        self.camp = load_camp()
        self.chars = load_chars()
        if char_id not in self.chars:
            raise Denied(t("Unknown character."), 404)
        self.c = self.chars[char_id]
        self.cid = char_id
        self.entries, self.char_patches, self.rolls, self.camp_patches = [], [], [], []
        self.char_changed = False

    # --- journal
    def log(self, kind="roll", secret=False, **kw):
        e = dict(kw, kind=kind, id=new_id(), t=int(time.time() * 1000) + len(self.entries), secret=bool(secret),
                 src="joueur", char=self.cid)   # "joueur" (player) is the stored source value
        self.entries.append(e)
        if kind == "roll":
            self.rolls.append({k: e.get(k) for k in ("label", "total", "detail", "crit", "fumble", "expr")})
        return e

    def info(self, text, secret=False):
        return self.log("info", secret, text=text)

    # --- character changes
    def num(self, path, delta, lo=None, hi=None):
        v = storage.get_path(self.c, path)
        if not isinstance(v, (int, float)):
            v = 0
        nv = v + delta
        if lo is not None:
            nv = max(lo, nv)
        h = storage.get_path(self.c, hi) if isinstance(hi, list) else hi
        if isinstance(h, (int, float)):
            nv = min(h, nv)
        storage.set_path(self.c, path, nv)
        self.char_patches.append(("cnum", dict(path=path, delta=delta, lo=lo, hi=hi)))
        self.char_changed = True
        return nv

    def set(self, path, value):
        storage.set_path(self.c, path, value)
        self.char_patches.append(("cset", dict(path=path, value=copy.deepcopy(value))))
        self.char_changed = True

    def camp_set(self, path, value):
        """Change in the campaign itself (replayed on GM saves made before it)."""
        storage.set_path(self.camp, path, value)
        self.camp_patches.append(("camp-set", dict(path=path, value=copy.deepcopy(value))))

    def camp_patch(self, kind, **kw):
        """Change already applied to self.camp, replayed by storage.merge_campaign."""
        self.camp_patches.append((kind, copy.deepcopy(kw)))

    def commit(self):
        if self.char_changed:
            write_json(storage.char_path(self.cid), self.c)
        if self.entries or self.camp_patches:
            log = self.camp.setdefault("log", [])
            for e in self.entries:
                log.insert(0, e)
            log.sort(key=lambda e: -(e.get("t") or 0))
            del log[300:]
            save_camp(self.camp)
        r = bump()
        for kind, kw in self.char_patches:
            add_patch(kind, r, char=self.cid, **kw)
        for kind, kw in self.camp_patches:
            add_patch(kind, r, **kw)
        for e in self.entries:
            add_patch("log", r, entry=e)
        return r

    # --- turn rules
    def in_combat(self):
        return bool((self.camp.get("combat") or {}).get("active"))

    def my_turn(self):
        cur = current_cb(self.camp) or {}
        return cur.get("kind") == "pc" and cur.get("charId") == self.cid

    def require_action(self, reaction=False):
        mode = (self.camp.get("settings") or {}).get("playerActions", "turn")
        if mode == "off":
            raise Denied(t("The GM is handling attacks and spells for now."))
        if (self.c.get("hp") or 0) <= 0:
            raise Denied(t("You are unconscious: only death saving throws are possible."))
        if mode == "turn" and self.in_combat() and not reaction and not self.my_turn():
            raise Denied(t("It is not your turn. Wait for your initiative turn."))

    # --- action economy: action, attacks of the Attack action, bonus action, reaction (see web/shared/economy.js)
    def my_cb(self):
        for cb in (self.camp.get("combat") or {}).get("list") or []:
            if cb.get("kind") == "pc" and cb.get("charId") == self.cid:
                return cb
        return None

    def spend(self, kind, label=""):
        """kind: 'atk' (one attack of the Attack action), 'a' (whole action), 'b' (bonus action), 'r' (reaction).
        Refused in "on their turn" mode when that part of the turn is already used; counted in any case."""
        cb = self.my_cb() if self.in_combat() else None
        if not cb:
            return
        strict = (self.camp.get("settings") or {}).get("playerActions", "turn") == "turn"
        eco = dict(cb.get("eco") or {})
        n = rules.attacks_per_action(self.c)
        if kind == "atk":
            if eco.get("a") and not eco.get("atk"):
                err = t("You have already used your action this turn.")
            elif eco.get("atk", 0) >= n:
                err = t("You have already made your {n} attack(s) this turn.", n=n)
            else:
                err = None
            eco["a"], eco["atk"] = 1, eco.get("atk", 0) + 1
        elif kind == "a":
            err = t("You have already used your action this turn.") if eco.get("a") else None
            eco["a"], eco["atk"] = 1, max(eco.get("atk", 0), n)
        elif kind == "b":
            err = t("You have already used your bonus action this turn.") if eco.get("b") else None
            eco["b"] = 1
        else:
            err = t("You have already used your reaction this round.") if eco.get("r") else None
            eco["r"] = 1
        if err and strict:
            raise Denied(err + (f" ({label})" if label else ""), 409)
        cb["eco"] = eco
        c = self.camp.get("combat") or {}
        self.camp_patch("cb-eco", uid=cb.get("uid"), value=eco, at=[c.get("round"), c.get("turn")])

    def target(self, uid):
        """Visible combatant targeted by the player -> {uid, name, ac} or None."""
        if not uid:
            return None
        for cb in (self.camp.get("combat") or {}).get("list") or []:
            if cb.get("uid") == uid and not cb.get("hidden"):
                if cb.get("kind") == "pc":
                    ch = self.chars.get(cb.get("charId")) or {}
                    return {"uid": uid, "name": ch.get("name", "?"), "ac": int(ch.get("ca") or 10)}
                return {"uid": uid, "name": cb.get("name", "?"), "ac": int(cb.get("ca") or 10)}
        return None


def _adv(d):
    try:
        a = int(d.get("adv") or 0)
    except (TypeError, ValueError):
        a = 0
    return max(-1, min(1, a))


def attack_roll(A, name, bonus, damage, dtype, tgt, adv, label_extra=""):
    """Attack roll + damage; returns the summary shown to the player."""
    who = A.c.get("name")
    a = roll("1d20" + fmod(int(bonus)), adv)
    hit = a["crit"] or (not a["fumble"] and (tgt is None or a["total"] >= tgt["ac"]))
    verdict = ""
    if tgt:
        verdict = f" — <b>{t('HIT')}</b>" if hit else f" — {t('miss')}"
    A.log(who=who, label=f"{name}{label_extra}{' → ' + tgt['name'] if tgt else ''}", expr=a["expr"], total=a["total"],
          detail=a["detail"] + verdict, crit=a["crit"], fumble=a["fumble"], adv=adv)
    d = None
    if damage and hit:
        d = roll(crit_expr(damage) if a["crit"] else damage)
        if d:
            A.log(who=who, label=t("{name} damage{crit} {type}", name=name, crit=t(" (critical)") if a["crit"] else "", type=dtype).strip(),
                  expr=d["expr"], total=d["total"], detail=d["detail"],
                  apply={"type": "dmg", "n": d["total"], "dtype": dtype, "uid": tgt and tgt["uid"], "name": tgt and tgt["name"]})
    return {"atk": a["total"], "crit": a["crit"], "fumble": a["fumble"], "hit": hit if tgt else None, "dmg": d and d["total"]}


def act_roll(A, d):
    expr = str(d.get("expr", ""))[:60]
    r = roll(expr, _adv(d))
    if not r:
        raise Denied(t("Invalid dice expression."), 400)
    A.log(who=A.c.get("name"), label=str(d.get("label") or expr)[:60], expr=r["expr"], total=r["total"], detail=r["detail"],
          crit=r["crit"], fumble=r["fumble"], adv=_adv(d), secret=bool(d.get("secret")))


def act_check(A, d):
    label, bonus = rules.check_bonus(A.c, str(d.get("key", "")))
    if not label:
        raise Denied(t("Unknown roll."), 400)
    adv = _adv(d)
    r = roll("1d20" + fmod(bonus), adv)
    A.log(who=A.c.get("name"), label=label, expr=r["expr"], total=r["total"], detail=r["detail"], crit=r["crit"],
          fumble=r["fumble"], adv=adv, secret=bool(d.get("secret")))


def act_attack(A, d):
    """Attack of the sheet: one attack of the Attack action on your turn, an opportunity attack (reaction) outside it,
    or the off-hand attack (bonus action, no positive ability modifier to the damage)."""
    off = bool(d.get("offhand"))
    reaction = A.in_combat() and not A.my_turn() and not off
    A.require_action(reaction=reaction)
    atks = A.c.get("attacks") or []
    try:
        a = atks[int(d.get("idx"))]
    except (TypeError, ValueError, IndexError):
        raise Denied(t("Unknown attack."), 400)
    name, damage = a.get("name", t("Attack")), a.get("damage", "")
    if off:
        name, damage = f"{name} ({t('off-hand')})", re.sub(r"\s*\+\s*\d+\s*$", "", damage or "")
    A.spend("b" if off else "r" if reaction else "atk", name)
    extra = ""
    cb, n = A.my_cb(), rules.attacks_per_action(A.c)
    if A.in_combat() and cb and not off and not reaction and n > 1:
        extra = f" ({(cb.get('eco') or {}).get('atk', 1)}/{n})"
    elif reaction:
        extra = f" ({t('reaction')})"
    tgt = A.target(d.get("target"))
    return attack_roll(A, name, int(a.get("bonus") or 0), damage, a.get("type", ""), tgt, _adv(d), extra)


def act_feature(A, d):
    """A feature of the sheet used as a bonus action ('b') or a reaction ('r'); spends a resource of the same name."""
    kind = "r" if d.get("kind") == "r" else "b"
    name = str(d.get("name", ""))
    feat = next((f for f in A.c.get("features") or [] if isinstance(f, dict) and f.get("name") == name), None)
    if not feat:
        raise Denied(t("Unknown feature."), 400)
    A.require_action(reaction=kind == "r")
    key = storage.norm(name).split(" (")[0]
    ri = next((i for i, r in enumerate(A.c.get("resources") or [])
               if storage.norm(r.get("name", "")).startswith(key) or key.startswith(storage.norm(r.get("name", "")) or "\0")), None)
    if ri is not None and (A.c["resources"][ri].get("cur") or 0) <= 0:
        raise Denied(t("No uses left."), 409)
    A.spend(kind, name)
    extra = ""
    if ri is not None:
        r = A.c["resources"][ri]
        nv = A.num(["resources", ri, "cur"], -1, lo=0, hi=["resources", ri, "max"])
        extra = f" ({esc(r.get('name'))} {nv}/{r.get('max')})"
    label = t("bonus action") if kind == "b" else t("reaction")
    A.info("<i class='ico i-sparkle'></i> " + t("{who} uses {name}", who=b(A.c.get("name")), name=b(name)) + f" — {label}{extra}")


def act_spell(A, d):
    c = A.c
    sc = c.get("spellcasting") or {}
    name, lvl = str(d.get("spell", "")), str(d.get("lvl", ""))
    if name not in ((c.get("spells") or {}).get(lvl) or []):
        raise Denied(t("This spell is not on your sheet."), 400)
    level = int(lvl)
    _, sp = rules.find_spell(name, level)
    sp = sp or {"n": name, "niv": level, "temps": "1 action"}
    reaction = "réaction" in (sp.get("temps") or "")
    A.require_action(reaction=reaction)
    A.spend(rules.cast_kind(sp) if A.my_turn() else "r", sp["n"])
    ritual = bool(d.get("ritual")) and sp.get("rituel")
    slot = level
    if level > 0 and not ritual:
        try:
            slot = int(d.get("slot") or level)
        except (TypeError, ValueError):
            slot = level
        if slot < level:
            raise Denied(t("You need a level {n} slot or higher.", n=level), 400)
        s = ((sc.get("slots") or {}).get(str(slot))) or {}
        if (s.get("cur") or 0) <= 0:
            raise Denied(t("No level {n} slot left.", n=slot), 409)
        A.num(["spellcasting", "slots", str(slot), "cur"], -1, lo=0)
    elif ritual and A.in_combat():
        raise Denied(t("A ritual takes 10 more minutes: not possible in combat."), 400)
    abm = rules.mod((c.get("stats") or {}).get(sc.get("ability", "INT"), 10))
    nums = rules.spell_numbers(sp, slot, int(c.get("niveau") or 1), abm)
    dc, atkb = int(sc.get("dc") or 10), int(sc.get("attack") or 0)
    who = c.get("name")
    uids = [u for u in (d.get("targets") or []) if isinstance(u, str)][:10]
    tgts = [x for x in (A.target(u) for u in uids) if x]
    head = "<i class='ico i-spells'></i> " + t("{who} casts {spell}", who=b(who), spell=b(sp["n"]))
    if level > 0:
        head += t(" (ritual)") if ritual else t(" — level {n} slot", n=slot)
    if tgts:
        head += " → " + ", ".join(esc(x["name"]) for x in tgts)
    bits = []
    if sp.get("jds"):
        bits.append(t("{ab} save DC {dc}", ab=sp["jds"], dc=dc) + (t(" (half on success)") if sp.get("jdsOk") == "moitie" else ""))
    if sp.get("zone"):
        bits.append(esc(sp["zone"]))
    if sp.get("note"):
        bits.append(esc(sp["note"]))
    if not nums and sp.get("resume"):
        bits.append(esc(sp["resume"]))
    A.info(head + ("<br><span class='small'>" + " · ".join(bits) + "</span>" if bits else ""))
    if sp.get("conc"):
        prev = c.get("concentration")
        if prev and prev != sp["n"]:
            A.info("<i class='ico i-spells'></i> " + t("{who} stops concentrating on {spell}.", who=esc(who), spell=b(prev)))
        A.set(["concentration"], sp["n"])
        conds = [x for x in (c.get("conditions") or []) if x.get("n") != "Concentration"]
        conds.append({"n": "Concentration", "r": None})
        A.set(["conditions"], conds)
    res = {"spell": sp["n"], "rays": []}
    dm = nums.get("dmg")
    if sp.get("atk"):
        n = (nums.get("multi") or {}).get("n", 1)
        for i in range(n):
            tgt = tgts[i % len(tgts)] if tgts else None
            extra = f" ({nums['multi']['nom']} {i + 1}/{n})" if n > 1 else ""
            res["rays"].append(attack_roll(A, sp["n"], atkb, dm and dm["expr"], dm and dm["type"] or "", tgt, _adv(d), extra))
    elif dm:
        r = roll(dm["expr"])
        if r:
            label = t("{name} damage{crit} {type}", name=sp["n"], crit="", type=dm["type"]).strip()
            if sp.get("jds"):
                A.log(who=who, label=label, expr=r["expr"], total=r["total"], detail=r["detail"],
                      apply={"type": "zone", "n": r["total"], "ab": sp["jds"], "dc": dc, "half": sp.get("jdsOk") == "moitie",
                             "uids": [x["uid"] for x in tgts], "dtype": dm["type"]})
            else:
                tgt = tgts[0] if tgts else None
                A.log(who=who, label=label, expr=r["expr"], total=r["total"], detail=r["detail"],
                      apply={"type": "dmg", "n": r["total"], "dtype": dm["type"], "uid": tgt and tgt["uid"], "name": tgt and tgt["name"]})
            res["dmg"] = r["total"]
    heal = nums.get("soin")
    if heal and heal.get("expr"):
        r = roll(heal["expr"])
        if r:
            tgt = tgts[0] if tgts else None
            if heal.get("temp") and (sp.get("portee") or "").startswith("perso"):
                A.set(["hpTemp"], max(int(c.get("hpTemp") or 0), r["total"]))
                A.log(who=who, label=t("{spell}: temporary hit points", spell=sp["n"]), expr=r["expr"], total=r["total"], detail=r["detail"])
            else:
                A.log(who=who, label=t("{spell} healing{target}", spell=sp["n"], target=" → " + tgt["name"] if tgt else ""),
                      expr=r["expr"], total=r["total"], detail=r["detail"],
                      apply={"type": "heal", "n": r["total"], "temp": heal.get("temp"), "uid": tgt and tgt["uid"], "name": tgt and tgt["name"]})
            res["heal"] = r["total"]
    return res


def act_resource(A, d):
    try:
        i, delta = int(d.get("idx")), int(d.get("delta"))
        r = (A.c.get("resources") or [])[i]
    except (TypeError, ValueError, IndexError):
        raise Denied(t("Unknown resource."), 400)
    if delta not in (-1, 1) or (delta > 0 and r.get("reset") != "aucun"):   # "aucun" = never recharged by a rest
        raise Denied(t("Only the GM can recharge this resource (rest)."), 403)
    if delta < 0 and (r.get("cur") or 0) <= 0:
        raise Denied(t("No uses left."), 409)
    nv = A.num(["resources", i, "cur"], delta, lo=0, hi=["resources", i, "max"])
    msg = "{who} uses {res} ({n}/{max})" if delta < 0 else "{who} gains {res} ({n}/{max})"
    A.info("<i class='ico i-resource'></i> " + t(msg, who=b(A.c.get("name")), res=b(r.get("name")), n=nv, max=r.get("max")))


def _inv_entry(A, d):
    inv = copy.deepcopy(A.c.get("inventory") or [])
    i = next((k for k, e in enumerate(inv) if e.get("uid") == d.get("uid")), None)
    if i is None:
        raise Denied(t("Unknown item."), 400)
    return inv, inv[i]


def _inv_save(A, inv):
    """Stores the inventory and what follows from it (armor class, weapon attacks, save bonus)."""
    A.c["inventory"] = inv
    items.apply_inventory(A.c)
    for k in ("inventory", "attacks", "ca", "saveItemBonus"):
        A.set([k], A.c.get(k))


def act_inv_equip(A, d):
    """The player equips / stows an item (one armor and one shield at a time)."""
    inv, e = _inv_entry(A, d)
    cat = items.catalog()
    v = items.view(e, cat)
    e["equipped"] = not e.get("equipped")
    if e["equipped"]:
        for o in inv:
            if o is not e and o.get("equipped"):
                ov = items.view(o, cat)
                if items.is_armor(v) and items.is_armor(ov) or items.is_shield(v) and items.is_shield(ov):
                    o["equipped"] = False
    _inv_save(A, inv)
    A.info("<i class='ico i-bag'></i> " + t("{who} equips {item}" if e["equipped"] else "{who} stows {item}", who=b(A.c.get("name")), item=b(v["name"]))
           + (f" — {t('AC')} {A.c.get('ca')}" if v.get("armor") else ""))


def act_inv_attune(A, d):
    if A.in_combat():
        raise Denied(t("Attuning takes a short rest: not possible in combat."), 400)
    inv, e = _inv_entry(A, d)
    v = items.view(e, items.catalog())
    if not v.get("attune"):
        raise Denied(t("This item does not require attunement."), 400)
    if not e.get("attuned") and sum(1 for o in inv if o.get("attuned")) >= items.MAX_ATTUNED:
        raise Denied(t("You are already attuned to {n} items (maximum).", n=items.MAX_ATTUNED), 409)
    e["attuned"] = not e.get("attuned")
    _inv_save(A, inv)
    A.info("<i class='ico i-sparkle'></i> " + t("{who} attunes to {item}" if e["attuned"] else "{who} ends their attunement to {item}", who=b(A.c.get("name")), item=b(v["name"])))


def act_inv_charge(A, d):
    """Spends charges of an item (wand, staff…): only the GM recharges them."""
    inv, e = _inv_entry(A, d)
    ch = e.get("charges") or {}
    try:
        n = max(1, min(10, int(d.get("n") or 1)))
    except (TypeError, ValueError):
        n = 1
    if (ch.get("cur") or 0) < n:
        raise Denied(t("Not enough charges left."), 409)
    ch["cur"] -= n
    e["charges"] = ch
    A.c["inventory"] = inv
    A.set(["inventory"], inv)
    v = items.view(e, items.catalog())
    A.info("<i class='ico i-wand'></i> " + t("{who} uses {n} charge(s) of {item} ({cur}/{max})", who=b(A.c.get("name")), n=n, item=b(v["name"]), cur=ch["cur"], max=ch.get("max")))


def act_hitdie(A, d):
    c = A.c
    if A.in_combat():
        raise Denied(t("Hit dice are spent during a short rest, not in combat."))
    if (c.get("hitDice") or 0) <= 0:
        raise Denied(t("No hit dice left."), 409)
    if (c.get("hp") or 0) >= (c.get("hpMax") or 0):
        raise Denied(t("You already have all your hit points."), 409)
    r = roll(f"1d{int(c.get('hitDie') or 8)}" + fmod(rules.mod((c.get('stats') or {}).get('CON', 10))))
    gain = max(0, r["total"])
    A.num(["hitDice"], -1, lo=0)
    hp = A.num(["hp"], gain, lo=0, hi=["hpMax"])
    A.log(who=c.get("name"), label=t("Hit die"), expr=r["expr"], total=r["total"], detail=r["detail"])
    A.info("<i class='ico i-heal'></i> " + t("{who} recovers {n} HP → {hp}/{max}", who=b(c.get("name")), n=gain, hp=hp, max=c.get("hpMax")))


def act_death(A, d):
    c = A.c
    if (c.get("hp") or 0) > 0:
        raise Denied(t("You are not at 0 hit points."), 400)
    ds = dict(c.get("deathSaves") or {"s": 0, "f": 0})
    if ds.get("s", 0) >= 3 or ds.get("f", 0) >= 3:
        raise Denied(t("Death saving throws are over."), 409)
    r = roll("1d20")
    A.log(who=c.get("name"), label=t("Death saving throw"), expr=r["expr"], total=r["total"], detail=r["detail"],
          crit=r["crit"], fumble=r["fumble"])
    who = b(c.get("name"))
    if r["nat"] == 20:
        A.set(["hp"], 1)
        A.set(["deathSaves"], {"s": 0, "f": 0})
        A.set(["conditions"], [x for x in (c.get("conditions") or []) if x.get("n") != "Inconscient"])
        A.info("<i class='ico i-sparkle'></i> " + t("{who} rolls a 20 and regains consciousness with 1 HP!", who=who))
        return
    if r["nat"] == 1:
        ds["f"] = min(3, ds.get("f", 0) + 2)
    elif r["total"] >= 10:
        ds["s"] = min(3, ds.get("s", 0) + 1)
    else:
        ds["f"] = min(3, ds.get("f", 0) + 1)
    A.set(["deathSaves"], ds)
    if ds["s"] >= 3:
        A.info("<i class='ico i-bandage'></i> " + t("{who} is stable.", who=who))
    if ds["f"] >= 3:
        A.info("<i class='ico i-skull'></i> " + t("{who} is dead.", who=who))


def act_notes(A, d):
    A.set(["playerNotes"], str(d.get("text", ""))[:20000])


def act_end_concentration(A, d):
    prev = A.c.get("concentration")
    A.set(["concentration"], None)
    A.set(["conditions"], [x for x in (A.c.get("conditions") or []) if x.get("n") != "Concentration"])
    if prev:
        A.info("<i class='ico i-spells'></i> " + t("{who} ends their concentration ({spell}).", who=b(A.c.get("name")), spell=b(prev)))


LEVEL_FIELDS = ("niveau", "hpMax", "hp", "hitDice", "prof", "stats", "saves", "skills", "expertise", "attacks", "resources",
                "spellcasting", "spells", "features", "initBonus", "classe", "vitesse")


HIT_DIE = (("barbare", 12), ("guerri", 10), ("paladin", 10), ("rodeu", 10), ("magicien", 6), ("ensorcel", 6))


def hit_die(c):
    if c.get("hitDie"):
        return int(c["hitDie"])
    s = storage.norm(c.get("classe") or "")
    return next((v for p, v in HIT_DIE if s.startswith(p)), 8)


def act_levelup_roll(A, d):
    """The player rolls their hit die for the next level: rolled by the server, once per level."""
    c = A.c
    if not (A.camp.get("settings") or {}).get("playerLevelUp"):
        raise Denied(t("The GM handles level-ups: let them know!"))
    n = int(c.get("niveau") or 1) + 1
    if n > 20 or int(c.get("xp") or 0) < XP_TABLE[n - 1]:
        raise Denied(t("You need {xp} XP to reach level {n}.", xp=XP_TABLE[min(n, 20) - 1], n=n))
    lr = c.get("lvlRoll") or {}
    if lr.get("niveau") == n:
        return {"roll": lr["roll"], "die": lr["die"], "again": True}
    die = hit_die(c)
    r = roll(f"1d{die}")
    A.set(["lvlRoll"], {"niveau": n, "roll": r["total"], "die": die})
    A.log(who=c.get("name"), label=t("Hit die for level {n}", n=n), expr=r["expr"], total=r["total"], detail=r["detail"])
    return {"roll": r["total"], "die": die}


def act_levelup(A, d):
    """The player applies their own level-up (if the GM allows it)."""
    if not (A.camp.get("settings") or {}).get("playerLevelUp"):
        raise Denied(t("The GM handles level-ups: let them know!"))
    c, nc = A.c, d.get("data")
    if not isinstance(nc, dict):
        raise Denied(t("Invalid data."), 400)
    old = int(c.get("niveau") or 1)
    if int(nc.get("niveau") or 0) != old + 1 or old >= 20:
        raise Denied(t("Invalid level."), 400)
    if int(c.get("xp") or 0) < XP_TABLE[old]:
        raise Denied(t("You need {xp} XP to reach level {n}.", xp=XP_TABLE[old], n=old + 1))
    gain = int(nc.get("hpMax") or 0) - int(c.get("hpMax") or 0)
    if not 1 <= gain <= 60:
        raise Denied(t("Inconsistent hit point gain."), 400)
    # hit points: only the hit die rolled by the server for this level (no average, no maximum)
    lr = c.get("lvlRoll") or {}
    if lr.get("niveau") != old + 1:
        raise Denied(t("Roll your hit die first."), 409)
    con_old = rules.mod((c.get("stats") or {}).get("CON", 10))
    con_new = rules.mod(((nc.get("stats") if isinstance(nc.get("stats"), dict) else None) or c.get("stats") or {}).get("CON", 10))
    tough_now = any(re.search(r"robuste", str(f.get("name", "")), re.I) for f in c.get("features") or [] if isinstance(f, dict))
    tough_new = not tough_now and any(re.search(r"robuste", str(f.get("name", "")), re.I) for f in nc.get("features") or [] if isinstance(f, dict))
    max_gain = (max(1, int(lr["roll"]) + con_new) + (2 if tough_now else 0) + max(0, con_new - con_old) * old
                + (2 * old + 2 if tough_new else 0))
    if gain > max_gain:
        raise Denied(t("Inconsistent hit point gain."), 400)
    if (A.camp.get("settings") or {}).get("rules", "2024") != "2014" and isinstance(nc.get("spells"), dict):
        err = rules.check_spells_2024(c, nc)
        if err:
            raise Denied(err, 400)
    types = {"stats": dict, "skills": dict, "spells": dict, "attacks": list, "resources": list, "features": list, "saves": list}
    snap = copy.deepcopy(c)
    snap.pop("levelHistory", None)
    for f in LEVEL_FIELDS:
        if f in nc and (f not in types or isinstance(nc[f], types[f])):
            A.set([f], nc[f])
    A.set(["levelHistory"], ((c.get("levelHistory") or []) + [{"niveau": old, "t": int(time.time() * 1000), "snap": snap}])[-5:])
    A.set(["lvlRoll"], None)
    if d.get("announce", True):
        summ = " · ".join(str(x) for x in (d.get("summary") or [])[:12])
        A.info("<i class='ico i-arrow-up'></i> " + t("{who} reaches level {n}", who=b(c.get("name")), n=f"<b>{old + 1}</b>")
               + (f" : {esc(summ)}" if summ else ""))
    return {"niveau": old + 1}


ACTIONS = {"levelup": act_levelup, "levelup_roll": act_levelup_roll,"roll": act_roll, "check": act_check, "attack": act_attack, "spell": act_spell,
           "feature": act_feature, "inv_equip": act_inv_equip, "inv_attune": act_inv_attune, "inv_charge": act_inv_charge,
           "resource": act_resource, "hitdie": act_hitdie, "death": act_death, "notes": act_notes,
           "end_concentration": act_end_concentration,
           "deck_declare": lambda A, d: deck.act_declare(A, d, Denied, esc),
           "deck_draw": lambda A, d: deck.act_draw(A, d, Denied, esc),
           "deck_option": lambda A, d: deck.act_option(A, d, Denied, esc),
           "deck_fx": lambda A, d: deck.act_fx(A, d, Denied, esc),
           "shop_buy": lambda A, d: shop.act_buy(A, d, Denied),
           "shop_sell": lambda A, d: shop.act_sell(A, d, Denied),
           "shop_cancel": lambda A, d: shop.act_cancel(A, d, Denied),
           "money_change": lambda A, d: money.act_change(A, d, Denied)}


def gm_shop_resolve(d):
    """GM: accepts or refuses a purchase / resale request."""
    try:
        return shop.gm_resolve(Action, Denied, d)
    except Denied as e:
        return e.code, {"error": str(e)}


def gm_deck_fx(d):
    """GM: applies or undoes the automatic effects of a draw on the drawer's sheet."""
    try:
        return deck.gm_fx(Action, d)
    except Denied as e:
        return e.code, {"error": str(e)}


def player_action(d):
    fn = ACTIONS.get(str(d.get("type")))
    if not fn:
        return 400, {"error": t("Unknown action.")}
    try:
        A = Action(str(d.get("char", "")))
        res = fn(A, d)
    except Denied as e:
        return e.code, {"error": str(e)}
    r = A.commit()
    return 200, {"ok": True, "rev": r, "rolls": A.rolls, "result": res,
                 "infos": [re.sub(r"<[^>]+>", "", re.sub(r"<br\s*/?>", " — ", e["text"])) for e in A.entries if e["kind"] == "info"]}
