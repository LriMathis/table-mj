"""Règles D&D 5e utilisées côté serveur : base de sorts, dés des sorts selon le niveau, bonus des personnages.

La même logique existe côté navigateur (web/commun/sorts.js) pour les jets du MJ.
"""
import json
import os
import re

from . import config
from .stockage import norm

SKILLS = {"Acrobaties": "DEX", "Arcanes": "INT", "Athlétisme": "FOR", "Discrétion": "DEX", "Dressage": "SAG",
          "Escamotage": "DEX", "Histoire": "INT", "Intimidation": "CHA", "Investigation": "INT", "Médecine": "SAG",
          "Nature": "INT", "Perception": "SAG", "Perspicacité": "SAG", "Persuasion": "CHA", "Religion": "INT",
          "Représentation": "CHA", "Survie": "SAG", "Tromperie": "CHA"}
STATS = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"]
STAT_NAMES = {"FOR": "Force", "DEX": "Dextérité", "CON": "Constitution", "INT": "Intelligence", "SAG": "Sagesse", "CHA": "Charisme"}

_DB = {}


def db():
    if not _DB:
        with open(os.path.join(config.WEB, "commun", "sorts.json"), encoding="utf-8") as f:
            _DB.update(json.load(f))
        _DB["index"] = {}
        for k, s in _DB["sorts"].items():
            _DB["index"].setdefault(_key(s["n"]), []).append(k)
    return _DB


def _key(name):
    return re.sub(r"[^a-z0-9]+", " ", norm(name)).strip()


def find_spell(name, level=None):
    """Retrouve un sort de la base à partir du nom écrit sur la fiche (tolère les variantes)."""
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
    """key : init | sk:Perception | ab:FOR | sv:DEX -> (libellé, bonus)."""
    if key == "init":
        return "Initiative", int(c.get("initBonus") or 0)
    k, _, v = key.partition(":")
    if k == "sk" and v in SKILLS:
        return v, skill_bonus(c, v)
    if k == "ab" and v in STATS:
        return "Test de " + STAT_NAMES[v], mod((c.get("stats") or {}).get(v, 10))
    if k == "sv" and v in STATS:
        return "Sauvegarde " + v, save_bonus(c, v)
    return None, 0


def _pick(table, n):
    """Valeur de la table pour le plus grand palier <= n."""
    if not table:
        return None
    keys = sorted(int(k) for k in table)
    best = None
    for k in keys:
        if k <= n:
            best = table[str(k)]
    return best if best is not None else table[str(keys[0])]


def spell_numbers(sp, slot, char_level, ability_mod):
    """Ce que le sort lance concrètement à ce niveau : dégâts, soins, nombre de rayons."""
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
