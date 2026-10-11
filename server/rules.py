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
    return mod((c.get("stats") or {}).get(ab, 10)) + (int(c.get("prof") or 0) if ab in (c.get("saves") or []) else 0)


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
