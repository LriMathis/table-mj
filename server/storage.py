"""Data files, active campaign, data revision and merging of player changes.

Layout of data/:
  config.json                      active campaign
  monsters/*.json                  bestiary (shared by all campaigns)
  images/                          maps and portraits (shared)
  campaigns/<id>/meta.json         name, description
  campaigns/<id>/campaign.json     maps, combat, journal, roll history
  campaigns/<id>/characters/       character sheets of this campaign
  campaigns/<id>/snapshots/        one-off copies
  backups/                         automatic .zip archives
  trash/                           deleted campaigns (recoverable)
"""
import json
import os
import re
import time
import unicodedata
import zipfile

from . import config

STATE = {"camp": None, "n": 1, "offset": 0, "last": 0}
PATCHES = []   # changes made by players, replayed on outdated GM saves


# ---------------------------------------------------------------- helpers

def slugify(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s or "x"


def norm(s):
    return unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower().strip()


def safe_id(s):
    return re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", s or "") is not None


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def data_root(*parts):
    return os.path.join(config.PATHS["data"], *parts)


def shared_dir(name):
    p = data_root(name)
    os.makedirs(p, exist_ok=True)
    return p


# ---------------------------------------------------------------- layout of earlier versions

LEGACY_DIRS = {"campagnes": "campaigns", "monstres": "monsters", "sauvegardes-auto": "backups", "corbeille": "trash"}
LEGACY_CAMPAIGN = {"campagne.json": "campaign.json", "personnages": "characters", "sauvegardes": "snapshots"}


def _merge_into(src, dst):
    """Moves src to dst; if dst exists, moves what is missing in it. Never overwrites a file."""
    if not os.path.exists(src):
        return
    if not os.path.exists(dst):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        os.replace(src, dst)
        return
    if os.path.isdir(src) and os.path.isdir(dst):
        for name in os.listdir(src):
            _merge_into(os.path.join(src, name), os.path.join(dst, name))
        try:
            os.rmdir(src)
        except OSError:
            pass


def migrate_layout(legacy_root=None):
    """Renames folders saved by earlier versions (French names) to the current layout."""
    if legacy_root:
        _merge_into(legacy_root, config.PATHS["data"])
    for old, new in LEGACY_DIRS.items():
        _merge_into(data_root(old), data_root(new))
    camps = data_root("campaigns")
    if os.path.isdir(camps):
        for cid in os.listdir(camps):
            for old, new in LEGACY_CAMPAIGN.items():
                _merge_into(os.path.join(camps, cid, old), os.path.join(camps, cid, new))


# ---------------------------------------------------------------- campaigns

def campaigns_dir():
    return shared_dir("campaigns")


def campaign_ids():
    d = campaigns_dir()
    return sorted(x for x in os.listdir(d) if safe_id(x) and os.path.isdir(os.path.join(d, x)))


def active():
    if STATE["camp"] and os.path.isdir(os.path.join(campaigns_dir(), STATE["camp"])):
        return STATE["camp"]
    cfg = read_json(data_root("config.json"), {})
    ids = campaign_ids()
    cid = cfg.get("active") if cfg.get("active") in ids else (ids[0] if ids else None)
    STATE["camp"] = cid
    return cid


def set_active(cid):
    before = data_rev()
    STATE["camp"] = cid
    cfg = read_json(data_root("config.json"), {})
    cfg["active"] = cid
    write_json(data_root("config.json"), cfg)
    PATCHES.clear()
    # the revision must always increase, even if the new campaign is older
    STATE["offset"] = 0
    STATE["offset"] = max(0, before - data_rev()) + 1000


def camp_dir(*parts, cid=None):
    cid = cid or active()
    if not cid:
        raise RuntimeError("no campaign")
    p = os.path.join(campaigns_dir(), cid, *parts)
    os.makedirs(p if not os.path.splitext(p)[1] else os.path.dirname(p), exist_ok=True)
    return p


def campaign_path(cid=None):
    return camp_dir("campaign.json", cid=cid)


def chars_dir(cid=None):
    return camp_dir("characters", cid=cid)


def load_dir(d):
    out = {}
    for fn in sorted(os.listdir(d)):
        if fn.endswith(".json"):
            obj = read_json(os.path.join(d, fn), None)
            if isinstance(obj, dict) and obj.get("id"):
                out[obj["id"]] = obj
    return out


def load_chars(cid=None):
    return load_dir(chars_dir(cid))


def load_mons():
    return load_dir(shared_dir("monsters"))


def load_camp():
    return read_json(campaign_path(), {})


def save_camp(obj):
    write_json(campaign_path(), obj)


def char_path(char_id):
    return os.path.join(chars_dir(), char_id + ".json")


def meta(cid):
    m = read_json(os.path.join(campaigns_dir(), cid, "meta.json"), {})
    m.setdefault("id", cid)
    m.setdefault("name", cid.replace("-", " ").capitalize())
    return m


# ---------------------------------------------------------------- data revision

def data_rev():
    """Revision = latest modification time (µs) + counter, shared between browser tabs."""
    best = 0
    cid = active()
    dirs = [shared_dir("monsters")] + ([chars_dir(cid)] if cid else [])
    for d in dirs:
        for e in os.scandir(d):
            best = max(best, e.stat().st_mtime_ns)
    if cid:
        try:
            best = max(best, os.stat(campaign_path(cid)).st_mtime_ns)
        except OSError:
            pass
    r = best // 1000 + STATE["n"] + STATE["offset"]
    STATE["last"] = max(STATE["last"], r)
    return r


def bump():
    STATE["n"] += 1
    return data_rev()


# ---------------------------------------------------------------- merging player changes

def get_path(o, path):
    for k in path:
        if isinstance(o, list):
            o = o[k] if isinstance(k, int) and 0 <= k < len(o) else None
        elif isinstance(o, dict):
            o = o.get(str(k))
        else:
            return None
        if o is None:
            return None
    return o


def set_path(o, path, v):
    for k in path[:-1]:
        o = o[k] if isinstance(o, list) else o.setdefault(str(k), {})
    last = path[-1]
    if isinstance(o, list):
        if 0 <= last < len(o):
            o[last] = v
    else:
        o[str(last)] = v


def add_patch(kind, rev, **kw):
    PATCHES.append(dict(kw, kind=kind, rev=rev, t=time.time(), camp=active()))


def _prune(base):
    now = time.time()
    PATCHES[:] = [p for p in PATCHES if p["rev"] > base and now - p["t"] < 3600 and p["camp"] == active()]


def merge_campaign(obj, base):
    """The GM sends the whole campaign: replay what players did since the GM last read it."""
    _prune(base)
    merged = False
    for p in PATCHES:
        if p["kind"] == "move":
            for mp in obj.get("maps", []) or []:
                if mp.get("id") != p["map"]:
                    continue
                for t in mp.get("tokens", []) or []:
                    if t.get("id") == p["tok"] and (t.get("x"), t.get("y")) != (p["x"], p["y"]):
                        t["x"], t["y"] = p["x"], p["y"]
                        merged = True
        elif p["kind"] == "log":
            log = obj.setdefault("log", [])
            if not any(e.get("id") == p["entry"]["id"] for e in log):
                log.append(p["entry"])
                log.sort(key=lambda e: -(e.get("t") or 0))
                del log[300:]
                merged = True
        elif p["kind"] == "camp-set":
            if get_path(obj, p["path"]) != p["value"]:
                set_path(obj, p["path"], p["value"])
                merged = True
    return merged


def merge_char(obj, base):
    _prune(base)
    merged = False
    for p in PATCHES:
        if p.get("char") != obj.get("id"):
            continue
        if p["kind"] == "cnum":
            v = get_path(obj, p["path"])
            if isinstance(v, (int, float)):
                nv = v + p["delta"]
                if p.get("lo") is not None:
                    nv = max(p["lo"], nv)
                hi = get_path(obj, p["hi"]) if isinstance(p.get("hi"), list) else p.get("hi")
                if isinstance(hi, (int, float)):
                    nv = min(hi, nv)
                set_path(obj, p["path"], nv)
                merged = True
        elif p["kind"] == "cset":
            if get_path(obj, p["path"]) != p["value"]:
                set_path(obj, p["path"], p["value"])
                merged = True
    return merged


# ---------------------------------------------------------------- automatic backups

def backup(reason="auto", keep=15):
    """.zip archive of the active campaign + bestiary (images excluded: they do not change)."""
    cid = active()
    if not cid:
        return None
    out = shared_dir("backups")
    name = f"{cid}-{time.strftime('%Y%m%d-%H%M%S')}-{reason}.zip"
    path = os.path.join(out, name)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        root = os.path.join(campaigns_dir(), cid)
        for dp, _, files in os.walk(root):
            if os.path.basename(dp) == "snapshots":
                continue
            for fn in files:
                if fn.endswith(".json"):
                    full = os.path.join(dp, fn)
                    z.write(full, os.path.join("campaigns", cid, os.path.relpath(full, root)))
        for fn in os.listdir(shared_dir("monsters")):
            z.write(os.path.join(shared_dir("monsters"), fn), os.path.join("monsters", fn))
    mine = sorted(f for f in os.listdir(out) if f.startswith(cid + "-") and f.endswith(".zip"))
    for f in mine[:-keep]:
        try:
            os.remove(os.path.join(out, f))
        except OSError:
            pass
    return name


def list_backups():
    out = shared_dir("backups")
    res = []
    for f in sorted(os.listdir(out), reverse=True):
        if f.endswith(".zip"):
            st = os.stat(os.path.join(out, f))
            res.append({"file": f, "size": st.st_size, "t": int(st.st_mtime * 1000)})
    return res
