#!/bin/sh
# npm run audit [-- cases.json]: serve the app, warp the real game into each case and print only the cases that differ.
# Run tools/reference/setup.sh once first. Output PNGs (ROM | app | diff) land in $REF_DIR/out.
set -e
REF_DIR=${REF_DIR:-/tmp/crystal-ref}
cd "$(dirname "$0")/../.."
if ! curl -s -o /dev/null http://localhost:8765/index.html; then (python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1; fi
NODE_PATH=$(npm root -g) python3 tools/reference/audit.py --build "$REF_DIR/src" --out "$REF_DIR/out" ${1:+--cases "$1"} --quiet
