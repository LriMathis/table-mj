#!/usr/bin/env bash
# Table du MJ sur ce PC uniquement.
cd "$(dirname "$0")" && exec python3 table_mj.py "$@"
