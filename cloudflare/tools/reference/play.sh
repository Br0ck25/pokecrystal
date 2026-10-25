#!/bin/sh
# npm run play -- script.json : replay a button script in the real game and the app, print per-checkpoint differences.
set -e
REF_DIR=${REF_DIR:-/tmp/crystal-ref}
cd "$(dirname "$0")/../.."
if ! curl -s -o /dev/null http://localhost:8765/index.html; then (python3 -m http.server 8765 >/dev/null 2>&1 &); sleep 1; fi
NODE_PATH=$(npm root -g) python3 tools/reference/play.py --build "$REF_DIR/src" --out "$REF_DIR/play" "$1"
