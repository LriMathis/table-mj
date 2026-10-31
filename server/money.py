"""Money: a character's purse of real coins (same rules as web/shared/money.js).

c["purse"] = {"pp": platinum, "po": gold, "pa": silver, "pc": copper} (whole coins).
Rates of the rules: 10 pc = 1 pa, 10 pa = 1 po, 10 po = 1 pp.
c["gold"] stays the total value in gold pieces (old sheets, summaries): it is updated with the purse.
Prices are stored in gold pieces (12.5 = 12 po 5 pa) and handled in copper.
"""
import math

COINS = ("pp", "po", "pa", "pc")          # largest first
CP = {"pp": 1000, "po": 100, "pa": 10, "pc": 1}
NAMES = {"pp": "pp", "po": "po", "pa": "pa", "pc": "pc"}


def to_cp(gp):
    return int(math.floor(float(gp or 0) * 100 + .5))


def purse(c):
    """Purse of a character (built from the old single gold value when the sheet has none)."""
    p = c.get("purse")
    if isinstance(p, dict):
        return {k: max(0, int(p.get(k) or 0)) for k in COINS}
    cp = max(0, to_cp(c.get("gold") or 0))
    return {"pp": 0, "po": cp // 100, "pa": cp % 100 // 10, "pc": cp % 10}


def total_cp(p):
    return sum(int(p.get(k) or 0) * CP[k] for k in COINS)


def gp_value(p):
    return round(total_cp(p) / 100, 2)


def coins_for(cp, coins=("po", "pa", "pc")):
    """Copper amount -> coins, largest first (a merchant does not pay in platinum)."""
    out = {k: 0 for k in COINS}
    for k in coins:
        out[k], cp = divmod(cp, CP[k])
    out["pc"] += cp
    return out


def add(p, q):
    return {k: int(p.get(k) or 0) + int(q.get(k) or 0) for k in COINS}


def pay(p, cost):
    """Pays cost (copper) from purse p: exact coins when possible, otherwise one bigger coin and the change.
    -> (new purse, coins given, change) or None when the purse is not enough."""
    p = {k: int(p.get(k) or 0) for k in COINS}
    if total_cp(p) < cost:
        return None
    given, rem = {k: 0 for k in COINS}, cost
    for k in COINS:   # with 1/10/100/1000 coins, this finds an exact payment whenever there is one
        use = min(p[k], rem // CP[k])
        given[k] += use
        p[k] -= use
        rem -= use * CP[k]
    change = {k: 0 for k in COINS}
    while rem > 0:   # one coin bigger than what is left, then the merchant gives the change
        k = next((k for k in reversed(COINS) if p[k] > 0 and CP[k] >= rem), None)
        if k is None:   # only small coins left that do not cover it alone: add them up
            k = next(k for k in reversed(COINS) if p[k] > 0)
        p[k] -= 1
        given[k] += 1
        if CP[k] >= rem:
            change = coins_for(CP[k] - rem, [c for c in COINS if CP[c] < CP[k]])
            rem = 0
        else:
            rem -= CP[k]
    return add(p, change), given, change


def fmt(p):
    parts = [f"{int(p.get(k) or 0):,} {NAMES[k]}".replace(",", " ") for k in COINS if p.get(k)]
    return " ".join(parts) or "0 po"


def fmt_cp(cp):
    return fmt(coins_for(cp))


def set_purse(setter, c, p):
    """Stores the purse and the matching total (setter: Action.set or a Sheet.put)."""
    p = {k: max(0, int(p.get(k) or 0)) for k in COINS}
    c["purse"] = p
    c["gold"] = gp_value(p)
    setter(["purse"], p)
    setter(["gold"], c["gold"])
    return p


def act_change(A, d, Denied):
    """The player changes coins (e.g. 1 po -> 10 pa, or 100 pa -> 10 po)."""
    src, dst = str(d.get("from") or ""), str(d.get("to") or "")
    if src not in CP or dst not in CP or src == dst:
        raise Denied("Change invalide.", 400)
    try:
        n = int(d.get("n") or 0)
    except (TypeError, ValueError):
        raise Denied("Nombre invalide.", 400)
    p = purse(A.c)
    if not 1 <= n <= p[src]:
        raise Denied(f"Vous n'avez que {p[src]} {NAMES[src]}.", 409)
    value = n * CP[src]
    if value % CP[dst]:
        raise Denied(f"{n} {NAMES[src]} ne font pas un nombre entier de {NAMES[dst]} (1 {NAMES[dst]} = {CP[dst] // CP[src] if CP[dst] > CP[src] else 1} {NAMES[src]}).", 400)
    p[src] -= n
    p[dst] += value // CP[dst]
    set_purse(A.set, A.c, p)
    who = str(A.c.get("name") or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    A.info(f"<i class='ico i-purse'></i> <b>{who}</b> change {n} {NAMES[src]} contre {value // CP[dst]} {NAMES[dst]}.", secret=True)
    return {"purse": p}
