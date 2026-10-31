"""Items: catalog and inventory rules, same as web/shared/items.js (armor class, weapon attacks, attunement).

Catalog: data/catalog/items.json (classic equipment + magic items) and data/items/*.json (the GM's own items).
"""
import os

from . import rules, storage

MAX_ATTUNED = 3
_CACHE = {"mtime": None, "by_id": {}}


def catalog():
    """Catalog by id (official items, reloaded when the file changes, + the GM's items)."""
    path = os.path.join(storage.shared_dir("catalog"), "items.json")
    try:
        mt = os.stat(path).st_mtime_ns
    except OSError:
        mt = None
    if mt != _CACHE["mtime"]:
        _CACHE["by_id"] = {x["id"]: x for x in storage.read_json(path, []) or []}
        _CACHE["mtime"] = mt
    out = dict(_CACHE["by_id"])
    out.update(storage.load_dir(storage.shared_dir("items")))
    return out


def view(e, cat):
    d = cat.get(e.get("ref")) or {}
    base = cat.get(e.get("base") or d.get("base")) or {}
    v = dict(d)
    v.update(e)
    v["name"] = e.get("name") or d.get("name") or "?"
    v["kind"] = d.get("kind") or e.get("kind") or "gear"
    v["weapon"] = e.get("weapon") or d.get("weapon") or base.get("weapon")
    v["armor"] = e.get("armor") or d.get("armor") or base.get("armor")
    v["mech"] = dict(d.get("mech") or {}, **(e.get("mech") or {}))
    v["attune"] = e["attune"] if e.get("attune") is not None else d.get("attune", False)
    return v


def active(v):
    return bool(v.get("equipped")) and (not v.get("attune") or bool(v.get("attuned")))


def is_armor(v):
    return bool(v.get("armor")) and v["armor"].get("type") != "shield"


def is_shield(v):
    return bool(v.get("armor")) and v["armor"].get("type") == "shield"


def compute_ac(c, cat):
    inv = [view(e, cat) for e in c.get("inventory") or []]
    st = c.get("stats") or {}
    m = lambda s: rules.mod(st.get(s, 10))
    armor = next((v for v in inv if v.get("equipped") and is_armor(v)), None)
    shield = next((v for v in inv if v.get("equipped") and is_shield(v)), None)
    if armor:
        a = armor["armor"]
        dex = m("DEX") if a.get("type") == "light" else min(m("DEX"), a.get("dexMax") if a.get("dexMax") is not None else 2) if a.get("type") == "medium" else 0
        ac = int(a.get("base") or 10) + dex + (int(armor["mech"].get("ac") or 0) if active(armor) else 0)
    else:
        cls = storage.norm(c.get("classe") or "")
        feats = [storage.norm((f or {}).get("name", "")) for f in c.get("features") or [] if isinstance(f, dict)]
        if cls.startswith("barbare") or any(f.startswith("defense sans armure") for f in feats) and not cls.startswith("moine"):
            ac = 10 + m("DEX") + m("CON")
        elif cls.startswith("moine") and not shield:
            ac = 10 + m("DEX") + m("SAG")
        else:
            ac = 10 + m("DEX")
    if shield:
        ac += 2 + (int(shield["mech"].get("ac") or 0) if active(shield) else 0)
    for v in inv:
        if v is armor or v is shield or not active(v) or not v["mech"].get("ac") or is_armor(v) or is_shield(v):
            continue
        if v["mech"].get("noArmor") and (armor or shield):
            continue
        ac += int(v["mech"]["ac"])
    return ac


def weapon_attack(c, v):
    w, st = v["weapon"], c.get("stats") or {}
    m = lambda s: rules.mod(st.get(s, 10))
    ab = ("DEX" if m("DEX") > m("FOR") else "FOR") if w.get("finesse") else "DEX" if w.get("melee") is False else "FOR"
    mg = v["mech"] if active(v) else {}
    am = m(ab)
    bonus = int(c.get("prof") or 2) + am + int(mg.get("atk") or 0)
    db = am + int(mg.get("dmg") or 0)
    typ = w.get("type", "") + (f" (deux mains {w['versatile']})" if w.get("versatile") else "")
    return {"name": v["name"], "bonus": bonus, "damage": w.get("dmg", "") + (f"{db:+d}" if db else ""), "type": typ, "item": v.get("uid"), "auto": True}


def apply_inventory(c):
    """Automatic attacks, armor class and save bonus from the inventory (manual attacks and caManual are kept)."""
    cat = catalog()
    inv = [view(e, cat) for e in c.get("inventory") or []]
    manual = [a for a in c.get("attacks") or [] if not a.get("auto")]
    linked = {a.get("item") for a in manual if a.get("item")}
    auto = [weapon_attack(c, v) for v in inv if v.get("equipped") and v.get("weapon") and v.get("uid") not in linked]
    c["attacks"] = manual + auto
    c["saveItemBonus"] = sum(int(v["mech"].get("save") or 0) for v in inv if active(v))
    c["ca"] = int(c["caManual"]) if c.get("caManual") not in (None, "") else compute_ac(c, cat)
    return c
