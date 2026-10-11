"""Remote play: opens a public HTTPS tunnel to the player view.

The tunnel points to a second, local port that serves ONLY the player view: even though
tunnel traffic arrives from 127.0.0.1, nobody can get game master rights through it.

Two providers, no account needed:
  - cloudflared (downloaded to tools/ on first use if it is not installed):
    https://xxxx.trycloudflare.com
  - fallback: ssh + localhost.run, https://xxxx.lhr.life (less reliable: large images fail)
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
    """System cloudflared, otherwise the one in tools/ (downloaded once)."""
    found = shutil.which("cloudflared")
    if found:
        return found
    system, arch = platform.system(), platform.machine().lower()
    arch = "arm64" if arch in ("aarch64", "arm64") else "amd64" if arch in ("x86_64", "amd64") else None
    if not arch:
        return None
    dest = os.path.join(config.BASE, "tools", "cloudflared" + (".exe" if system == "Windows" else ""))
    if os.path.isfile(dest):
        return dest
    name = {"Linux": f"cloudflared-linux-{arch}", "Windows": f"cloudflared-windows-{arch}.exe",
            "Darwin": f"cloudflared-darwin-{arch}.tgz"}.get(system)
    if not name:
        return None
    print("First remote session: downloading cloudflared (~40 MB)…", flush=True)
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
        print("Could not download cloudflared:", e, file=sys.stderr)
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
    """Keeps the tunnel open and restarts it if it drops (the address may then change)."""
    while True:
        name, cmd = _command(port)
        if not cmd:
            print("Remote play unavailable: install cloudflared or ssh.", file=sys.stderr)
            return
        pattern = re.compile(PROVIDERS[name])
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, errors="replace")
        except OSError as e:
            print("Could not start the tunnel:", e, file=sys.stderr)
            return
        for line in proc.stdout:
            m = pattern.search(line)
            url = m and m.group(0) + "/player"
            if url and url != config.INFO.get("public"):
                config.INFO["public"] = url
                print()
                print("=" * 64)
                print("  REMOTE PLAY — send this address to your players:")
                print("     ", url)
                print("=" * 64, flush=True)
        proc.wait()
        config.INFO["public"] = None
        print("Tunnel closed, retrying in 5 s… (the player address will change)", file=sys.stderr)
        time.sleep(5)


def start(player_port):
    config.INFO["public"] = None
    threading.Thread(target=_run, args=(player_port,), daemon=True).start()
