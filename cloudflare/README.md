# Cloudflare browser port

**Contributor and AI-agent rules:** Read the repository-root [`AGENTS.md`](../AGENTS.md) before making any change. It defines the project goal, source-of-truth requirements, safe multi-agent workflow, testing gates, and what counts as complete.

This directory is the beginning of a JavaScript browser port of the Pokémon Crystal disassembly. It is not yet a playable game. Read the repository-root `AGENTS.md` before contributing; all data and mechanics must be source-derived, tested, and described honestly. The runtime currently defines a small state contract, guarded grid-step handling, local save/load, and crisp canvas setup; it intentionally refuses to guess movement rules without a source-derived map adapter.

## Files

- `src/runtime.js` — renderer sizing and runtime state primitives.
- `src/runtime.test.js` — tests for state, collision adapter behavior, transitions, and local saves.
- `src/maps/new-bark-town.js` — source-derived New Bark Town dimensions, warp events, coordinate events, signs, NPC positions, and map callback metadata.
- `src/maps/elms-lab.js` — source-derived Elm's Lab dimensions, both exit warps, scene-gated coordinate events, background events, and object event coordinates. This is metadata only; the map renderer and scripts are not yet ported.
- `src/maps-elms-lab.test.js` — verifies the imported Elm's Lab event metadata against the source definitions.
- `src/maps.test.js` — tests for the New Bark Town source metadata.
- `src/maps/new-bark-town-blocks.js` — all 90 block IDs from the original `maps/NewBarkTown.blk`, plus metatile-coordinate lookup helpers.
- `src/maps-blocks.test.js` — checks source block-grid lookup and collision quadrant resolution.
- `src/maps/johto-collision.js` — source collision labels for Johto metatiles `0x00`–`0x77`, with quadrant lookup.
- `src/maps/johto-metatiles.js` — all 128 source Johto metatile definitions, each containing 16 8x8 tile IDs.
- `src/maps/johto-palette-map.js` — source palette-name assignments for both Johto `tilepal` groups, including the reserved `$ff` gap.
- `src/assets/johto-tileset.js` — embedded 128×96 source tileset preview image used by the browser map renderer.
- `index.html` / `app.js` — no-build browser map preview with keyboard and touch movement prototype over the source-derived New Bark Town map.
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

Cloudflare Pages connected to GitHub is the simplest development deployment while the game is split into maintainable source files. Use the `crystal-browser-worker` branch and set the Pages project root directory to `cloudflare`. The current deployment is an early interactive map prototype, not the full game. The repository-root `AGENTS.md` is mandatory for contributors and AI agents.

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
- [ ] Decode the original Johto tile graphics into their native 2bpp asset form and apply the source palette map.
- [ ] Render the town from source map blocks, metatile definitions, and graphics; translate raw collision labels into game-engine movement behavior.
- [ ] Translate source-defined collisions, warps, map connections, object events, and scripts.
- [x] Render a source-data New Bark Town map preview in the browser.
- [x] Add temporary keyboard and touch movement controls to test map coordinates on desktop and mobile.\n- [x] Fail closed on unknown collision labels instead of treating them as walkable.
- [ ] Render the real opening sequence with player sprite, palette colors, movement, and source events.
- [ ] Port dialogue, menus, battles, party, items, progression, and remaining maps.
- [ ] Verify the full browser game and deployment.

## Rights

The source disassembly does not automatically grant rights to distribute Nintendo's original assets or a full recreation. Review permissions before publishing source-derived graphics, music, dialogue, or other protected content.