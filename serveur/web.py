"""Serveur HTTP : pages, API du MJ (ce PC uniquement) et API des joueurs (réseau local)."""
import hashlib
import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, unquote, urlparse

from . import campagnes, config, joueurs, stockage
from .config import LOCK
from .stockage import safe_id, slugify

PLAYER_POST = ("/api/move", "/api/action", "/api/ping", "/api/clientlog")
# une requête relayée par un proxy / tunnel n'est jamais celle du MJ, même si elle arrive de 127.0.0.1
PROXY_HEADERS = ("X-Forwarded-For", "X-Real-IP", "Cf-Connecting-Ip", "Forwarded")


class Handler(BaseHTTPRequestHandler):
    server_version = "TableMJ/2.0"
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

    def forbidden(self):
        return self.send(403, {"error": "Réservé au MJ (ce PC)."})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def jbody(self):
        return json.loads(self.body() or b"{}")

    def serve_file(self, base, rel, cache=False):
        path = os.path.realpath(os.path.join(base, rel))
        if not path.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(path):
            return self.send(404, {"error": "introuvable"})
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith(("javascript", "json")):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            data = f.read()
        self.send(200, data, ctype, extra={"Cache-Control": "max-age=3600"} if cache else None)

    def wrong_campaign(self):
        h = self.headers.get("X-Campagne")
        return bool(h) and h != stockage.active()

    # ------------------------------------------------------------ GET
    def do_GET(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        q = parse_qs(u.query)
        local = self.is_local()
        web = config.WEB
        if p in ("/", "/index.html"):
            if not local:
                return self.send(302, b"", extra={"Location": "/joueurs"})
            return self.serve_file(os.path.join(web, "mj"), "index.html")
        if p in ("/joueurs", "/joueurs/"):
            return self.serve_file(os.path.join(web, "joueurs"), "index.html")
        if p.startswith("/joueurs/"):
            return self.serve_file(os.path.join(web, "joueurs"), p[len("/joueurs/"):])
        if p.startswith("/commun/"):
            return self.serve_file(os.path.join(web, "commun"), p[len("/commun/"):])
        if p.startswith("/data/images/"):
            return self.serve_file(stockage.shared_dir("images"), p[len("/data/images/"):], cache=True)
        me = (q.get("char") or [""])[0]
        if p == "/api/rev":
            with LOCK:
                if me and safe_id(me):
                    joueurs.SEEN[me] = __import__("time").time()
                out = {"rev": stockage.data_rev(), "camp": stockage.active(), "pings": joueurs.pings()}
                if local:
                    out["presence"] = joueurs.presence()
                    out["public"] = config.INFO.get("public")
            return self.send(200, out)
        if p == "/api/player-state":
            with LOCK:
                return self.send(200, joueurs.player_state(me if safe_id(me) else None))
        if not local:
            return self.forbidden()
        if p.startswith("/mj/"):
            return self.serve_file(os.path.join(web, "mj"), p[len("/mj/"):])
        if p == "/api/all":
            with LOCK:
                cid = stockage.active()
                return self.send(200, {"rev": stockage.data_rev(), "characters": stockage.load_chars(),
                                       "monsters": stockage.load_mons(), "campaign": stockage.load_camp(),
                                       "campagne": stockage.meta(cid), "root": config.PATHS["fiches"],
                                       "data": config.PATHS["donnees"]})
        if p == "/api/info":
            return self.send(200, config.INFO)
        if p == "/api/scan":
            return self.send(200, campagnes.scan())
        if p == "/api/campagnes":
            with LOCK:
                return self.send(200, {"active": stockage.active(), "list": campagnes.list_all()})
        if p == "/api/sauvegardes":
            return self.send(200, stockage.list_backups())
        m = re.fullmatch(r"/api/sauvegardes/([\w.-]+\.zip)", p)
        if m:
            path = os.path.join(stockage.shared_dir("sauvegardes-auto"), m.group(1))
            if not os.path.isfile(path):
                return self.send(404, {"error": "introuvable"})
            with open(path, "rb") as f:
                return self.send(200, f.read(), "application/zip",
                                 extra={"Content-Disposition": f'attachment; filename="{m.group(1)}"'})
        return self.send(404, {"error": "introuvable"})

    # ------------------------------------------------------------ PUT
    def do_PUT(self):
        if not self.is_local():
            return self.forbidden()
        p = unquote(urlparse(self.path).path)
        try:
            obj = self.jbody()
        except ValueError:
            return self.send(400, {"error": "JSON invalide"})
        base = self.headers.get("X-Base-Rev")
        base = int(base) if base and base.isdigit() else None
        merged = False
        with LOCK:
            m = re.fullmatch(r"/api/campagnes/([^/]+)", p)
            if m and m.group(1) in stockage.campaign_ids():
                campagnes.update_meta(m.group(1), obj)
                return self.send(200, {"ok": True})
            if self.wrong_campaign():
                return self.send(409, {"error": "La campagne active a changé.", "camp": stockage.active()})
            m = re.fullmatch(r"/api/(character|monster)/([^/]+)", p)
            if m and safe_id(m.group(2)):
                obj["id"] = m.group(2)
                if m.group(1) == "character":
                    if base is not None:
                        merged = stockage.merge_char(obj, base)
                    stockage.write_json(stockage.char_path(m.group(2)), obj)
                else:
                    stockage.write_json(os.path.join(stockage.shared_dir("monstres"), m.group(2) + ".json"), obj)
            elif p == "/api/campaign":
                merged = stockage.merge_campaign(obj, base if base is not None else 10 ** 30)
                stockage.save_camp(obj)
            else:
                return self.send(404, {"error": "inconnu"})
            return self.send(200, {"ok": True, "rev": stockage.bump(), "merged": merged})

    # ------------------------------------------------------------ DELETE
    def do_DELETE(self):
        if not self.is_local():
            return self.forbidden()
        p = unquote(urlparse(self.path).path)
        with LOCK:
            m = re.fullmatch(r"/api/campagnes/([^/]+)", p)
            if m and m.group(1) in stockage.campaign_ids():
                ok = campagnes.delete(m.group(1))
                return self.send(200 if ok else 409, {"ok": ok} if ok else {"error": "Impossible de supprimer la campagne active."})
            if self.wrong_campaign():
                return self.send(409, {"error": "La campagne active a changé."})
            m = re.fullmatch(r"/api/(character|monster)/([^/]+)", p)
            if not m or not safe_id(m.group(2)):
                return self.send(404, {"error": "inconnu"})
            path = stockage.char_path(m.group(2)) if m.group(1) == "character" else \
                os.path.join(stockage.shared_dir("monstres"), m.group(2) + ".json")
            try:
                os.remove(path)
            except OSError:
                pass
            stockage.bump()
        return self.send(200, {"ok": True})

    # ------------------------------------------------------------ POST
    def do_POST(self):
        u = urlparse(self.path)
        p = unquote(u.path)
        local = self.is_local()
        if not local and p not in PLAYER_POST:
            return self.forbidden()
        if p == "/api/clientlog":
            print("[navigateur]", self.body().decode(errors="replace")[:2000], file=sys.stderr)
            return self.send(200, {"ok": True})
        if p == "/api/upload":
            raw = self.body()
            name = unquote(self.headers.get("X-Filename") or "image.jpg")
            base, ext = os.path.splitext(os.path.basename(name))
            ext = ext.lower() if ext.lower() in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg") else ".jpg"
            fn = hashlib.sha1(raw).hexdigest()[:10] + "_" + slugify(base)[:40] + ext
            with open(os.path.join(stockage.shared_dir("images"), fn), "wb") as f:
                f.write(raw)
            return self.send(200, {"url": "/data/images/" + fn, "name": base})
        try:
            d = self.jbody()
        except ValueError:
            return self.send(400, {"error": "JSON invalide"})
        if not isinstance(d, dict):
            d = {}
        with LOCK:
            if p == "/api/move":
                code, res = joueurs.player_move(d)
                return self.send(code, {"ok": True, "rev": res} if code == 200 else {"error": res})
            if p == "/api/action":
                code, res = joueurs.player_action(d)
                return self.send(code, res)
            if p == "/api/ping":
                who = "MJ" if local and not d.get("char") else (d.get("who") or d.get("char") or "?")
                code, res = joueurs.add_ping(d, who)
                return self.send(code, {"ok": code == 200} if code == 200 else {"error": res})
            # --- MJ uniquement
            if p == "/api/import":
                names = d.get("names")
                res = campagnes.do_import(names=set(names) if isinstance(names, list) else None, force=bool(d.get("force")))
                stockage.bump()
                return self.send(200, res)
            if p == "/api/campagnes":
                cid = campagnes.create(d)
                if d.get("activate"):
                    campagnes.activate(cid)
                return self.send(200, {"ok": True, "id": cid})
            m = re.fullmatch(r"/api/campagnes/([^/]+)/(activer|dupliquer)", p)
            if m and m.group(1) in stockage.campaign_ids():
                if m.group(2) == "activer":
                    stockage.backup("changement")
                    campagnes.activate(m.group(1))
                    return self.send(200, {"ok": True, "rev": stockage.data_rev()})
                return self.send(200, {"ok": True, "id": campagnes.duplicate(m.group(1))})
            if p == "/api/sauvegarde":
                return self.send(200, {"ok": True, "file": stockage.backup("manuelle")})
        return self.send(404, {"error": "inconnu"})


class PlayerHandler(Handler):
    """Port ouvert au tunnel de la partie à distance : vue joueurs uniquement."""

    def is_local(self):
        return False
