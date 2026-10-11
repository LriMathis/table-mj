"""Gestion de plusieurs campagnes (chacune avec ses personnages, cartes, combat et journal)."""
import os
import re
import shutil
import time

from . import config, fiches, stockage
from .stockage import campaigns_dir, read_json, safe_id, slugify, write_json


def summary(cid):
    m = stockage.meta(cid)
    chars = stockage.load_chars(cid)
    camp = read_json(stockage.campaign_path(cid), {})
    try:
        last = max([os.stat(stockage.campaign_path(cid)).st_mtime] +
                   [os.stat(os.path.join(stockage.chars_dir(cid), f)).st_mtime for f in os.listdir(stockage.chars_dir(cid))])
    except OSError:
        last = 0
    return {"id": cid, "name": m.get("name"), "desc": m.get("desc", ""), "cover": m.get("cover") or next((x.get("url") for x in camp.get("maps") or [] if x.get("url")), ""), "created": m.get("created"),
            "last": int(last * 1000), "active": cid == stockage.active(),
            "maps": len(camp.get("maps") or []), "notes": len((camp.get("journal") or {}).get("notes") or []),
            "encounters": len(camp.get("encounters") or []),
            "characters": [{"id": c["id"], "name": c.get("name"), "portrait": c.get("portrait", ""), "niveau": c.get("niveau"),
                            "classe": c.get("classe", ""), "color": c.get("color", "")} for c in chars.values()]}


def list_all():
    return [summary(c) for c in stockage.campaign_ids()]


def unique_id(name):
    base = slugify(name)[:50] or "campagne"
    cid, i = base, 2
    while os.path.exists(os.path.join(campaigns_dir(), cid)):
        cid, i = f"{base}-{i}", i + 1
    return cid


def create(d):
    name = str(d.get("name") or "Nouvelle campagne").strip()[:80]
    cid = unique_id(name)
    write_json(os.path.join(campaigns_dir(), cid, "meta.json"),
               {"id": cid, "name": name, "desc": str(d.get("desc", ""))[:2000], "created": int(time.time() * 1000)})
    write_json(stockage.campaign_path(cid), {"log": [], "journal": {"notes": [], "quests": [], "npcs": []},
                                             "combat": {"active": False, "round": 0, "turn": 0, "list": []},
                                             "maps": [], "currentMap": None, "seeded": True, "encounters": [], "settings": {}})
    os.makedirs(stockage.chars_dir(cid), exist_ok=True)
    # personnages copiés d'une autre campagne
    src = d.get("copyFrom") or {}
    if safe_id(src.get("campagne")) and src.get("campagne") in stockage.campaign_ids():
        theirs = stockage.load_chars(src["campagne"])
        for ch in src.get("chars") or []:
            if ch in theirs:
                c = theirs[ch]
                if d.get("resetChars"):
                    c.update(hp=c.get("hpMax", c.get("hp")), hpTemp=0, conditions=[], deathSaves={"s": 0, "f": 0}, concentration=None)
                write_json(os.path.join(stockage.chars_dir(cid), ch + ".json"), c)
    # personnages importés depuis les fiches texte
    names = set(d.get("sheets") or [])
    if names:
        do_import(cid=cid, names=names)
    return cid


def activate(cid):
    if cid not in stockage.campaign_ids():
        return False
    stockage.set_active(cid)
    return True


def update_meta(cid, d):
    p = os.path.join(campaigns_dir(), cid, "meta.json")
    m = stockage.meta(cid)
    for k in ("name", "desc", "cover"):
        if k in d:
            m[k] = str(d[k])[:2000]
    write_json(p, m)


def duplicate(cid):
    m = stockage.meta(cid)
    nid = unique_id(m.get("name", cid) + " copie")
    shutil.copytree(os.path.join(campaigns_dir(), cid), os.path.join(campaigns_dir(), nid),
                    ignore=shutil.ignore_patterns("sauvegardes"))
    m.update(id=nid, name=m.get("name", cid) + " (copie)", created=int(time.time() * 1000))
    write_json(os.path.join(campaigns_dir(), nid, "meta.json"), m)
    return nid


def delete(cid):
    """Ne supprime rien définitivement : la campagne part dans donnees/corbeille/."""
    if cid == stockage.active():
        return False
    trash = stockage.shared_dir("corbeille")
    shutil.move(os.path.join(campaigns_dir(), cid), os.path.join(trash, f"{cid}-{time.strftime('%Y%m%d-%H%M%S')}"))
    return True


def do_import(cid=None, names=None, force=False):
    cdir = stockage.chars_dir(cid)
    done = []
    for c in fiches.scan_sheets(config.PATHS["fiches"]):
        if names is not None and c["name"] not in names:
            continue
        path = os.path.join(cdir, c["id"] + ".json")
        if os.path.exists(path):
            if not force:
                done.append({"name": c["name"], "status": "déjà présent", "source": c["source"]})
                continue
            old = read_json(path, {})
            for k in ("hp", "hpTemp", "xp", "niveau", "conditions", "deathSaves", "notes", "playerNotes",
                      "portrait", "color", "player", "gold", "exhaustion", "hitDice", "name", "concentration"):
                if k in old:
                    c[k] = old[k]
            status = "mis à jour"
        else:
            status = "importé"
        write_json(path, c)
        done.append({"name": c["name"], "status": status, "source": c["source"]})
    return done


def scan():
    return [{"name": c["name"], "source": c["source"], "classe": c.get("classe", ""), "niveau": c.get("niveau")}
            for c in fiches.scan_sheets(config.PATHS["fiches"])]


# ---------------------------------------------------------------- migration de l'ancienne version (mj_data/)

def migrate_legacy(old):
    """Range une ancienne installation (mj_data/) dans la nouvelle arborescence, sans modifier les fichiers."""
    if not os.path.isdir(os.path.join(old, "personnages")) and not os.path.exists(os.path.join(old, "campagne.json")):
        return None
    camp = read_json(os.path.join(old, "campagne.json"), {})
    name = "Ma campagne"
    for e in camp.get("log") or []:
        t = e.get("text") or ""
        if "Campagne installée" in t:
            m = re.search(r"Campagne installée : (.+?)\.?</b>", t)
            if m:
                name = m.group(1).strip().rstrip(".")
    cid = unique_id(name)
    dest = os.path.join(campaigns_dir(), cid)
    os.makedirs(dest, exist_ok=True)
    for sub in ("personnages", "sauvegardes"):
        if os.path.isdir(os.path.join(old, sub)):
            shutil.move(os.path.join(old, sub), os.path.join(dest, sub))
    if os.path.exists(os.path.join(old, "campagne.json")):
        shutil.move(os.path.join(old, "campagne.json"), os.path.join(dest, "campagne.json"))
    for sub in ("monstres", "images"):
        src = os.path.join(old, sub)
        if not os.path.isdir(src):
            continue
        tgt = stockage.shared_dir(sub)
        for fn in os.listdir(src):
            if not os.path.exists(os.path.join(tgt, fn)):
                shutil.move(os.path.join(src, fn), os.path.join(tgt, fn))
    write_json(os.path.join(dest, "meta.json"), {"id": cid, "name": name, "desc": "Campagne reprise de l'ancienne version.",
                                                 "created": int(time.time() * 1000)})
    for dp, _, _ in os.walk(old, topdown=False):
        try:
            os.rmdir(dp)   # uniquement les dossiers devenus vides
        except OSError:
            pass
    if not stockage.active() or stockage.active() == cid:
        stockage.set_active(cid)
    return cid
