"""HTTP server: pages, game master API (this computer only) and player API (network)."""
import hashlib
import json
import mimetypes
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlparse

from . import campaigns, config, i18n, players, storage
from .config import LOCK
from .i18n import t
from .storage import safe_id, slugify

PLAYER_POST = ("/api/move", "/api/action", "/api/ping", "/api/clientlog")
# a request relayed by a proxy or tunnel is never the game master's, even when it comes from 127.0.0.1
PROXY_HEADERS = ("X-Forwarded-For", "X-Real-IP", "Cf-Connecting-Ip", "Forwarded")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg")


class Handler(BaseHTTPRequestHandler):
    server_version = "GMTable/2.0"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        pass

    def is_local(self):
        if any(self.headers.get(h) for h in PROXY_HEADERS):
            return False
        return self.client_address[0] in config.LOCAL

    def send(self, code, body=b"", ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def error(self, code, msg):
        return self.send(code, {"error": t(msg)})

    def forbidden(self):
        return self.error(403, "Game master only (this computer).")

    def redirect(self, location):
        return self.send(302, b"", extra={"Location": location})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def jbody(self):
        return json.loads(self.body() or b"{}")

    def serve_file(self, base, rel, cache=False):
        path = os.path.realpath(os.path.join(base, rel))
        if not path.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(path):
            return self.error(404, "Not found.")
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith(("javascript", "json")):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            data = f.read()
        self.send(200, data, ctype, extra={"Cache-Control": "max-age=3600"} if cache else None)

    def wrong_campaign(self):
        h = self.headers.get("X-Campaign")
        return bool(h) and h != storage.active()

    def parse_request(self):
        ok = super().parse_request()
        if ok:
            i18n.set_lang(self.headers.get("X-Lang") or self.headers.get("Accept-Language"))
        return ok

    # ------------------------------------------------------------ GET
    def do_GET(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        q = parse_qs(u.query)
        local = self.is_local()
        web = config.WEB
        if p in ("/", "/index.html"):
            if not local:
                return self.redirect("/player")
            return self.serve_file(os.path.join(web, "gm"), "index.html")
        if p in ("/joueurs", "/joueurs/"):   # address used by earlier versions
            return self.redirect("/player" + ("?" + u.query if u.query else ""))
        if p in ("/player", "/player/"):
            return self.serve_file(os.path.join(web, "player"), "index.html")
        if p.startswith("/player/"):
            return self.serve_file(os.path.join(web, "player"), p[len("/player/"):])
        if p.startswith("/shared/"):
            return self.serve_file(os.path.join(web, "shared"), p[len("/shared/"):])
        if p.startswith("/data/images/"):
            return self.serve_file(storage.shared_dir("images"), p[len("/data/images/"):], cache=True)
        me = (q.get("char") or [""])[0]
        if p == "/api/rev":
            with LOCK:
                if me and safe_id(me):
                    players.SEEN[me] = time.time()
                out = {"rev": storage.data_rev(), "camp": storage.active(), "pings": players.pings()}
                if local:
                    out["presence"] = players.presence()
                    out["public"] = config.INFO.get("public")
            return self.send(200, out)
        if p == "/api/player-state":
            with LOCK:
                return self.send(200, players.player_state(me if safe_id(me) else None))
        if not local:
            return self.forbidden()
        if p.startswith("/gm/"):
            return self.serve_file(os.path.join(web, "gm"), p[len("/gm/"):])
        if p == "/api/all":
            with LOCK:
                cid = storage.active()
                return self.send(200, {"rev": storage.data_rev(), "characters": storage.load_chars(),
                                       "monsters": storage.load_mons(), "campaign": storage.load_camp(),
                                       "campaignMeta": storage.meta(cid), "sheetsDir": config.PATHS["sheets"],
                                       "dataDir": config.PATHS["data"]})
        if p == "/api/info":
            return self.send(200, config.INFO)
        if p == "/api/scan":
            return self.send(200, campaigns.scan())
        if p == "/api/campaigns":
            with LOCK:
                return self.send(200, {"active": storage.active(), "list": campaigns.list_all()})
        if p == "/api/backups":
            return self.send(200, storage.list_backups())
        m = re.fullmatch(r"/api/backups/([\w.-]+\.zip)", p)
        if m:
            path = os.path.join(storage.shared_dir("backups"), m.group(1))
            if not os.path.isfile(path):
                return self.error(404, "Not found.")
            with open(path, "rb") as f:
                return self.send(200, f.read(), "application/zip",
                                 extra={"Content-Disposition": f'attachment; filename="{m.group(1)}"'})
        return self.error(404, "Not found.")

    # ------------------------------------------------------------ PUT
    def do_PUT(self):
        if not self.is_local():
            return self.forbidden()
        p = unquote(urlparse(self.path).path)
        try:
            obj = self.jbody()
        except ValueError:
            return self.error(400, "Invalid JSON.")
        base = self.headers.get("X-Base-Rev")
        base = int(base) if base and base.isdigit() else None
        merged = False
        with LOCK:
            m = re.fullmatch(r"/api/campaigns/([^/]+)", p)
            if m and m.group(1) in storage.campaign_ids():
                campaigns.update_meta(m.group(1), obj)
                return self.send(200, {"ok": True})
            if self.wrong_campaign():
                return self.send(409, {"error": t("The active campaign has changed."), "camp": storage.active()})
            m = re.fullmatch(r"/api/(character|monster)/([^/]+)", p)
            if m and safe_id(m.group(2)):
                obj["id"] = m.group(2)
                if m.group(1) == "character":
                    if base is not None:
                        merged = storage.merge_char(obj, base)
                    storage.write_json(storage.char_path(m.group(2)), obj)
                else:
                    storage.write_json(os.path.join(storage.shared_dir("monsters"), m.group(2) + ".json"), obj)
            elif p == "/api/campaign":
                merged = storage.merge_campaign(obj, base if base is not None else 10 ** 30)
                storage.save_camp(obj)
            else:
                return self.error(404, "Unknown request.")
            return self.send(200, {"ok": True, "rev": storage.bump(), "merged": merged})

    # ------------------------------------------------------------ DELETE
    def do_DELETE(self):
        if not self.is_local():
            return self.forbidden()
        p = unquote(urlparse(self.path).path)
        with LOCK:
            m = re.fullmatch(r"/api/campaigns/([^/]+)", p)
            if m and m.group(1) in storage.campaign_ids():
                ok = campaigns.delete(m.group(1))
                return self.send(200, {"ok": True}) if ok else self.error(409, "Cannot delete the active campaign.")
            if self.wrong_campaign():
                return self.error(409, "The active campaign has changed.")
            m = re.fullmatch(r"/api/(character|monster)/([^/]+)", p)
            if not m or not safe_id(m.group(2)):
                return self.error(404, "Unknown request.")
            path = storage.char_path(m.group(2)) if m.group(1) == "character" else \
                os.path.join(storage.shared_dir("monsters"), m.group(2) + ".json")
            try:
                os.remove(path)
            except OSError:
                pass
            storage.bump()
        return self.send(200, {"ok": True})

    # ------------------------------------------------------------ POST
    def do_POST(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        local = self.is_local()
        if not local and p not in PLAYER_POST:
            return self.forbidden()
        if p == "/api/clientlog":
            print("[browser]", self.body().decode(errors="replace")[:2000], file=sys.stderr)
            return self.send(200, {"ok": True})
        if p == "/api/upload":
            raw = self.body()
            name = unquote(self.headers.get("X-Filename") or "image.jpg")
            base, ext = os.path.splitext(os.path.basename(name))
            ext = ext.lower() if ext.lower() in IMAGE_EXT else ".jpg"
            fn = hashlib.sha1(raw).hexdigest()[:10] + "_" + slugify(base)[:40] + ext
            with open(os.path.join(storage.shared_dir("images"), fn), "wb") as f:
                f.write(raw)
            return self.send(200, {"url": "/data/images/" + fn, "name": base})
        try:
            d = self.jbody()
        except ValueError:
            return self.error(400, "Invalid JSON.")
        if not isinstance(d, dict):
            d = {}
        with LOCK:
            if p == "/api/move":
                code, res = players.player_move(d)
                return self.send(code, {"ok": True, "rev": res} if code == 200 else {"error": res})
            if p == "/api/action":
                code, res = players.player_action(d)
                return self.send(code, res)
            if p == "/api/ping":
                who = "GM" if local and not d.get("char") else (d.get("who") or d.get("char") or "?")
                code, res = players.add_ping(d, who)
                return self.send(code, {"ok": code == 200} if code == 200 else {"error": res})
            # --- game master only
            if p == "/api/import":
                names = d.get("names")
                res = campaigns.do_import(names=set(names) if isinstance(names, list) else None, force=bool(d.get("force")))
                storage.bump()
                return self.send(200, res)
            if p == "/api/campaigns":
                cid = campaigns.create(d)
                if d.get("activate"):
                    campaigns.activate(cid)
                return self.send(200, {"ok": True, "id": cid})
            m = re.fullmatch(r"/api/campaigns/([^/]+)/(activate|duplicate)", p)
            if m and m.group(1) in storage.campaign_ids():
                if m.group(2) == "activate":
                    storage.backup("switch")
                    campaigns.activate(m.group(1))
                    return self.send(200, {"ok": True, "rev": storage.data_rev()})
                return self.send(200, {"ok": True, "id": campaigns.duplicate(m.group(1))})
            if p == "/api/backup":
                return self.send(200, {"ok": True, "file": storage.backup("manual")})
        return self.error(404, "Unknown request.")


class PlayerHandler(Handler):
    """Port exposed by the remote-play tunnel: player view only."""

    def is_local(self):
        return False
