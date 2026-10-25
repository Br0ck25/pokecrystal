# Pokémon Crystal browser port — implementation contract

## Goal

**Contributor and AI-agent rules:** The repository-root `AGENTS.md` is mandatory and takes precedence for working practices, source fidelity, testing, and completion claims. This plan describes the technical target and sequence.

Recreate the existing Pokémon Crystal game as a browser-native JavaScript application, with a higher-resolution renderer, and ultimately offer it as one self-contained Cloudflare Worker file. During active development, keep the app modular and deployable through Cloudflare Pages from `cloudflare/`; the Worker bundle is a later packaging milestone, not the editing source of truth.

This is **not** a new RPG, a renamed Pokémon game, a ROM builder, or a browser emulator. Do not implement a second invented world or replace the game's rules with simplified lookalikes.

## Non-negotiable requirements

- Preserve the source game's maps, events, characters, dialogue, items, Pokémon data, battle rules, progression, and save behavior as they are translated.
- Use JavaScript in the browser. Do not require a compiled .gbc ROM, RGBDS at deployment, an emulator, an external game server, a CDN, or runtime fetches for game code/assets.
- Deliver deployment as a single cloudflare/worker.js. HTML, CSS, client JavaScript, and any generated data needed by the browser must be embedded in that file.
- Keep the original disassembly intact. The port reads it as the reference and translates it; it does not alter or replace the assembly project.
- Use a crisp high-resolution canvas renderer. Keep the original camera, grid movement, map layout, proportions, and visual identity. Improve clarity and scaling without redesigning the world.
- Support keyboard and touch controls, responsive layout, and save/load.
- Never describe a partial engine, placeholder map, or visual mockup as a playable recreation of Pokémon Crystal.

## Current deployment versus final packaging

The active preview is Cloudflare Pages at `https://pokemonhd.pages.dev/`, sourced from the `crystal-browser-worker` branch with the Pages root directory set to `cloudflare`, no build command, and output directory `/`. Keep this no-build modular setup working while the game is being translated and tested. The single-file Worker is a later packaging target and must be generated and tested separately; do not treat it as a reason to collapse the development code into one file.

## Technical approach

The existing source is a Game Boy Color assembly disassembly. It cannot be executed directly as JavaScript. The browser port must translate the original rules and data into JavaScript. This is a large compatibility project, so work in vertical slices and verify each slice against the source before moving on.

The Worker should be a static application host: return the self-contained browser application from fetch(). Gameplay runs on the user's device, not in a request handler. Cloudflare KV may be added later for optional cross-device saves; local browser saves should work without an account or database.

## Porting sequence

### 0. Source inventory and compatibility ledger
- Identify source files and data tables for title flow, tile/map formats, warps, scripts/events, player movement, menus, Pokémon data, battles, and save state.
- For every translated feature, record the source file/symbol, JavaScript counterpart, test cases, and status.
- Keep unresolved behavior explicit; do not invent replacement mechanics.

### 1. Renderer and input compatibility
- Build the renderer around source tile/map coordinates and sprite frames.
- Use integer-scaled logical coordinates with high-resolution canvas output; avoid blurry browser interpolation.
- Match map scrolling, player facing, walking cadence, collision, and interaction direction.
- Add touch controls without changing the game's underlying movement rules.

### 2. Real opening sequence
- Translate the original title/start flow and intro, using source-defined transitions and state.
- Do not jump directly into a fabricated map or bypass the game's original progression.

### 3. Overworld vertical slice
- Port the real opening location and its actual map data, warps, object events, scripts, dialogue, and transitions.
- Verify walking, collisions, talking, doors, map changes, and persistence against the disassembly.

### 4. Core game systems
- Translate menus, party, Pokédex, inventory, PC/storage, text handling, trainer battles, wild encounters, turn order, status, experience, evolution, money, shops, and item effects.
- Translate source data tables rather than manually inventing substitutes.
- Preserve Crystal-specific rules and edge cases.

### 5. Full world and progression
- Port the maps and scripts in progression order, including Johto and Kanto, gyms, story flags, events, and endgame.
- Add audio and animation only when their source behavior is understood.
- Maintain a regression suite for completed areas and mechanics.

### 6. Cloudflare packaging
- Bundle all browser code and required generated data into cloudflare/worker.js.
- Test the Worker locally and after deployment. Confirm that it makes no external runtime requests.
- If optional cross-device saves are implemented, keep gameplay usable without KV.

## Completion standard

A milestone is complete only when it uses real source-derived maps/rules/data, is playable in a browser, and has been tested. Screenshots or a visually convincing mockup alone do not count.

## Copyright and distribution

The repository is a disassembly, not a license to redistribute Nintendo's copyrighted game. Do not include a compiled Pokémon Crystal ROM or claim official affiliation. Before publishing a public playable build, review the rights for redistributed graphics, music, dialogue, and other assets. A Worker-only requirement does not change those rights.