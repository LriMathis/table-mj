"""Point d'entrée : python3 table_mj.py [--reseau] [--distance] [--port 8765] [--no-browser]."""
import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer

from . import campagnes, config, distance, stockage
from .web import Handler, PlayerHandler


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


def prepare_data(legacy):
    """Première utilisation : reprend l'ancienne installation, sinon crée une campagne et importe les fiches."""
    if stockage.campaign_ids():
        return
    for old in legacy:
        if old and os.path.isdir(old):
            cid = campagnes.migrate_legacy(old)
            if cid:
                print(f"Ancienne installation reprise : {old}  →  campagne « {stockage.meta(cid)['name']} »")
                return
    cid = campagnes.create({"name": "Ma première campagne"})
    stockage.set_active(cid)
    res = campagnes.do_import(cid=cid)
    if res:
        print("Fiches importées :", ", ".join(r["name"] for r in res))


def autosave_loop():
    """Archive la campagne active toutes les 20 minutes si elle a changé."""
    last = None
    while True:
        time.sleep(1200)
        try:
            with config.LOCK:
                r = (stockage.active(), stockage.data_rev() - stockage.STATE["n"] - stockage.STATE["offset"])
                if r != last:
                    stockage.backup("auto")
                    last = r
        except Exception as e:   # une sauvegarde ratée ne doit jamais arrêter la partie
            print("Sauvegarde automatique impossible :", e, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="Table du Maître du Jeu (D&D 5e)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--reseau", action="store_true", help="ouvre la vue joueurs aux autres appareils du réseau local")
    ap.add_argument("--distance", action="store_true", help="partie à distance : adresse publique https pour les joueurs (tunnel)")
    ap.add_argument("--donnees", default=config.PATHS["donnees"], help="dossier des données (défaut : Dnd/donnees)")
    ap.add_argument("--fiches", default=config.PATHS["fiches"], help="dossier des fiches texte à importer (défaut : Dnd/fiches)")
    ap.add_argument("--ancien", default=None, help="ancien dossier mj_data/ à reprendre au premier lancement")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(line_buffering=True)
    config.PATHS["donnees"] = os.path.abspath(a.donnees)
    config.PATHS["fiches"] = os.path.abspath(a.fiches)
    os.makedirs(config.PATHS["fiches"], exist_ok=True)

    host = "0.0.0.0" if a.reseau else "127.0.0.1"
    try:
        srv = ThreadingHTTPServer((host, a.port), Handler)
    except OSError:
        if already_running(a.port):
            print(f"La Table du MJ tourne déjà sur le port {a.port} : ouverture du navigateur.")
            print("(Pour changer de mode, arrêtez d'abord l'autre instance avec Ctrl+C.)")
            if not a.no_browser:
                webbrowser.open(f"http://127.0.0.1:{a.port}/")
            return
        sys.exit(f"Le port {a.port} est occupé par un autre programme. Essayez : ./lancer_mj.sh --port {a.port + 1}")

    legacy = [a.ancien, os.path.join(config.BASE, "mj_data"), os.path.join(os.path.dirname(config.BASE), "mj_data")]
    with config.LOCK:
        prepare_data(legacy)
        try:
            stockage.backup("demarrage")
        except OSError as e:
            print("Sauvegarde de démarrage impossible :", e, file=sys.stderr)
    threading.Thread(target=autosave_loop, daemon=True).start()

    port = srv.server_address[1]
    if a.distance:
        # second port, local, joueurs seulement : c'est lui que le tunnel expose sur Internet
        psrv = ThreadingHTTPServer(("127.0.0.1", 0), PlayerHandler)
        threading.Thread(target=psrv.serve_forever, daemon=True).start()
        distance.start(psrv.server_address[1])
    config.INFO.update(reseau=a.reseau, distance=a.distance, port=port,
                       urls=[f"http://{ip}:{port}/joueurs" for ip in lan_ips()] if a.reseau else [])
    url = f"http://127.0.0.1:{port}/"
    print(f"Table du MJ : {url}")
    print(f"Campagne active : {stockage.meta(stockage.active())['name']}")
    if a.reseau:
        print("Joueurs — à ouvrir dans leur navigateur (même Wi-Fi / réseau) :")
        for u in config.INFO["urls"] or [f"http://<ip-de-ce-pc>:{port}/joueurs"]:
            print("   ", u)
        print(f"   (si ça ne répond pas : sudo ufw allow {port}/tcp)")
    elif not a.distance:
        print(f"Vue joueurs locale : {url}joueurs   (lancez lancer_reseau.sh pour les autres appareils)")
    if a.distance:
        print("Partie à distance : ouverture du tunnel… l'adresse des joueurs va s'afficher ici (et dans l'onglet Carte).")
    print(f"Données : {config.PATHS['donnees']}  —  Ctrl+C pour quitter")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nAu revoir, MJ !")
