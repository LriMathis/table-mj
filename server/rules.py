"""D&D 5e rules used by the server: spell database, spell dice by level, character bonuses.

The same logic exists in the browser (web/shared/spells.js) for the game master's rolls.
Ability and skill keys are the French ones stored in character sheets (FOR, SAG, Perception…).
"""
import json
import os
import re

from . import config
from .i18n import lang, t
from .storage import norm

SKILLS = {"Acrobaties": "DEX", "Arcanes": "INT", "Athlétisme": "FOR", "Discrétion": "DEX", "Dressage": "SAG",
          "Escamotage": "DEX", "Histoire": "INT", "Intimidation": "CHA", "Investigation": "INT", "Médecine": "SAG",
          "Nature": "INT", "Perception": "SAG", "Perspicacité": "SAG", "Persuasion": "CHA", "Religion": "INT",
          "Représentation": "CHA", "Survie": "SAG", "Tromperie": "CHA"}
SKILL_EN = {"Acrobaties": "Acrobatics", "Arcanes": "Arcana", "Athlétisme": "Athletics", "Discrétion": "Stealth",
            "Dressage": "Animal Handling", "Escamotage": "Sleight of Hand", "Histoire": "History", "Médecine": "Medicine",
            "Perspicacité": "Insight", "Représentation": "Performance", "Survie": "Survival", "Tromperie": "Deception"}
STATS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"]
STAT_NAMES = {"FOR": "Strength", "DEX": "Dexterity", "CON": "Constitution", "INT": "Intelligence", "SAG": "Wisdom", "CHA": "Charisma"}
STAT_NAMES_FR = {"FOR": "Force", "DEX": "Dextérité", "CON": "Constitution", "INT": "Intelligence", "SAG": "Sagesse", "CHA": "Charisme"}
STAT_ABBR = {"FOR": "STR", "SAG": "WIS"}   # English abbreviations that differ from the stored keys

_DB = {}


def db():
    if not _DB:
        with open(os.path.join(config.WEB, "shared", "spells.json"), encoding="utf-8") as f:
            _DB.update(json.load(f))
        _DB["index"] = {}
        for k, s in _DB["sorts"].items():
            _DB["index"].setdefault(_key(s["n"]), []).append(k)
    return _DB


def _key(name):
    return re.sub(r"[^a-z0-9]+", " ", norm(name)).strip()


def find_spell(name, level=None):
    """Finds a spell from the name written on the sheet (tolerates variants)."""
    d = db()
    k = _key(name)
    if level is not None and f"{k}|{level}" in d["alias"]:
        return d["alias"][f"{k}|{level}"], d["sorts"][d["alias"][f"{k}|{level}"]]
    cands = d["index"].get(k, [])
    if cands:
        best = next((c for c in cands if level is None or d["sorts"][c]["niv"] == int(level)), None)
        if best:
            return best, d["sorts"][best]
    if k in d["alias"]:
        return d["alias"][k], d["sorts"][d["alias"][k]]
    if cands:
        return cands[0], d["sorts"][cands[0]]
    words = k.split()
    while len(words) > 1:
        words.pop()
        c = d["index"].get(" ".join(words))
        if c:
            return c[0], d["sorts"][c[0]]
    return None, None


# ---------------------------------------------------------------- D&D 2024 spell choices at level-up (same tables as web/shared/levelup.js)

FULL24 = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]
HALF24 = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]
T2 = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
T3 = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
RULES24 = {
    "barde": (T2, FULL24, ["Barde"]), "clerc": (T3, FULL24, ["Clerc"]), "druide": (T2, FULL24, ["Druide"]),
    "paladin": (None, HALF24, ["Paladin"]), "rodeur": (None, HALF24, ["Rôdeur"]),
    "ensorceleur": ([4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22], ["Ensorceleur"]),
    "occultiste": (T2, [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15], ["Occultiste"]),
    "magicien": (T3, None, ["Magicien"]),   # spellbook: 2 new spells per level
}
CLASS_PREFIX = [("ensorcel", "ensorceleur"), ("magicien", "magicien"), ("druid", "druide"), ("clerc", "clerc"), ("barde", "barde"),
                ("rodeu", "rodeur"), ("paladin", "paladin"), ("occultiste", "occultiste")]


def class_key(classe):
    s = norm(classe or "")
    for p, k in CLASS_PREFIX:
        if s.startswith(p):
            return k
    if s.startswith("sorci"):
        return "ensorceleur" if re.search(r"lignee|ensorcel|draconi|sauvage", s) else "occultiste"
    return None


def check_spells_2024(c, nc):
    """Error message if a player's level-up adds spells outside the 2024 rules, otherwise None."""
    cls = class_key(c.get("classe"))
    if cls not in RULES24:
        return None
    tours, prep, lists = RULES24[cls]
    n = int(nc.get("niveau") or 1)
    if cls == "barde" and n >= 10:
        lists = ["Barde", "Clerc", "Druide", "Magicien"]
    slots = ((nc.get("spellcasting") or {}).get("slots") or {})
    max_lvl = max([int(k) for k, v in slots.items() if str(k).isdigit() and (v or {}).get("max", 0) > 0] or [0])
    old = {(int(l), x) for l, names in (c.get("spells") or {}).items() for x in names or []}
    new = {(int(l), x) for l, names in (nc.get("spells") or {}).items() for x in names or []}
    added, removed = new - old, old - new
    for lvl, name in added:
        _, sp = find_spell(name, lvl)
        if not sp or not set(sp.get("c24") or []) & set(lists):
            return t("{spell} is not on your class spell list (2024 rules).", spell=name)
        if lvl > max_lvl:
            return t("{spell} is too high a level for you.", spell=name)
    new_cantrips = sum(1 for l, _ in added if l == 0) - sum(1 for l, _ in removed if l == 0)
    new_spells = sum(1 for l, _ in added if l > 0)
    swaps = sum(1 for l, _ in removed if l > 0)
    allowed_c = (tours[n - 1] - tours[n - 2]) if tours and n > 1 else 0
    allowed_s = (prep[n - 1] - prep[n - 2] if prep else 2) + min(swaps, 1)
    if new_cantrips > allowed_c or new_spells > allowed_s or swaps > 1:
        return t("Too many new spells for this level (2024 rules).")
    return None


def attacks_per_action(c):
    """Attacks made with one Attack action (Extra Attack), as web/shared/economy.js."""
    s, n = norm(c.get("classe") or ""), int(c.get("niveau") or 1)
    k = 1
    if s.startswith("guerri"):
        k = 4 if n >= 20 else 3 if n >= 11 else 2 if n >= 5 else 1
    elif s.startswith(("barbare", "moine", "paladin", "rodeu")) and n >= 5:
        k = 2
    for f in c.get("features") or []:
        m = re.match(r"attaque supplementaire(?:\s*\((\d)\))?", norm((f or {}).get("name", "")) if isinstance(f, dict) else "")
        if m:
            k = max(k, int(m.group(1)) + 1 if m.group(1) else 2)
    return k


def cast_kind(sp):
    """Casting time -> 'a' (action), 'b' (bonus action) or 'r' (reaction)."""
    s = norm((sp or {}).get("temps") or "")
    return "b" if "bonus" in s else "r" if "reaction" in s else "a"


def mod(score):
    try:
        return (int(score) - 10) // 2
    except (TypeError, ValueError):
        return 0


def skill_bonus(c, sk):
    sks = c.get("skills") or {}
    if sk in sks and sks[sk] is not None:
        return int(sks[sk])
    return mod((c.get("stats") or {}).get(SKILLS.get(sk, "FOR"), 10))


def save_bonus(c, ab):
    return (mod((c.get("stats") or {}).get(ab, 10)) + (int(c.get("prof") or 0) if ab in (c.get("saves") or []) else 0)
            + int(c.get("saveItemBonus") or 0))   # magic items (cloak / ring of protection…), set by items.apply_inventory


def check_bonus(c, key):
    """key: init | sk:Perception | ab:FOR | sv:DEX -> (label, bonus)."""
    if key == "init":
        return t("Initiative"), int(c.get("initBonus") or 0)
    k, _, v = key.partition(":")
    fr = lang() == "fr"
    if k == "sk" and v in SKILLS:
        return v if fr else SKILL_EN.get(v, v), skill_bonus(c, v)
    if k == "ab" and v in STATS:
        return t("{ability} check", ability=(STAT_NAMES_FR if fr else STAT_NAMES)[v]), mod((c.get("stats") or {}).get(v, 10))
    if k == "sv" and v in STATS:
        return t("{ability} save", ability=v if fr else STAT_ABBR.get(v, v)), save_bonus(c, v)
    return None, 0


def _pick(table, n):
    """Value of the table for the highest step <= n."""
    if not table:
        return None
    keys = sorted(int(k) for k in table)
    best = None
    for k in keys:
        if k <= n:
            best = table[str(k)]
    return best if best is not None else table[str(keys[0])]


def spell_numbers(sp, slot, char_level, ability_mod):
    """What the spell actually rolls at this level: damage, healing, number of rays."""
    out = {}
    lvl = max(int(sp.get("niv") or 0), int(slot or 0))
    rep = lambda e: e.replace("MOD", str(ability_mod)).replace("+-", "-") if e else e
    dm = sp.get("dmg")
    if dm:
        e = _pick(dm.get("parNiv"), char_level) if dm.get("parNiv") else _pick(dm.get("parEmp"), lvl)
        out["dmg"] = {"expr": rep(e), "type": dm.get("type", ""), "estime": bool(dm.get("estime"))}
        if dm.get("plus") and dm["plus"].get("parEmp"):
            out["dmg2"] = {"expr": rep(_pick(dm["plus"]["parEmp"], lvl)), "type": dm["plus"].get("type", "")}
    so = sp.get("soin")
    if so:
        out["soin"] = {"expr": rep(_pick(so.get("parEmp"), lvl)), "temp": bool(so.get("temp"))}
    mu = sp.get("multi")
    if mu:
        n = int(_pick(mu["parNiv"], char_level)) if mu.get("parNiv") else mu.get("base", 1) + mu.get("parEmp", 0) * (lvl - int(sp.get("niv") or 0))
        out["multi"] = {"n": n, "nom": mu.get("nom", "rayon")}
    return out
