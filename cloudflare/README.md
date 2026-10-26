# Pokémon Crystal browser port — agent guide

Browser-native JS port of the disassembly in this repo. Rules: `../AGENTS.md` (mandatory) and `../CLAUDE.md`. No build step; Pages serves
this folder. Node 22, no packages. Status: title screen → main menu → new game → room → Mom → town → Elm's Lab runs on the real scripts; START menu with SAVE, OPTION, PACK, STATUS (trainer card) and the party screen; save/export/import.

## Commands (run in `cloudflare/`)
- `npm test` — quiet (dots; failures print). `npm run extract` — regenerate `src/generated/` (a test fails if stale).
- `npm run q -- map ELMS_LAB | script ElmsLab [Label] | text _text Label | find <regex>` — look up generated data. **Do not open `src/generated/*`** (MBs of one-line JSON).
- **Before porting a behaviour, read its asm and watch the ROM do it; after matching it, add a checkpoint and run `npm run regress -- --build $REF/src --out $REF/out`** (replays `tools/reference/scripts/*.json` against the real game and fails over `regress.json` pixel budgets).
- `sh tools/reference/setup.sh` once, then `npm run audit [cases.json]` — diffs the app against the real game (ROM built in `$REF_DIR`, never committed). Details: `tools/reference/README.md`.

## Layout
- `tools/extract-browser-data.mjs` — the only place source files are parsed. Add data here, not by hand.
- `src/generated/` — maps, tilesets(+images, roofs), events, scenes, scripts/<Map>.js (+`_std`, `_text`), sprites, palettes, collision, decorations, font.
- `src/game/world.js` — load a map (blocks, collision, events). `src/game/engine.js` — frame loop: movement, map entry + callbacks, warps, coord events, scene scripts, interaction, script runner (`Game.update({dir,a,b,aHeld,bHeld})`, `game.unported` lists unimplemented specials/effects).
- `src/game/intro.js` (title screen + main menu), `src/game/menu.js` (start menu, save flow, cursor), `src/game/save.js` (browser save file: JSON, not the ROM's SRAM). `src/script/` — `interpreter.js` (generator; yields text/yesorno/movement/effect/special requests), `text.js` (18-col boxes), `context.js`.
- `src/render/scene.js` (what to draw, pure) / `title-frame.js` (title picture, software-composed) / `canvas.js` (browser drawing). `src/maps/` — sprite palettes+frames, map palettes, camera constants, key bindings. `app.js` — input + 60 Hz loop.

## Facts worth knowing (measured against the real game)
- Keys: A = Z/E/Space, B = X/Esc/Backspace, START = Enter, SELECT = Shift (does nothing yet; the game uses it only for a registered item). Saves: START → SAVE writes localStorage; Export/Import buttons move the file. `?manual=1`/`?map=`/`?name=` skip the title (`?intro=1` keeps it).
- Title/menu timings were checked frame by frame against the ROM (`python3 tools/reference/title.py`); the first 3 title frames differ slightly (palette load order).
- Square = 16px; step 16 frames; turn 8 frames; stand 8 then walk pose 8 frames, mirrored pose alternates per square; sprites draw 4px up; player tile at screen (64,64).
- Text ≈3 frames/char; box rows 12–17, text rows 14/16; YES/NO box (14,7)-(19,11). Walkable = `LAND_TILE` in the permission table. Door/stairs arrival walks down 1 square.
- Tile events (warps, coord events) are disabled on map entry and after each check, and re-enabled when a player step ends (arriving on a warp tile does not re-warp).
- New-game flags come from running `InitializeEventsScript` via the 2F callback; object visible ⇔ its event flag is clear.
- Time of day is fixed to DAY; the player is Chris; ROM-vs-app diffs also show moving NPCs and animated flowers (not bugs).

## Not ported
Audio, copyright/Game Freak/intro-movie screens, setting the clock (NEW GAME runs Oak's speech, gender and naming but uses the device time), POKéDEX, POKéGEAR and the trainer card (START menu), the party MOVE action (ITEM give/take is ported, not yet compared with the real game), the summary's animated picture (STATS itself is ported; its Pokémon picture is the still first frame, the 840-pixel budget in `regress.json`), using or giving bag items, the title's secret key combinations, battles (see `BATTLE_PLAN.md`), encounters, trainers, specials in `Game.unported`.
