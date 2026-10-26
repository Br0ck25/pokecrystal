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

Regression run: `npm run regress -- --build DIR --out DIR [--only menu,mom]` replays the scripts listed in `regress.json` and fails when a checkpoint differs by more pixels than its budget. The budgets only cover settled frames (not mid-fade or moving-NPC ones). `PyBoy` ignores a button press unless the screen is read between presses; `play.py` handles that, but a `hold` of one frame can still be missed, so use 4+ frames. Useful `warp` fields: `ram` (symbol -> value), `set`/`clear` (event flags), `engine` (app-side engine flags such as `ENGINE_POKEGEAR`) and `party` (app-side party size).

Damage oracle (`damage/`): `node damage/cases.mjs > OUT/cases.json`, `BATTLES=5 python3 damage/probe.py --build DIR --out OUT` plants a party Pokémon in RAM (species, item, moves, badges),
random-walks Route 29 into wild battles and records each hit (`wCurDamage`, crit flag, `wTypeModifier`, both mons' stats), then `node damage/verify.mjs OUT` checks that `src/battle/damage.js`
can produce exactly that damage (some roll of 217..255, or the target's HP when the hit overkills). The last run matched 64 of 67 hits; the other 3 were the planted foreign-OT MAROWAK disobeying and hurting itself in confusion (CheckObedience; not ported yet).
`damage/exp_probe.py` + `damage/exp_verify.mjs OUT` do the same for experience: the ROM's EXP and stat EXP gains after wild wins matched the formulas of `src/battle/experience.js` in 21 of 21 battles (the planted Pokémon has a foreign OT ID, so the traded 1.5x boost applies).
