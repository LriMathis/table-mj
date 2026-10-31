"""Deck of Many Things tab: the campaign's deck (campaign.json "deck"), player view and player draws.

A campaign gets the tab only if its campaign.json contains a "deck" object:
  cards    card definitions (name, effect, GM notes…)
  inDeck   ids of the cards currently in the deck
  gone     ids of the cards that left the deck for good (Fool, Jester)
  mode     "uniform" (like a shuffled deck) or "d100" (official table, 13- or 22-card deck only)
  access   {charId: {visible, allowed (list or None = whole deck), max, declared, drawn, extra}}
  draws    history, newest first
  announce player draws are shown to the whole table
  felure   campaign track, +1 per draw of one of the 22 cards (+1 more when a card leaves the deck)
"""
import random
import time

from . import deck_fx
from .storage import load_camp

PUBLIC = ("id", "n", "en", "set", "tone", "icon", "flavor", "fx", "extra")
CORE = ("13", "22")
SYS = random.SystemRandom()


def public(c):
    p = {k: c.get(k) for k in PUBLIC if k in c}
    auto = c.get("auto") or {}
    if auto.get("choose"):
        p["choose"] = auto["choose"]
    p["auto"] = bool(auto.get("ops"))
    return p


def fx_public(entry):
    fx = entry.get("fx") or {}
    return {k: fx[k] for k in ("status", "changes", "error") if k in fx}


def by_id(deck):
    return {c["id"]: c for c in deck.get("cards") or [] if c.get("id")}


def official(deck, size):
    sets = ("13",) if size == 13 else CORE
    return {c["id"] for c in deck.get("cards") or [] if c.get("set") in sets}


def pool(deck, allowed=None):
    gone = set(deck.get("gone") or [])
    ids = [i for i in deck.get("inDeck") or [] if i not in gone]
    if allowed is not None:
        allowed = set(allowed)
        ids = [i for i in ids if i in allowed]
    return ids


def pick(deck, ids):
    """Random card among ids -> (card id, d100 roll or None)."""
    if not ids:
        return None, None
    cards = by_id(deck)
    in_deck = set(deck.get("inDeck") or [])
    col = "d13" if in_deck == official(deck, 13) else "d22" if in_deck == official(deck, 22) else None
    if deck.get("mode") == "d100" and col and set(ids) == set(pool(deck)):
        for _ in range(200):
            r = SYS.randint(1, 100)
            hit = next((i for i in ids if cards.get(i, {}).get(col) and cards[i][col][0] <= r <= cards[i][col][1]), None)
            if hit:
                return hit, r
    return SYS.choice(ids), None


def access(deck, cid):
    a = dict((deck.get("access") or {}).get(cid) or {})
    a.setdefault("visible", False)
    a.setdefault("allowed", None)
    a.setdefault("max", 1)
    a.setdefault("declared", None)
    a.setdefault("drawn", 0)
    a.setdefault("extra", 0)
    return a


def remaining(a):
    if a.get("declared") is None:
        return 0
    return max(0, int(a["declared"]) + int(a.get("extra") or 0) - int(a.get("drawn") or 0))


def player_view(camp, me):
    deck = camp.get("deck")
    if not deck or not me:
        return None
    a = access(deck, me)
    if not a["visible"]:
        return None
    cards = by_id(deck)
    ids = pool(deck, a["allowed"])
    mine = [x for x in deck.get("draws") or [] if x.get("whoId") == me and x.get("by") == "player"][:30]
    return {"pool": [public(cards[i]) for i in ids if i in cards],
            "access": {k: a[k] for k in ("max", "declared", "drawn", "extra")}, "remaining": remaining(a),
            "draws": [{"id": x.get("id"), "t": x.get("t"), "used": x.get("used"), "card": public(cards.get(x.get("card"), {})),
                       "fx": fx_public(x), "ended": x.get("ended")} for x in mine]}


# ---------------------------------------------------------------- player actions (Action from players.py)

def _ctx(A, Denied):
    deck = A.camp.get("deck")
    if not deck:
        raise Denied("Cette campagne n'a pas de Jeu.", 404)
    a = access(deck, A.cid)
    if not a["visible"]:
        raise Denied("Le MJ ne vous a pas donné accès au Jeu.")
    return deck, a


def _save(A, deck, a, entry=None):
    A.camp_set(["deck", "access", A.cid], a)
    if entry:
        A.camp_patch("deck-draw", entry=entry)   # merged by id, so a GM draw made meanwhile is kept
        A.camp_set(["deck", "gone"], deck.get("gone") or [])
        A.camp_set(["deck", "felure"], deck.get("felure", 0))


def act_declare(A, d, Denied, esc):
    deck, a = _ctx(A, Denied)
    if a["declared"] is not None and remaining(a) > 0:
        raise Denied("Vous avez déjà annoncé votre tirage : piochez vos cartes.", 409)
    try:
        n = int(d.get("n"))
    except (TypeError, ValueError):
        raise Denied("Nombre invalide.", 400)
    mx = max(1, int(a.get("max") or 1))
    if not 1 <= n <= mx:
        raise Denied(f"Le MJ vous autorise à annoncer entre 1 et {mx} carte(s).", 400)
    a.update(declared=n, drawn=0, extra=0)
    _save(A, deck, a)
    A.info(f"<i class='ico i-joker'></i> <b>{esc(A.c.get('name'))}</b> annonce qu'il va tirer <b>{n}</b> carte(s) du Jeu.",
           secret=not deck.get("announce", True))
    return {"declared": n}


def act_draw(A, d, Denied, esc):
    deck, a = _ctx(A, Denied)
    if a["declared"] is None:
        raise Denied("Annoncez d'abord combien de cartes vous allez tirer.", 409)
    if remaining(a) <= 0:
        raise Denied("Vous avez tiré toutes les cartes annoncées. Le MJ peut vous en autoriser d'autres.", 409)
    cards = by_id(deck)
    cid, roll = pick(deck, pool(deck, a["allowed"]))
    if not cid:
        raise Denied("Il n'y a aucune carte que vous puissiez tirer.", 409)
    c = cards[cid]
    ex = c.get("extra") or {}
    a["drawn"] = int(a["drawn"]) + 1
    entry = {"id": "dr" + format(int(time.time() * 1000), "x") + str(SYS.randint(100, 999)), "card": cid, "who": A.c.get("name"),
             "whoId": A.cid, "by": "player", "t": int(time.time() * 1000), "n": a["drawn"],
             "of": int(a["declared"]) + int(a["extra"]), "roll": roll, "used": False}
    if ex.get("auto"):
        a["extra"] = int(a["extra"]) + int(ex["auto"])
    if ex.get("end"):
        entry["ended"] = remaining(a) > 0
        a["declared"], a["extra"] = a["drawn"], 0
    _auto(A, entry, c, {}, a)
    if c.get("set") in CORE:
        deck["felure"] = min(10, int(deck.get("felure") or 0) + 1)
    if ex.get("gone") and cid not in (deck.get("gone") or []):
        deck.setdefault("gone", []).append(cid)
        deck["felure"] = min(10, int(deck.get("felure") or 0) + 1)
    draws = deck.setdefault("draws", [])
    draws.insert(0, entry)
    del draws[300:]
    _save(A, deck, a, entry)
    A.info(f"<i class='ico i-joker'></i> <b>{esc(A.c.get('name'))}</b> tire une carte du Jeu : <b>{esc(c.get('n'))}</b>"
           + (f" ({entry['n']}/{entry['of']})" if entry["of"] > 1 else ""), secret=not deck.get("announce", True))
    return {"card": public(c), "draw": entry["id"], "remaining": remaining(a), "fx": fx_public(entry), "ended": entry.get("ended")}


def _auto(A, entry, card, choices, a=None):
    """Applies the card's automatic effects to the drawer's sheet; a = access of a player draw (Jester: two more cards)."""
    try:
        fx = deck_fx.apply(A, entry, card, choices)
    except deck_fx.FxError as e:
        entry["fx"] = dict(entry.get("fx") or {}, error=str(e))
        return entry["fx"]
    if fx.get("grant") and a is not None:
        a["extra"] = int(a.get("extra") or 0) + int(fx["grant"])
        entry["used"] = "may"
    if fx.get("status") == "done":
        A.info(f"<i class='ico i-joker'></i> {esc_(A.c.get('name'))} — {esc_(card.get('n'))} : " + esc_(" · ".join(fx.get("changes") or [])), secret=True)
    return fx


def esc_(s):
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def act_fx(A, d, Denied, esc):
    """The player makes the choices asked by the card (Star, Balance…)."""
    deck, a = _ctx(A, Denied)
    entry = next((x for x in deck.get("draws") or [] if x.get("id") == d.get("draw") and x.get("whoId") == A.cid), None)
    if not entry:
        raise Denied("Tirage introuvable.", 404)
    choices = d.get("choices") if isinstance(d.get("choices"), dict) else {}
    fx = _auto(A, entry, by_id(deck).get(entry.get("card"), {}), choices, a)
    if fx.get("error"):
        raise Denied(fx["error"], 400)
    _save(A, deck, a, entry)
    return {"fx": fx_public(entry)}


def gm_fx(Action, d):
    """GM: applies (or undoes) the effects of a draw on the drawer's sheet. -> (code, result)"""
    draw_id = str(d.get("draw", ""))
    entry = next((x for x in (load_camp().get("deck") or {}).get("draws") or [] if x.get("id") == draw_id), None)
    if not entry or not entry.get("whoId"):
        return 404, {"error": "Tirage introuvable, ou tiré par quelqu'un qui n'a pas de fiche."}
    try:
        A = Action(entry["whoId"])
        deck = A.camp.get("deck") or {}
        entry = next(x for x in deck.get("draws") or [] if x.get("id") == draw_id)
        card = by_id(deck).get(entry.get("card"), {})
        a = access(deck, A.cid) if entry.get("by") == "player" else None
        if d.get("undo"):
            deck_fx.undo(A, entry)
            A.info(f"<i class='ico i-joker'></i> Effets de la carte {esc_(card.get('n'))} annulés sur la fiche de {esc_(A.c.get('name'))}.", secret=True)
        else:
            choices = d.get("choices") if isinstance(d.get("choices"), dict) else {}
            fx = _auto(A, entry, card, choices, a)
            if fx.get("error"):
                return 400, {"error": fx["error"]}
        if a is not None:
            A.camp_set(["deck", "access", A.cid], a)
        A.camp_patch("deck-draw", entry=entry)
        r = A.commit()
        return 200, {"ok": True, "rev": r, "fx": entry.get("fx")}
    except deck_fx.FxError as e:
        return 400, {"error": str(e)}


def act_option(A, d, Denied, esc):
    deck, a = _ctx(A, Denied)
    kind = str(d.get("kind", ""))
    entry = next((x for x in deck.get("draws") or [] if x.get("id") == d.get("draw") and x.get("whoId") == A.cid), None)
    if not entry or entry.get("used"):
        raise Denied("Cette option n'est plus disponible.", 409)
    ex = (by_id(deck).get(entry.get("card")) or {}).get("extra") or {}
    who = esc(A.c.get("name"))
    if kind == "may" and ex.get("may"):
        a["extra"] = int(a["extra"]) + int(ex["may"])
        msg = f"<b>{who}</b> choisit de tirer {int(ex['may'])} carte(s) de plus."
    elif kind == "stop" and ex.get("stop"):
        a["declared"], a["extra"] = a["drawn"], 0
        msg = f"<b>{who}</b> choisit d'arrêter de tirer."
    elif kind == "reduce" and ex.get("reduce") and a["declared"] is not None:
        a["declared"] = max(int(a["drawn"]) - int(a["extra"]), int(a["declared"]) - int(ex["reduce"]))
        msg = f"<b>{who}</b> réduit de {int(ex['reduce'])} le nombre de cartes annoncé."
    else:
        raise Denied("Option inconnue.", 400)
    entry["used"] = kind
    _save(A, deck, a, entry)
    A.info("<i class='ico i-joker'></i> " + msg, secret=not deck.get("announce", True))
    return {"remaining": remaining(a)}
