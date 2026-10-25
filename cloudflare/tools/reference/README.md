# Reference screenshots from the real game (dev-time audit only)

Compares the browser port against Pokémon Crystal itself, frame by frame. The ROM is **built locally from
this repository's disassembly into a scratch directory** and run in a headless emulator purely as an
oracle. Never commit the ROM, its saves, or screenshots from it, and never use it as the browser runtime.

Setup (outside the repo):

    pip install pyboy pillow numpy
    # install rgbds 1.0.4 (see INSTALL.md), then in a scratch copy of the repo:
    make crystal            # produces pokecrystal.gbc + pokecrystal.sym

Run (from cloudflare/, with the app served at http://localhost:8765, e.g. `python3 -m http.server 8765`):

    python3 tools/reference/audit.py --build /path/to/scratch/repo --out /path/to/scratch/out

A case may set RAM before warping, e.g. `"ram": {"wElmsLabSceneID": 2}` to skip the Elm intro cutscene, with the matching app setting `"scene": "ElmsLab:2"`.

`audit.py` starts a new game in the emulator, warps it into each case in `cases.json` (map + warp number) exactly as a door does, reads the game's own arrival
coordinates, screenshots the same map/position in the app (`?map=&x=&y=&facing=`), and writes
side-by-side images plus a per-8x8-tile difference report.
