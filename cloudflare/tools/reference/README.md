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

Other checks (same build; `play.sh`/`play.py` replay button scripts in `scripts/*.json`, e.g. `menu.json` for START → SAVE):

    python3 tools/reference/title.py --build DIR --out OUT [--frames 1,2,...] [--ram save.ram]   # title frames vs the app, main menu shots
    python3 tools/reference/make_save.py --build DIR      # saves a new game in the ROM (leaves DIR/pokecrystal.gbc.ram) for --ram
    node tools/reference/title_app_menu.cjs out.png http://localhost:8765 DOWNS [save.json] [A]   # the app's main menu / CONTINUE box
