#!/usr/bin/env python3
"""Table du Maître du Jeu (D&D 5e) — lance le serveur local.

    python3 table_mj.py            # MJ seul, sur ce PC
    python3 table_mj.py --reseau   # + les joueurs se connectent depuis leur navigateur
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serveur.principal import main  # noqa: E402

if __name__ == "__main__":
    main()
