#!/usr/bin/env python3
"""GM Table (D&D 5e) — starts the local server.

    python3 main.py            # game master only, on this computer
    python3 main.py --lan      # players join from the local network
    python3 main.py --remote   # players join over the internet (HTTPS tunnel)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server.app import main  # noqa: E402

if __name__ == "__main__":
    main()
