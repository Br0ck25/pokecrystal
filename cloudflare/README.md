# Pokémon Crystal browser port — agent guide

Browser-native JS port of the disassembly in this repo. Rules: `../AGENTS.md` (mandatory) and `../CLAUDE.md`. No build step; Pages serves
this folder. Node 22, no packages. Status: any map loads and renders; new game → room → Mom → town → Elm's Lab runs on the real scripts.

## Commands (run in `cloudflare/`)
- `npm test` — quiet (dots; failures print). `npm run extract` — regenerate `src/generated/` (a test fails if stale).
- `npm run q -- map ELMS_LAB | script ElmsLab [Label] | text _text Label | find <regex>` — look up generated data. **Do not open `src/generated/*`** (MBs of one-line JSON).
- `sh tools/reference/setup.sh` once, then `npm run audit [cases.json]` — diffs the app against the real game (ROM built in `$REF_DIR`, never committed). Details: `tools/reference/README.md`.

## Layout
- `tools/extract-browser-data.mjs` — the only place source files are parsed. Add data here, not by hand.
- `src/generated/` — maps, tilesets(+images, roofs), events, scenes, scripts/<Map>.js (+`_std`, `_text`), sprites, palettes, collision, decorations, font.
- `src/game/world.js` — load a map (blocks, collision, events). `src/game/engine.js` — frame loop: movement, map entry + callbacks, warps, coord events, scene scripts, interaction, script runner (`Game.update({dir,a,b,aHeld,bHeld})`, `game.unported` lists unimplemented specials/effects).
- `src/script/` — `interpreter.js` (generator; yields text/yesorno/movement/effect/special requests), `text.js` (18-col boxes), `context.js`.
- `src/render/scene.js` (what to draw, pure) / `canvas.js` (browser drawing). `src/maps/` — sprite palettes+frames, map palettes, camera constants, key bindings. `app.js` — input + 60 Hz loop.

## Facts worth knowing (measured against the real game)
- Square = 16px; step 16 frames; turn 8 frames; stand 8 then walk pose 8 frames, mirrored pose alternates per square; sprites draw 4px up; player tile at screen (64,64).
- Text ≈3 frames/char; box rows 12–17, text rows 14/16; YES/NO box (14,7)-(19,11). Walkable = `LAND_TILE` in the permission table. Door/stairs arrival walks down 1 square.
- Tile events (warps, coord events) are disabled on map entry and after each check, and re-enabled when a player step ends (arriving on a warp tile does not re-warp).
- New-game flags come from running `InitializeEventsScript` via the 2F callback; object visible ⇔ its event flag is clear.
- Time of day is fixed to DAY; the player is Chris; ROM-vs-app diffs also show moving NPCs and animated flowers (not bugs).

## Not ported
Audio, intro/naming, menus (party/bag/PC/dex), battles, encounters, trainers, item balls, map connections, tile animation, NPC wandering, saves, specials in `Game.unported`.
