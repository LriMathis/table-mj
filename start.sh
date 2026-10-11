#!/usr/bin/env bash
# Game master only, on this computer.
cd "$(dirname "$0")" && exec python3 main.py "$@"
