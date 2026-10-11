"""Partie à distance : ouvre un tunnel HTTPS public vers la vue joueurs.

Le tunnel pointe vers un second port, local, qui ne sert QUE la vue joueurs :
même si le tunnel arrive depuis 127.0.0.1, personne ne peut obtenir les droits du MJ par là.

Deux fournisseurs, sans compte :
  - cloudflared (téléchargé dans Dnd/outils/ au premier lancement s'il n'est pas installé) :
    https://xxxx.trycloudflare.com
  - en secours, ssh + localhost.run : https://xxxx.lhr.life (moins fiable : les grosses images échouent)
"""
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import threading
import time
import urllib.request

from . import config

PROVIDERS = {
    "cloudflared": r"https://[-a-z0-9]+\.trycloudflare\.com",
    "ssh": r"https://[-a-z0-9]+\.lhr\.life",
}


RELEASES = "https://github.com/cloudflare/cloudflared/releases/latest/download/"


def _cloudflared():
    """cloudflared du système, sinon celui de Dnd/outils/ (téléchargé une fois)."""
    found = shutil.which("cloudflared")
    if found:
        return found
    system, arch = platform.system(), platform.machine().lower()
    arch = "arm64" if arch in ("aarch64", "arm64") else "amd64" if arch in ("x86_64", "amd64") else None
    if not arch:
        return None
    dest = os.path.join(config.BASE, "outils", "cloudflared" + (".exe" if system == "Windows" else ""))
    if os.path.isfile(dest):
        return dest
    name = {"Linux": f"cloudflared-linux-{arch}", "Windows": f"cloudflared-windows-{arch}.exe",
            "Darwin": f"cloudflared-darwin-{arch}.tgz"}.get(system)
    if not name:
        return None
    print("Premier lancement à distance : téléchargement de cloudflared (~40 Mo)…", flush=True)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    try:
        urllib.request.urlretrieve(RELEASES + name, tmp)
        if name.endswith(".tgz"):
            with tarfile.open(tmp) as t:
                member = next(m for m in t.getmembers() if m.name.endswith("cloudflared"))
                with t.extractfile(member) as src, open(dest, "wb") as out:
                    shutil.copyfileobj(src, out)
            os.remove(tmp)
        else:
            os.replace(tmp, dest)
        os.chmod(dest, os.stat(dest).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        return dest
    except Exception as e:
        print("Téléchargement de cloudflared impossible :", e, file=sys.stderr)
        for f in (tmp, dest):
            if os.path.exists(f):
                os.remove(f)
        return None


def _command(port):
    cf = _cloudflared()
    if cf:
        return "cloudflared", [cf, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"]
    ssh = shutil.which("ssh")
    if ssh:
        return "ssh", [ssh, "-T", "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=30",
                       "-o", "ServerAliveCountMax=3", "-o", "ExitOnForwardFailure=yes",
                       "-R", f"80:127.0.0.1:{port}", "nokey@localhost.run"]
    return None, None


def _run(port):
    """Garde le tunnel ouvert ; le relance s'il tombe (l'adresse peut alors changer)."""
    while True:
        name, cmd = _command(port)
        if not cmd:
            print("Partie à distance impossible : installez cloudflared ou ssh.", file=sys.stderr)
            return
        pattern = re.compile(PROVIDERS[name])
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, errors="replace")
        except OSError as e:
            print("Tunnel impossible :", e, file=sys.stderr)
            return
        for line in proc.stdout:
            m = pattern.search(line)
            url = m and m.group(0) + "/joueurs"
            if url and url != config.INFO.get("public"):
                config.INFO["public"] = url
                print()
                print("=" * 64)
                print("  PARTIE À DISTANCE — adresse à envoyer aux joueurs :")
                print("     ", url)
                print("=" * 64, flush=True)
        proc.wait()
        config.INFO["public"] = None
        print("Tunnel coupé, nouvelle tentative dans 5 s… (l'adresse des joueurs va changer)", file=sys.stderr)
        time.sleep(5)


def start(player_port):
    config.INFO["public"] = None
    threading.Thread(target=_run, args=(player_port,), daemon=True).start()
