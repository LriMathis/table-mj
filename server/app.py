"""Entry point: python3 main.py [--lan] [--remote] [--port 8765] [--no-browser]."""
import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer

from . import campaigns, config, storage, tunnel
from .i18n import t
from .web import Handler, PlayerHandler

AUTOSAVE_SECONDS = 1200


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            ips.add(ip)
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def already_running(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1) as s:
            s.sendall(b"GET /api/rev HTTP/1.0\r\nHost: x\r\n\r\n")
            data = b""
            while len(data) < 65536:
                chunk = s.recv(4096)
                if not chunk:
                    break
                data += chunk
            return b'"rev"' in data
    except OSError:
        return False


def prepare_data():
    """First run: creates a campaign and imports the character sheets."""
    if storage.campaign_ids():
        return
    cid = campaigns.create({"name": t("My first campaign")})
    storage.set_active(cid)
    res = campaigns.do_import(cid=cid)
    if res:
        print("Imported sheets:", ", ".join(r["name"] for r in res))


def autosave_loop():
    """Archives the active campaign every 20 minutes if it changed."""
    last = None
    while True:
        time.sleep(AUTOSAVE_SECONDS)
        try:
            with config.LOCK:
                r = (storage.active(), storage.data_rev() - storage.STATE["n"] - storage.STATE["offset"])
                if r != last:
                    storage.backup("auto")
                    last = r
        except Exception as e:   # a failed backup must never stop the game
            print("Automatic backup failed:", e, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="GM Table (D&D 5e)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--lan", action="store_true", help="open the player view to other devices on the local network")
    ap.add_argument("--remote", action="store_true", help="remote play: public HTTPS address for players (tunnel)")
    ap.add_argument("--data", default=config.PATHS["data"], help="data folder (default: ./data)")
    ap.add_argument("--sheets", default=config.PATHS["sheets"], help="folder of text character sheets to import (default: ./sheets)")
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    default_data = os.path.abspath(a.data) == os.path.abspath(config.PATHS["data"])
    config.PATHS["data"] = os.path.abspath(a.data)
    config.PATHS["sheets"] = os.path.abspath(a.sheets)
    os.makedirs(config.PATHS["sheets"], exist_ok=True)

    host = "0.0.0.0" if a.lan else "127.0.0.1"
    try:
        srv = ThreadingHTTPServer((host, a.port), Handler)
    except OSError:
        if already_running(a.port):
            print(f"GM Table is already running on port {a.port}: opening the browser.")
            print("(To change mode, stop the other instance first with Ctrl+C.)")
            if not a.no_browser:
                webbrowser.open(f"http://127.0.0.1:{a.port}/")
            return
        sys.exit(f"Port {a.port} is used by another program. Try: ./start.sh --port {a.port + 1}")

    with config.LOCK:
        # folders saved by earlier versions (donnees/, campagnes/…) are renamed, never overwritten
        storage.migrate_layout(os.path.join(config.BASE, "donnees") if default_data else None)
        prepare_data()
        try:
            storage.backup("startup")
        except OSError as e:
            print("Startup backup failed:", e, file=sys.stderr)
    threading.Thread(target=autosave_loop, daemon=True).start()

    port = srv.server_address[1]
    if a.remote:
        # second, local, player-only port: this is the one the tunnel exposes on the internet
        psrv = ThreadingHTTPServer(("127.0.0.1", 0), PlayerHandler)
        threading.Thread(target=psrv.serve_forever, daemon=True).start()
        tunnel.start(psrv.server_address[1])
    config.INFO.update(lan=a.lan, remote=a.remote, port=port,
                       urls=[f"http://{ip}:{port}/player" for ip in lan_ips()] if a.lan else [])
    url = f"http://127.0.0.1:{port}/"
    print(f"GM Table: {url}")
    print(f"Active campaign: {storage.meta(storage.active())['name']}")
    if a.lan:
        print("Players — open in their browser (same Wi-Fi / network):")
        for u in config.INFO["urls"] or [f"http://<this-computer-ip>:{port}/player"]:
            print("   ", u)
        print(f"   (if it does not respond: sudo ufw allow {port}/tcp)")
    elif not a.remote:
        print(f"Local player view: {url}player   (use start-lan.sh or start-remote.sh for other devices)")
    if a.remote:
        print("Remote play: opening the tunnel… the player address will appear here (and in the Map tab).")
    print(f"Data: {config.PATHS['data']}  —  Ctrl+C to quit")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nGoodbye!")
