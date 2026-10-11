#!/usr/bin/env bash
# Game master + players over the internet (a public HTTPS address is printed).
cd "$(dirname "$0")" && exec python3 main.py --remote "$@"
