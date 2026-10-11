#!/usr/bin/env bash
# Table du MJ + vue joueurs accessible depuis les téléphones/PC du même réseau.
cd "$(dirname "$0")" && exec python3 table_mj.py --reseau "$@"
