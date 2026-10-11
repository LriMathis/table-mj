"""Several campaigns, each with its own characters, maps, combat and journal."""
import os
import shutil
import time

from . import config, sheets, storage
from .i18n import t
from .storage import campaigns_dir, read_json, safe_id, slugify, write_json


def summary(cid):
    m = storage.meta(cid)
    chars = storage.load_chars(cid)
    camp = read_json(storage.campaign_path(cid), {})
    try:
        last = max([os.stat(storage.campaign_path(cid)).st_mtime] +
                   [os.stat(os.path.join(storage.chars_dir(cid), f)).st_mtime for f in os.listdir(storage.chars_dir(cid))])
    except OSError:
        last = 0
    return {"id": cid, "name": m.get("name"), "desc": m.get("desc", ""),
            "cover": m.get("cover") or next((x.get("url") for x in camp.get("maps") or [] if x.get("url")), ""),
            "created": m.get("created"), "last": int(last * 1000), "active": cid == storage.active(),
            "maps": len(camp.get("maps") or []), "notes": len((camp.get("journal") or {}).get("notes") or []),
            "encounters": len(camp.get("encounters") or []),
            "characters": [{"id": c["id"], "name": c.get("name"), "portrait": c.get("portrait", ""), "niveau": c.get("niveau"),
                            "classe": c.get("classe", ""), "color": c.get("color", "")} for c in chars.values()]}


def list_all():
    return [summary(c) for c in storage.campaign_ids()]


def unique_id(name):
    base = slugify(name)[:50] or "campaign"
    cid, i = base, 2
    while os.path.exists(os.path.join(campaigns_dir(), cid)):
        cid, i = f"{base}-{i}", i + 1
    return cid


def create(d):
    name = str(d.get("name") or t("New campaign")).strip()[:80]
    cid = unique_id(name)
    write_json(os.path.join(campaigns_dir(), cid, "meta.json"),
               {"id": cid, "name": name, "desc": str(d.get("desc", ""))[:2000], "created": int(time.time() * 1000)})
    write_json(storage.campaign_path(cid), {"log": [], "journal": {"notes": [], "quests": [], "npcs": []},
                                            "combat": {"active": False, "round": 0, "turn": 0, "list": []},
                                            "maps": [], "currentMap": None, "seeded": True, "encounters": [], "settings": {}})
    os.makedirs(storage.chars_dir(cid), exist_ok=True)
    # characters copied from another campaign
    src = d.get("copyFrom") or {}
    if safe_id(src.get("campaign")) and src.get("campaign") in storage.campaign_ids():
        theirs = storage.load_chars(src["campaign"])
        for ch in src.get("chars") or []:
            if ch in theirs:
                c = theirs[ch]
                if d.get("resetChars"):
                    c.update(hp=c.get("hpMax", c.get("hp")), hpTemp=0, conditions=[], deathSaves={"s": 0, "f": 0}, concentration=None)
                write_json(os.path.join(storage.chars_dir(cid), ch + ".json"), c)
    # characters imported from text sheets
    names = set(d.get("sheets") or [])
    if names:
        do_import(cid=cid, names=names)
    return cid


def activate(cid):
    if cid not in storage.campaign_ids():
        return False
    storage.set_active(cid)
    return True


def update_meta(cid, d):
    p = os.path.join(campaigns_dir(), cid, "meta.json")
    m = storage.meta(cid)
    for k in ("name", "desc", "cover"):
        if k in d:
            m[k] = str(d[k])[:2000]
    write_json(p, m)


def duplicate(cid):
    m = storage.meta(cid)
    name = t("{name} (copy)", name=m.get("name", cid))
    nid = unique_id(name)
    shutil.copytree(os.path.join(campaigns_dir(), cid), os.path.join(campaigns_dir(), nid),
                    ignore=shutil.ignore_patterns("snapshots"))
    m.update(id=nid, name=name, created=int(time.time() * 1000))
    write_json(os.path.join(campaigns_dir(), nid, "meta.json"), m)
    return nid


def delete(cid):
    """Nothing is deleted for good: the campaign is moved to data/trash/."""
    if cid == storage.active():
        return False
    trash = storage.shared_dir("trash")
    shutil.move(os.path.join(campaigns_dir(), cid), os.path.join(trash, f"{cid}-{time.strftime('%Y%m%d-%H%M%S')}"))
    return True


# fields kept from the existing character when a sheet is imported again
KEEP_ON_REIMPORT = ("hp", "hpTemp", "xp", "niveau", "conditions", "deathSaves", "notes", "playerNotes",
                    "portrait", "color", "player", "gold", "exhaustion", "hitDice", "name", "concentration")


def do_import(cid=None, names=None, force=False):
    cdir = storage.chars_dir(cid)
    done = []
    for c in sheets.scan_sheets(config.PATHS["sheets"]):
        if names is not None and c["name"] not in names:
            continue
        path = os.path.join(cdir, c["id"] + ".json")
        if os.path.exists(path):
            if not force:
                done.append({"name": c["name"], "status": t("already present"), "source": c["source"]})
                continue
            old = read_json(path, {})
            for k in KEEP_ON_REIMPORT:
                if k in old:
                    c[k] = old[k]
            status = t("updated")
        else:
            status = t("imported")
        write_json(path, c)
        done.append({"name": c["name"], "status": status, "source": c["source"]})
    return done


def scan():
    return [{"name": c["name"], "source": c["source"], "classe": c.get("classe", ""), "niveau": c.get("niveau")}
            for c in sheets.scan_sheets(config.PATHS["sheets"])]
