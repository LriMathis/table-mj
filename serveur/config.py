"""Chemins et état partagé du serveur."""
import os
import threading

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # dossier Dnd/
WEB = os.path.join(BASE, "web")
PATHS = {
    "donnees": os.path.join(BASE, "donnees"),   # sauvegardes de l'application
    "fiches": os.path.join(BASE, "fiches"),     # fiches de personnages texte à importer
}
LOCK = threading.RLock()
INFO = {"reseau": False, "distance": False, "port": 8765, "urls": [], "public": None}
LOCAL = ("127.0.0.1", "::1", "::ffff:127.0.0.1")
