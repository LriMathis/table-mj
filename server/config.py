"""Paths and shared server state."""
import os
import threading

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # project root
WEB = os.path.join(BASE, "web")
PATHS = {
    "data": os.path.join(BASE, "data"),       # application data (campaigns, bestiary, images, backups)
    "sheets": os.path.join(BASE, "sheets"),   # plain-text character sheets to import
}
LOCK = threading.RLock()
INFO = {"lan": False, "remote": False, "port": 8765, "urls": [], "public": None}
LOCAL = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
