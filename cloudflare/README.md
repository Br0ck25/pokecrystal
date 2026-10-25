# Cloudflare browser port

**Contributor and AI-agent rules:** Read the repository-root [`AGENTS.md`](../AGENTS.md) before making any change. It defines the project goal, source-of-truth requirements, safe multi-agent workflow, testing gates, and what counts as complete.

This directory is the beginning of a JavaScript browser port of the Pokémon Crystal disassembly. It is not yet a playable game. Read the repository-root `AGENTS.md` before contributing; all data and mechanics must be source-derived, tested, and described honestly. The runtime currently defines a small state contract, guarded grid-step handling, local save/load, and crisp canvas setup; it intentionally refuses to guess movement rules without a source-derived map adapter.

## Files

- `tools/extract-browser-data.mjs` — dev-time generator (`npm run extract`). Reads the disassembly and writes `src/generated/*`: every map's blocks, border and tileset; every tileset's metatiles, collision, palette map and image; all warps/coord/bg/object events; every map's scripts, text and movement blocks plus the std scripts and shared text; sprites and their palettes; BG/environment/roof/special palettes; the collision permission table; decorations; the font. Generated files are committed and checked for staleness by `src/generated.test.js`; never edit them by hand.
- `src/game/world.js` — loads any map from the generated data (blocks, collision per 16x16 square, events).
- `src/game/engine.js` — the frame-stepped game loop: player movement (16-frame squares, 8-frame turns, measured against the game), map entry with the map's callbacks, warps, coordinate events, scene scripts, A-button interaction with objects and bg events, and the script runner (text boxes, yes/no, movement, emotes, pauses).
- `src/script/interpreter.js`, `src/script/text.js`, `src/script/context.js` — run the disassembly's own scripts and render its text (18-column boxes, `line`/`para`/`cont`/`done`/`prompt`).
- `src/render/scene.js`, `src/render/canvas.js` — what to draw (camera, sprite poses, text box) and the canvas drawing from the source graphics and font.
- `src/maps/object-sprites.js`, `src/maps/map-palettes.js`, `src/maps/viewport.js`, `src/maps/input-bindings.js` — sprite palettes and frames, map palettes and tile-graphics lookup, the fixed camera (player tile at 64,64; sprites 4px up) and integer scaling, keyboard bindings.
- `index.html` / `app.js` — the browser shell: input, the 60 Hz loop and drawing. The canvas backing store is the largest whole multiple of 160x144 that fits, shown at exactly that many device pixels per source pixel.
- `tools/reference/` — dev-time harness that diffs the port against the real game (a locally built ROM in a headless emulator, never committed); see its README.

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

Every map in the game loads and renders from source data, and the new-game start (player's room, Mom, the neighbor, New Bark Town, Elm's Lab) runs on the real scripts. Not ported yet: audio, the intro and naming, the party/bag/PC menus, Pokédex, battles, wild encounters, trainers, item balls, map connections (the strips beyond a town's edge), tile animations, NPC wandering, saves, and the script specials listed in `Game.unported`. See `PORTING_PLAN.md` and `AGENTS.md`.
