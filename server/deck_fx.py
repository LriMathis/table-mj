"""Automatic effects of the deck cards on a character sheet.

Each card may carry an "auto" object (campaign data):
  choose  [{k, label, opts: [[value, label], …], multi: n}]   choices made by the player or the GM
  ops     list of operations, applied in order; "$k" refers to a choice
Operations change the sheet through the Action object of players.py (A.set), so a GM save made meanwhile
replays them, and they can be undone (the previous values of the changed fields are kept in entry["fx"]["undo"]).
"""
import copy
import re

from . import money, rules
from .dice import roll

STAT_NAMES = {"FOR": "Force", "DEX": "Dextérité", "CON": "Constitution", "INT": "Intelligence", "SAG": "Sagesse", "CHA": "Charisme"}


class FxError(Exception):
    pass


def needs_choice(card, choices):
    spec = (card.get("auto") or {}).get("choose") or []
    return [ch for ch in spec if not choices.get(ch["k"])]


class Sheet:
    """Working copy of the character: records the touched fields and the readable changes."""

    def __init__(self, c):
        self.c = copy.deepcopy(c)
        self.orig = c
        self.touched = set()
        self.changes = []

    def get(self, k, default=None):
        v = self.c.get(k)
        return default if v is None else v

    def put(self, k, v):
        self.touched.add(k)
        self.c[k] = v

    def say(self, s):
        self.changes.append(s)

    # --- ability score and everything computed from it
    def set_stat(self, ab, new):
        stats = dict(self.get("stats", {}))
        old = int(stats.get(ab, 10))
        if new == old:
            return
        d = rules.mod(new) - rules.mod(old)
        stats[ab] = new
        self.put("stats", stats)
        self.say(f"{STAT_NAMES[ab]} {old} → {new}")
        if not d:
            return
        skills = dict(self.get("skills", {}))
        moved = [sk for sk in skills if rules.SKILLS.get(sk) == ab]
        for sk in moved:
            skills[sk] = int(skills[sk]) + d
        if moved:
            self.put("skills", skills)
            self.say("compétences (" + ", ".join(moved) + f") {'+' if d > 0 else ''}{d}")
        if ab == "DEX":
            self.put("initBonus", int(self.get("initBonus", 0)) + d)
            self.say(f"initiative {'+' if d > 0 else ''}{d}")
        sc = self.get("spellcasting")
        if sc and sc.get("ability") == ab:
            sc = dict(sc, dc=int(sc.get("dc") or 10) + d, attack=int(sc.get("attack") or 0) + d)
            self.put("spellcasting", sc)
            self.say(f"DD des sorts {sc['dc']}, attaque des sorts {'+' if sc['attack'] >= 0 else ''}{sc['attack']}")
        prof = int(self.get("prof", 2))
        old_mods = {k: rules.mod(v) for k, v in (self.orig.get("stats") or {}).items()}
        atks = copy.deepcopy(self.get("attacks", []))
        changed = False
        for a in atks if isinstance(atks, list) else []:
            b = int(a.get("bonus") or 0)
            if b == prof + old_mods.get(ab, 0) and ab in ("FOR", "DEX"):
                a["bonus"] = b + d
                a["damage"] = re.sub(r"([+-]\d+)?$", lambda m: (lambda v: (f"+{v}" if v > 0 else str(v)) if v else "")(int(m.group(0) or 0) + d),
                                     str(a.get("damage") or ""), count=1)
                changed = True
        if changed:
            self.put("attacks", atks)
            self.say("attaques mises à jour")
        if ab == "CON":
            lv = int(self.get("niveau", 1))
            self.put("hpMax", int(self.get("hpMax", 1)) + lv * d)
            self.put("hp", max(0, int(self.get("hp", 0)) + lv * d))
            self.say(f"PV max {'+' if d > 0 else ''}{lv * d}")

    def add_cond(self, name):
        conds = [x for x in self.get("conditions", []) if x.get("n") != name]
        conds.append({"n": name, "r": None})
        self.put("conditions", conds)
        self.say(f"état : {name}")

    def add_feat(self, name, text):
        feats = list(self.get("features", []))
        feats.append({"name": name, "text": text})
        self.put("features", feats)
        self.say(f"capacité : {name}")

    def add_res(self, name, n, reset="aucun"):
        res = [x for x in self.get("resources", []) if x.get("name") != name]
        res.append({"name": name, "max": n, "cur": n, "reset": reset})
        self.put("resources", res)
        self.say(f"usages : {name} ({n})")


def _r(expr, rolls):
    r = roll(expr)
    rolls.append({"label": expr, "total": r["total"], "detail": r["detail"]})
    return r["total"]


def _v(x, choices):
    return choices.get(x[1:]) if isinstance(x, str) and x.startswith("$") else x


def run(card, char, choices):
    """-> (sheet, rolls, flags). Raises FxError on an invalid choice."""
    auto = card.get("auto") or {}
    S, rolls, flags = Sheet(char), [], {}
    for op in auto.get("ops") or []:
        t = op["t"]
        if t == "stat":
            ab = _v(op["ab"], choices)
            if ab not in STAT_NAMES:
                raise FxError("Caractéristique invalide.")
            cur = int((S.get("stats", {})).get(ab, 10))
            if cur >= op.get("max", 30):
                S.say(f"{STAT_NAMES[ab]} déjà à {cur} ou plus : aucun changement")
            else:
                S.set_stat(ab, min(op.get("max", 30), cur + op["n"]))
        elif t == "allstats":
            for ab in STAT_NAMES:
                cur = int((S.get("stats", {})).get(ab, 10))
                if cur < op["max"]:
                    S.set_stat(ab, min(op["max"], cur + op["n"]))
        elif t == "balance":
            up, down = _v(op["up"], choices), _v(op["down"], choices)
            if up == "none":
                S.say("Équilibre : aucun changement choisi")
                continue
            if up not in STAT_NAMES or down not in STAT_NAMES or up == down:
                raise FxError("Choisissez deux caractéristiques différentes.")
            st = S.get("stats", {})
            if int(st.get(down, 10)) <= 5:
                raise FxError("On ne peut pas diminuer une valeur de 5 ou moins.")
            if int(st.get(up, 10)) + 2 > 22:
                raise FxError("La valeur augmentée ne peut pas dépasser 22.")
            S.set_stat(up, int(st.get(up, 10)) + 2)
            S.set_stat(down, int(S.get("stats", {}).get(down, 10)) - 2)
        elif t == "statroll":
            ab = _v(op["ab"], choices)
            if ab not in STAT_NAMES:
                raise FxError("Caractéristique invalide.")
            n = _r(op["dice"], rolls)
            cur = int((S.get("stats", {})).get(ab, 10))
            S.set_stat(ab, max(op.get("min", 1), cur - n))
        elif t == "hpmax":
            S.put("hpMax", int(S.get("hpMax", 1)) + op["n"])
            S.put("hp", int(S.get("hp", 0)) + op["n"])
            S.say(f"PV max et PV +{op['n']}")
        elif t == "speed":
            v = str(S.get("vitesse", "9 m"))
            m = re.match(r"\s*(\d+(?:[.,]\d+)?)", v)
            base = float(m.group(1).replace(",", ".")) if m else 9
            nv = base + op["n"]
            txt = (str(int(nv)) if nv == int(nv) else str(nv).replace(".", ",")) + " m"
            S.put("vitesse", re.sub(r"^\s*\d+(?:[.,]\d+)?\s*m", txt, v) if m else txt)
            S.say(f"vitesse {v} → {S.get('vitesse')}")
        elif t == "speedtext":
            v = str(S.get("vitesse", "9 m"))
            if op["add"] not in v:
                S.put("vitesse", f"{v}, {op['add']}")
                S.say(f"vitesse : {S.get('vitesse')}")
        elif t == "gold":
            n = op.get("n") or _r(op["dice"], rolls) * op.get("mul", 1)
            money.set_purse(lambda path, v: S.put(path[0], v), S.c, money.add(money.purse(S.c), {"po": n}))
            S.say(f"+{n:,} po".replace(",", " "))
        elif t == "goldzero":
            S.say(f"bourse : {money.fmt(money.purse(S.c))} → 0 po")
            money.set_purse(lambda path, v: S.put(path[0], v), S.c, {})
        elif t == "cond":
            S.add_cond(op["n"])
        elif t == "exh":
            n = _r(op["dice"], rolls)
            S.put("exhaustion", min(6, int(S.get("exhaustion", 0)) + n))
            S.say(f"épuisement +{n} (niveau {S.get('exhaustion')})")
        elif t == "hp0":
            S.put("hp", 0)
            S.put("deathSaves", {"s": 0, "f": 0})
            S.add_cond("Inconscient")
            S.say("PV à 0 : jets de sauvegarde contre la mort")
        elif t == "fall":
            depth = _r("3d6", rolls) * 3
            dmg = _r(f"{min(20, depth // 3)}d6", rolls)
            S.put("hp", max(0, int(S.get("hp", 0)) - dmg))
            S.add_cond("À terre")
            S.say(f"chute de {depth} m : {dmg} dégâts")
        elif t == "rest":
            S.put("hp", int(S.get("hpMax", 1)))
            S.put("hitDice", int(S.get("niveau", 1)))
            S.put("deathSaves", {"s": 0, "f": 0})
            sc = copy.deepcopy(S.get("spellcasting"))
            if sc:
                for s in (sc.get("slots") or {}).values():
                    s["cur"] = s.get("max", 0)
                S.put("spellcasting", sc)
            res = copy.deepcopy(S.get("resources", []))
            for x in res:
                if x.get("reset") in ("long", "court"):
                    x["cur"] = x.get("max", 0)
            S.put("resources", res)
            S.put("exhaustion", max(0, int(S.get("exhaustion", 0)) - 1))
            S.say("repos long : PV, dés de vie, emplacements et capacités récupérés, épuisement −1")
        elif t == "res":
            n = op.get("n") or _r(op["dice"], rolls)
            S.add_res(op["name"], n, op.get("reset", "aucun"))
        elif t == "feat":
            text = op["text"]
            if op.get("dice"):
                text = text.replace("{roll}", str(_r(op["dice"], rolls)))
            for k, v in choices.items():
                text = text.replace("$" + k, str(v))
            S.add_feat(op["name"], text)
        elif t == "note":
            S.put("notes", (str(S.get("notes", "")) + "\n" + op["text"]).strip())
            S.say("note privée du MJ ajoutée à la fiche")
        elif t == "expert":
            sk = _v(op["sk"], choices)
            if sk not in rules.SKILLS:
                raise FxError("Compétence invalide.")
            prof = int(S.get("prof", 2))
            skills = dict(S.get("skills", {}))
            skills[sk] = rules.mod(int(S.get("stats", {}).get(rules.SKILLS[sk], 10))) + 2 * prof
            S.put("skills", skills)
            S.put("expertise", sorted(set(S.get("expertise", [])) | {sk}))
            S.say(f"maîtrise et expertise : {sk} {'+' if skills[sk] >= 0 else ''}{skills[sk]}")
        elif t == "profs":
            sks = _v(op["sks"], choices)
            sks = sks if isinstance(sks, list) else [sks]
            if not sks or any(sk not in rules.SKILLS for sk in sks):
                raise FxError("Compétences invalides.")
            prof = int(S.get("prof", 2))
            skills = dict(S.get("skills", {}))
            for sk in sks:
                skills[sk] = max(int(skills.get(sk, -99)), rules.mod(int(S.get("stats", {}).get(rules.SKILLS[sk], 10))) + prof)
            S.put("skills", skills)
            S.say("maîtrise : " + ", ".join(sks))
        elif t == "crossroads":
            d20 = _r("1d20", rolls)
            years = _r("1d10", rolls)
            older = d20 % 2 == 0
            S.add_feat("Carrefour", f"Vous avez {'vieilli' if older else 'rajeuni'} de {years} an(s) (d20 : {d20}).")
        elif t == "jester":
            mode = _v(op["mode"], choices)
            if mode == "adv":
                S.add_cond("Bouffon : avantage aux tests de d20 (72 h)")
            elif mode == "cards":
                flags["grant"] = 2
                S.say("deux cartes de plus à tirer")
            else:
                raise FxError("Choix invalide.")
        else:
            raise FxError(f"Opération inconnue : {t}")
    return S, rolls, flags


def apply(A, entry, card, choices):
    """Applies the card to A.c (Action of players.py) and records the result in entry["fx"]."""
    if (entry.get("fx") or {}).get("status") == "done":
        raise FxError("Les effets de ce tirage sont déjà appliqués.")
    if not (card.get("auto") or {}).get("ops"):
        entry["fx"] = {"status": "none"}
        return entry["fx"]
    missing = needs_choice(card, choices)
    if missing:
        entry["fx"] = {"status": "choice"}
        return entry["fx"]
    S, rolls, flags = run(card, A.c, choices)
    undo = {k: copy.deepcopy(A.c.get(k)) for k in S.touched}
    for k in S.touched:
        A.set([k], S.c[k])
    for r in rolls:
        A.log(who=A.c.get("name"), label=f"{card.get('n')} : {r['label']}", expr=r["label"], total=r["total"], detail=r["detail"])
    entry["fx"] = {"status": "done", "changes": S.changes, "undo": undo, "choices": choices, **flags}
    return entry["fx"]


def undo(A, entry):
    fx = entry.get("fx") or {}
    if fx.get("status") != "done":
        raise FxError("Rien à annuler.")
    for k, v in (fx.get("undo") or {}).items():
        A.set([k], v)
    entry["fx"] = {"status": "undone", "changes": fx.get("changes")}
    return entry["fx"]
