# Project rules for people and AI agents

These rules are mandatory for every person, coding agent, and AI assistant that changes this repository. Read this file before editing anything. If a task request conflicts with these rules, stop and explain the conflict rather than silently choosing an interpretation.

## 1. What this project is

The goal is to recreate the original Pokémon Crystal game as a browser-native JavaScript game, using this repository's disassembly as the behavioral and data reference. The browser version should become a crisp, high-resolution recreation of the same game, not a new game inspired by it.

The current browser port is still an incomplete prototype. It renders source-derived New Bark Town, Elm's Lab, and several house interiors with embedded tile/sprite assets, grid movement, basic dialogue and starter selection, and automated tests. Its map/script coverage and runtime mechanics remain incomplete; it is **not yet a complete Pokémon Crystal game**.

### Why this project exists

The original game is written for Game Boy Color hardware in assembly. Browser JavaScript cannot run that disassembly directly as a normal web application. We must translate the original data and behavior into JavaScript in small, verifiable slices. The objective is faithful compatibility, not a quick visual imitation.

## 2. Non-negotiable rules

1. **The disassembly is the source of truth.** Derive maps, coordinates, collisions, dialogue, event conditions, items, Pokémon, battles, progression, and edge cases from source files or clearly documented source-derived data.
2. **Do not invent game behavior.** If the source behavior is not understood or not ported, mark it as missing, blocked, or a placeholder. Do not present guesses as original mechanics.
3. **Do not claim completion early.** A rendered map, passing unit tests, or a working movement demo does not mean the game or a milestone is complete.
4. **Do not use a ROM or emulator as the browser runtime.** This is a JavaScript port of the disassembly, not a ROM player, ROM builder, or emulator wrapper. Do not add a compiled `.gbc` ROM.
5. **Keep the upstream assembly project intact.** Treat its source as reference material. Do not rewrite source assembly to make the browser prototype easier.
6. **Do not introduce unrelated redesigns.** Preserve the original game flow, maps, grid/camera proportions, characters, mechanics, and progression as implemented in the source. Higher-resolution rendering should improve clarity, not redesign the game.
7. **No runtime dependencies on external hosts.** The game must run from its own deployed files. Do not add CDNs, external APIs, remote scripts, remote fonts, or runtime downloads for gameplay code/assets.
8. **Browser-native JavaScript first.** The current app is a modular static browser application. Keep gameplay client-side; do not move gameplay into per-request Worker execution.
9. **No hidden destructive changes.** Do not remove existing functionality, overwrite another agent's work, or make broad refactors without understanding the current code and tests.
10. **Be honest about intellectual-property status.** This is a disassembly project, not permission to redistribute Nintendo's game. Do not add a compiled ROM, claim official affiliation, or assume that publishing extracted graphics, music, dialogue, or other protected assets is automatically permitted.

## 3. Which files to read first

Before changing code, inspect:
- `AGENTS.md` — these project rules.
- `cloudflare/README.md` — current implementation and run/test instructions.
- `cloudflare/PORTING_PLAN.md` — target architecture and milestone sequence.
- `cloudflare/SOURCE_MAP.md` — inventory mapping original source to browser-port files.
- The relevant original assembly/data file and the existing JavaScript counterpart.
- Tests covering the code being changed.

Do not assume that an old plan describes current implementation perfectly. If it conflicts with the live code or current deployment setup, verify the actual repository and update the documentation in the same change when needed.

## 4. Source-to-port translation method

For each feature, follow this sequence:

1. **Locate the source of truth.** Identify the exact original source file, label/table, dimensions, event, or data definition.
2. **Record provenance.** Add a short comment or source-map entry naming the original file and, when practical, the symbol, source revision, or blob SHA.
3. **Translate, do not approximate.** Preserve source IDs, ordering, coordinates, conditions, and semantics. Convert formats only as needed for JavaScript.
4. **Keep unknowns explicit.** If a source format or rule is not yet understood, do not guess. Fail safely and document what remains unresolved.
5. **Add tests.** Test exact source-derived values and behavior, plus boundary cases and malformed inputs where relevant.
6. **Integrate in a vertical slice.** Connect the data to the browser only after the data and its helpers have tests.
7. **Update the ledger and status.** Mark a task complete only after implementation and verification; otherwise leave it incomplete and state the limitation.
8. **Check the result.** Run the local tests and inspect the GitHub Actions result for the pushed commit.

A test that repeats the implementation's own assumptions without checking the source is not enough. Tests should catch accidental changes to source-derived data and ensure unknown cases are handled deliberately.

## 5. Required behavior for unknown or unsupported cases

- Unknown collision labels must block movement until their semantics are confirmed from source.
- Out-of-bounds coordinates must not be walkable.
- Missing map data, missing sprites, unknown events, and unported destinations must show a clear placeholder or remain unavailable; never teleport to a guessed coordinate.
- A warp is not implemented just because its source coordinates are known. A real transition needs the destination map, the correct destination warp/arrival position, state handling, and tests.
- Dialogue text alone does not implement a script. Conditional events, scene flags, yes/no loops, movement sequences, rewards, and follow-up state must be ported separately and explicitly.
- If a source script relies on state not yet represented in JavaScript, do not silently skip the condition. Document the missing state and prevent false progression.
- Do not turn a placeholder interaction into a claim of original-game parity.

## 6. Architecture and file ownership

- Browser app entry: `cloudflare/index.html` and `cloudflare/app.js`.
- Port runtime primitives: `cloudflare/src/runtime.js`.
- Source-derived map metadata and map-specific logic: `cloudflare/src/maps/`.
- Source-derived image/tile assets and decoding: `cloudflare/src/assets/` and `cloudflare/src/graphics.js`.
- Tests: files ending in `.test.js` under `cloudflare/src/`.
- Planning and traceability: `cloudflare/PORTING_PLAN.md`, `cloudflare/SOURCE_MAP.md`, and `cloudflare/README.md`.

Prefer small, single-purpose modules and pure functions for data conversion, movement checks, and game rules. Keep DOM and canvas work in the browser layer; keep source data and rules testable without a browser. Avoid giant all-in-one files as features grow.

Do not copy source data into multiple competing versions. Choose one canonical JavaScript module for each imported table and import it elsewhere. When the same value exists in the original source and the port, document the source location rather than manually maintaining conflicting copies.

## 7. Current preview limitations that must not be mistaken for finished features

At the time these rules were written:
- New Bark Town uses source block/metatile data and embedded tileset palette processing; exact source palette fidelity and all map-specific rendering details still need visual verification.
- The player is a temporary geometric marker, not the source player sprite or full sprite animation.
- Movement is a conservative prototype; collision classes and game-specific movement rules still need full verification.
- A/B buttons and keyboard aliases are basic interaction controls, not a complete original input/menu system.
- Sign and NPC interactions include source-derived text, but original scripts, autonomous scene movement, event flags, and state-dependent behavior are not fully implemented. Yes/no prompts and keyboard aliases are still being refined and must be tested against the disassembly.
- A basic New Bark Town ↔ Elm's Lab warp transition is implemented using the imported source block grids and warp coordinates. Arrival offsets are currently preview-level behavior; the full original map loader, scene state, scripts, and general warp engine are not implemented.
- The original opening sequence, party, starter choice, battles, inventory, save compatibility, and full world progression are not yet implemented.
- Local prototype save helpers do not establish compatibility with the original game's save format.

Update this list when implementation changes. Do not remove a limitation until it is demonstrably fixed and tested.

## 8. Testing and quality gates

From the repository root, the browser-port tests are run with:

```sh
cd cloudflare
npm test
```

Requirements:
- Add or update tests for every new pure function, imported table, movement rule, map transition, and game-state rule.
- Keep tests deterministic and independent of network access.
- Do not add third-party packages unless they are essential and their use is explained.
- Ensure GitHub Actions passes for the commit being reported.
- For rendering changes, test the underlying data/geometry where possible and manually inspect the deployed preview when practical.
- Never state that tests passed unless you actually observed a passing test or CI result for the relevant change.
- If a check fails, inspect the failure and fix it before starting unrelated work.

## 9. Deployment rules

The current preview is hosted at https://pokemonhd.pages.dev/ from the `crystal-browser-worker` branch, with Cloudflare Pages root directory `cloudflare`, no build command, and output directory `/`.

- Keep the current modular, no-build Pages setup working.
- GitHub-connected Pages can deploy commits from the configured branch automatically; do not claim a deployment is live until deployment status or the live site is checked.
- The earlier long-term packaging goal is a single `cloudflare/worker.js` for copy/paste deployment. That bundle is **not** the current source of truth and must not replace modular development files. Implement bundling as a separate, tested packaging step after the browser app is ready.
- Do not add a build command or change the Pages root/output settings without explaining the reason and updating deployment documentation.

## 10. Working safely with multiple people or AI agents

- Start by checking the branch, latest commit, modified files, and CI status. Do not assume another agent has not changed a file since you last read it.
- Re-fetch the current file and its current SHA immediately before editing it. Use that SHA for the update. If GitHub reports a conflict, fetch the latest version and reconcile; never force-overwrite someone else's change.
- Do not make concurrent writes to the same file.
- Keep commits small and focused, with messages that say what changed.
- Do not rewrite history, force-push, delete branches, or discard other agents' changes unless the project owner explicitly directs it.
- If another agent's changes are incomplete, preserve them and build on them. Do not revert merely because a different implementation would be easier.
- After a change, inspect the diff or the resulting file, run tests, and check CI. Report the exact commit and any remaining limitations.
- If a request is broad, choose the next smallest end-to-end slice that advances the game. Do the implementation, tests, and documentation; do not respond with only another plan when code can be safely changed.

## 11. Milestone definition of done

A feature is complete only when all applicable conditions are met:
- Its behavior and data are traced to original source.
- It is integrated into the actual browser game, not just stored in an unused data file.
- Correct conditions, state changes, error paths, and boundaries are handled.
- Automated tests cover expected behavior and important edge cases.
- The relevant CI run passes.
- Documentation and source-to-port status are updated.
- Any remaining differences from the original are listed honestly.

A whole-game milestone requires the full relevant player flow to work in the browser. A screenshot, isolated function, map renderer, or successful unit test suite alone does not qualify.

## 12. Priority order for ongoing work

Unless the project owner gives a more specific priority, work in this order:
1. Keep the prototype stable and tests/CI green.
2. Improve source fidelity of graphics, palettes, sprite rendering, movement, and collision.
3. Generalize map loading/rendering so multiple source-derived maps can be used without hardcoded dimensions.
4. Port the actual opening sequence and its required maps/events in source progression order.
5. Implement stateful scripts and map transitions with tests.
6. Add core systems (party, starter choice, dialogue engine, menus, battles, items, save data) using source tables and rules.
7. Expand maps and story progression in the order the original game requires.
8. Package and verify a standalone Cloudflare Worker only after the modular browser app and required assets can be bundled and tested.

Do not skip ahead to a later system by creating fake data or a visual-only stub and calling it done.
