#!/usr/bin/env bash
# Game master + players on the same local network.
cd "$(dirname "$0")" && exec python3 main.py --lan "$@"
