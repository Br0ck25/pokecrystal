#!/bin/sh
# One-time setup for the reference harness: installs pyboy and rgbds and builds the ROM from this repo into $REF_DIR
# (default /tmp/crystal-ref). Nothing is written into the repository. Needs network access (pip, github releases).
set -e
REF_DIR=${REF_DIR:-/tmp/crystal-ref}
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
mkdir -p "$REF_DIR/src" "$REF_DIR/rgbds"
pip install -q pyboy pillow numpy
if [ ! -x "$REF_DIR/rgbds/rgbasm" ]; then
  curl -sSL -o "$REF_DIR/rgbds.tar.xz" https://github.com/gbdev/rgbds/releases/download/v1.0.4/rgbds-linux-x86_64.tar.xz
  tar -xf "$REF_DIR/rgbds.tar.xz" -C "$REF_DIR/rgbds"
fi
(cd "$REPO" && tar --exclude=.git --exclude=cloudflare -cf - .) | tar -xf - -C "$REF_DIR/src"
(cd "$REF_DIR/src" && PATH="$REF_DIR/rgbds:$PATH" make -j8 crystal >/dev/null)
sha1sum "$REF_DIR/src/pokecrystal.gbc" | cut -c1-40
grep -q "$(sha1sum "$REF_DIR/src/pokecrystal.gbc" | cut -c1-40)" "$REPO/roms.sha1" && echo "ROM matches roms.sha1"
