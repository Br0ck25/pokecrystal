# Cloudflare browser port

**Contributor and AI-agent rules:** Read the repository-root [`AGENTS.md`](../AGENTS.md) before making any change. It defines the project goal, source-of-truth requirements, safe multi-agent workflow, testing gates, and what counts as complete.

This directory is the beginning of a JavaScript browser port of the Pokémon Crystal disassembly. It is not yet a playable game. Read the repository-root `AGENTS.md` before contributing; all data and mechanics must be source-derived, tested, and described honestly. The runtime currently defines a small state contract, guarded grid-step handling, local save/load, and crisp canvas setup; it intentionally refuses to guess movement rules without a source-derived map adapter.

## Files

- `tools/extract-browser-data.mjs` — dev-time generator (`npm run extract`). Reads the disassembly's `maps/*.blk`, `data/tilesets/*_metatiles.bin`, `*_collision.asm` and map/tileset tables and writes `src/generated/maps.js` (all 388 maps) and `src/generated/tilesets.js` (all tilesets). Generated files are committed and checked for staleness by `src/generated.test.js`; never edit them by hand.
- `src/runtime.js` — renderer sizing and runtime state primitives.
- `src/runtime.test.js` — tests for state, collision adapter behavior, transitions, and local saves.
- `src/maps/new-bark-town.js` — source-derived New Bark Town dimensions, warp events, coordinate events, signs, NPC positions, and map callback metadata.
- `src/maps/elms-lab.js` and `src/maps/elms-lab-blocks.js` — source-derived Elm's Lab events, original 30-byte block grid, collision lookup, rendering, and connected town entrance/exit.
- `src/maps/players-house-1f.js`, `src/maps/players-house-1f-blocks.js`, `src/maps/players-house-2f.js`, and `src/maps/players-house-2f-blocks.js` — source map grids, event metadata, and entry/exit routes for both floors of the player's house.
- `src/maps/elms-house.js` and `src/maps/elms-house-blocks.js` — source grid and event metadata for Professor Elm's house.
- `src/maps/players-neighbors-house.js` and `src/maps/players-neighbors-house-blocks.js` — reachable neighbor house with source-derived events; the map uses the shared `maps/House1.blk` grid assigned by `data/maps/blocks.asm`.
- `src/maps/preview-warps.js` — resolves entry positions using the destination map's numbered warp metadata when available; the one-tile arrival offset remains preview glue rather than a complete port of the original warp engine.
- `src/maps/new-bark-town-movement.js` — conservative movement collision rules plus source-warp exceptions so special warp tiles remain reachable without allowing out-of-bounds movement.
- `src/maps/elms-lab-blocks.js` — the 30 source block IDs from `maps/ElmsLab.blk`, plus block/metatile/collision lookup helpers.
- `src/maps-elms-lab.test.js` and `src/maps-elms-lab-blocks.test.js` — source-coordinate, warp, block-grid, and bounds tests.
- `src/maps-elms-lab.test.js` — verifies the imported Elm's Lab event metadata against the source definitions.
- `src/maps.test.js` — tests for the New Bark Town source metadata.
- `src/maps/new-bark-town-blocks.js` — all 90 block IDs from the original `maps/NewBarkTown.blk`, plus metatile-coordinate lookup helpers.
- `src/maps-blocks.test.js` — checks source block-grid lookup and collision quadrant resolution.
- `src/maps/johto-collision.js` — source collision labels for Johto metatiles `0x00`–`0x77`, with quadrant lookup.
- `src/maps/johto-metatiles.js` — all 128 source Johto metatile definitions, each containing 16 8x8 tile IDs.
- `src/maps/johto-palette-map.js` — source palette-name assignments for both Johto `tilepal` groups, including the reserved `$ff` gap.
- `src/assets/johto-tileset.js` — embedded 128×96 source tileset preview image used by the browser map renderer.
- `src/assets/overworld-sprites.js` — original 16×96 source sprites for Kris, the New Bark Town teacher, fisher, and rival.
- `src/assets/source-sprites.js` — original source PNG assets for Professor Elm, Mom, the lab scientist, officer, Poké Ball, and the Cyndaquil, Totodile, and Chikorita front sprites.
- `index.html` / `app.js` — no-build browser preview that renders New Bark Town, Elm's Lab, the player's house (both floors), Professor Elm's house, and the neighbor's house. House entrances and exits are connected; the neighbor-house interior uses the shared `House1.blk` grid assigned by the original map-block table. New Bark Town uses embedded source overworld sprite sheets for the teacher, fisher, rival, and player. Keyboard controls preserve WASD movement (`A` moves left; `Z`/`E`/Enter/Space interact, `X`/Escape cancels). Yes/no prompts use a vertical cursor and preserve explicit source line breaks. Elm's Lab now starts with a source-derived yes/no request, uses the source starter-ball-to-species mapping, asks for confirmation before recording the selected level-5 starter, leaves the unchosen balls visible, and blocks the lab exit until a starter is selected. The starter selection now displays each original Pokémon front sprite, uses source-derived choice text and records the selected species/level. The New Bark Town teacher stop scene now advances through a staged movement approximation matching the source leftward approach and return-to-town beats; full animated `pokepic` behavior, cries, the real party/inventory engine, phone number/event flags, the complete DST confirmation loop, and exact scripted movement/timing are still not implemented. The Elm lab entry now animates the source-defined seven-step UP approach rather than teleporting the player to its endpoint. Mom's opening dialogue now keeps the DST and phone answers independent and includes both branches of the phone tutorial plus its follow-up text.
- `src/maps-metatiles.test.js` — checks the imported metatile table.
- `src/maps-collision.test.js` — verifies collision-table entries and map block references.
- `src/graphics.js` — JavaScript decoder for the repository's `lzcompress` stream format, Game Boy 2bpp tile decoding, and 32x32 metatile and full map-grid pixel composition.
- `src/graphics.test.js` — tests compressed-stream commands, malformed inputs, and 2bpp bitplane order.
- `src/graphics-compose.test.js` — tests 16-tile metatile composition.
- `src/graphics-map.test.js` — tests map-grid composition from source block and metatile data.
- `PORTING_PLAN.md` — requirements and phased implementation plan.
- `SOURCE_MAP.md` — source-to-port inventory.

## Test

Requires Node.js 22 or newer; no third-party packages are needed.

```sh
cd cloudflare
npm test
```

A GitHub Actions workflow runs these tests when files in this directory change.

## Hosting choice

Cloudflare Pages connected to GitHub is the simplest development deployment while the game is split into maintainable source files. Use the `crystal-browser-worker` branch and set the Pages project root directory to `cloudflare`. The browser shell now uses a Game Boy Color-inspired layout with a responsive screen that preserves each map's aspect ratio on Pixel 9-sized mobile screens. The old introductory paragraphs and development disclaimer have been removed from the player-facing page. The current deployment remains an early interactive map prototype, not the full game. The repository-root `AGENTS.md` is mandatory for contributors and AI agents.

When the browser app exists, Pages can auto-deploy every commit from this branch. If a single-file Worker is still preferred, we can bundle the browser app into `cloudflare/worker.js` as a later packaging step. Pages versus a single Worker does not change the work required to translate the original game's logic.

## Current implementation status

- [x] New branch based on the original `master` source.
- [x] Port scope and source inventory documented.
- [x] Minimal runtime state contract and save/load primitives.
- [x] Automated tests and CI workflow added.
- [x] Transcribed New Bark Town's dimensions and warp/coordinate/background/object events from the disassembly.
- [x] Imported the 10 × 9 New Bark Town block-ID grid from the original `.blk` file.
- [x] Imported Johto metatile collision labels from the original collision table.
- [x] Imported all 128 Johto metatile graphics layouts (16 tile IDs per metatile).
- [x] Imported Johto tile palette assignments and preserved the source padding gap.
- [x] Added 32x32 metatile and full map-grid palette-index compositors; connected New Bark Town map coordinates to collision quadrants.
- [x] Implement and test the source LZ decompressor and Game Boy 2bpp tile decoder.
- [x] Load the source Johto tileset preview in the browser and render the New Bark Town map from its source block/metatile tables (palette colors not yet applied).
- [x] Apply map-specific source palette assignments to the embedded tileset previews; verify colors and interior layouts against original source assets.
- [ ] Render the town from source map blocks, metatile definitions, and graphics; translate raw collision labels into game-engine movement behavior.
- [x] Connect the New Bark Town ↔ Elm's Lab entrance/exit warps using source-defined warp coordinates and tested block-grid collision lookups.
- [ ] Translate the full original movement engine, map connections, scene conditions, object event state, and scripts.
- [x] Render a source-data New Bark Town map preview in the browser.
- [x] Add temporary keyboard and touch movement controls to test map coordinates on desktop and mobile.\n- [x] Fail closed on unknown collision labels instead of treating them as walkable.
- [ ] Render the real opening sequence with the original player sprite, source palette colors, scripted movement, and stateful source events.
- [ ] Port dialogue, menus, battles, party, items, progression, and remaining maps.
- [ ] Verify the full browser game and deployment.

## Rights

The Neighbor's House uses the exact shared `maps/House1.blk` grid specified by `data/maps/blocks.asm` and its own `HOUSE` collision table; it is no longer filled with Elm's House as a fallback. Using Johto outdoor collision data for this indoor tileset caused invisible movement blockers, so the collision lookup now follows the correct source tileset. Each current map now records its original source tileset (`JOHTO`, `LAB`, `PLAYERS_HOUSE`, `PLAYERS_ROOM`, or `HOUSE`) so the renderer can select the correct graphics data rather than assuming every interior uses Johto town graphics. Interior appearance is still incomplete: the current preview does not apply source palette colors or render all map objects/decorations as the original game does. The player's upstairs room also uses the base map blocks, while the original toggles decorations through map callbacks, so the console/dolls/poster need state-aware rendering.

The source disassembly does not automatically grant rights to distribute Nintendo's original assets or a full recreation. Review permissions before publishing source-derived graphics, music, dialogue, or other protected content.

### Collision debugging

Append `?debug=collision` to the browser preview URL to show a temporary collision overlay: red cells are blocked and green cells are enterable under the preview's current movement rules. The overlay is opt-in and does not alter normal gameplay. Use it when reporting a tile that looks clear but cannot be crossed; the label shows the imported collision class.
