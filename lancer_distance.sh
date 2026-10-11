#!/usr/bin/env bash
# Table du MJ + partie à distance : les joueurs se connectent par Internet (adresse https affichée).
cd "$(dirname "$0")" && exec python3 table_mj.py --distance "$@"
