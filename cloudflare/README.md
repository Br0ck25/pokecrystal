# Cloudflare browser port

This directory is the beginning of a JavaScript browser port of the Pokémon Crystal disassembly. It is not yet a playable game. The runtime currently defines a small state contract, guarded grid-step handling, local save/load, and crisp canvas setup; it intentionally refuses to guess movement rules without a source-derived map adapter.

## Files

- `src/runtime.js` — renderer sizing and runtime state primitives.
- `src/runtime.test.js` — tests for state, collision adapter behavior, transitions, and local saves.
- `src/maps/new-bark-town.js` — source-derived New Bark Town dimensions, warp events, coordinate events, signs, NPC positions, and map callback metadata.
- `src/maps.test.js` — tests for the New Bark Town source metadata.
- `src/maps/new-bark-town-blocks.js` — all 90 block IDs from the original `maps/NewBarkTown.blk`, plus coordinate lookup helpers.
- `src/maps-blocks.test.js` — checks block-grid dimensions and tile-to-block lookup.
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

Cloudflare Pages connected to GitHub is the simplest development deployment while the game is split into maintainable source files. Use the `crystal-browser-worker` branch and set the Pages project root directory to `cloudflare`. Since no browser entry page is implemented yet, **do not deploy this directory expecting a playable game**.

When the browser app exists, Pages can auto-deploy every commit from this branch. If a single-file Worker is still preferred, we can bundle the browser app into `cloudflare/worker.js` as a later packaging step. Pages versus a single Worker does not change the work required to translate the original game's logic.

## Current implementation status

- [x] New branch based on the original `master` source.
- [x] Port scope and source inventory documented.
- [x] Minimal runtime state contract and save/load primitives.
- [x] Automated tests and CI workflow added.
- [x] Transcribed New Bark Town's dimensions and warp/coordinate/background/object events from the disassembly.
- [x] Imported the 10 × 9 New Bark Town block-ID grid from the original `.blk` file.
- [ ] Decode tileset graphics and block definitions, then derive collision from the source attributes.
- [ ] Translate source-defined collisions, warps, map connections, object events, and scripts.
- [ ] Render the real opening sequence and New Bark Town map.
- [ ] Port dialogue, menus, battles, party, items, progression, and remaining maps.
- [ ] Verify the full browser game and deployment.

## Rights

The source disassembly does not automatically grant rights to distribute Nintendo's original assets or a full recreation. Review permissions before publishing source-derived graphics, music, dialogue, or other protected content.