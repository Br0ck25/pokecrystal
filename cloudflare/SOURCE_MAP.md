# Source inventory for the browser port

This file maps major responsibilities to the existing disassembly so implementation work stays tied to the original game. It is an inventory, not a claim that these systems have already been ported.

| Port area | Existing source locations to inspect | Browser-port requirement |
|---|---|---|
| Elm's Lab map events | `maps/ElmsLab.asm`, `constants/map_constants.asm` | `src/maps/elms-lab.js` records source dimensions, warps, scene-gated coordinate events, background events, and objects; map graphics/collision and executable scripts remain unported. |
| Map identity and layout | `data/maps/attributes.asm`, `data/maps/blocks.asm`, `maps/*.asm`, `maps/*.blk` | Preserve map dimensions, block layout, map connections, warps, object events, and scripts from source data. |
| Overworld initialization | `engine/overworld/init_map.asm` and related files under `engine/overworld/` | Match entry transitions, map loading, player placement, and map state. |
| Overworld events | `engine/overworld/events.asm`, `data/events/`, individual `maps/*.asm` scripts | Translate event conditions and state flags rather than adding substitute interactions. |
| Pokémon species data | `data/pokemon/base_stats.asm` and its related data directories | Extract source-defined stats, types, catch rates, growth, learnsets, evolutions, and Pokédex data. |
| Battle system | `engine/battle/`, `data/battle/`, `data/battle_anims/` | Port turn processing, move effects, damage, status, AI, animations, and end-of-battle state. |
| Graphics | `gfx/`, `data/` graphics pointer/table files, map block definitions | Convert source tile/sprite/frame data into crisp high-resolution rendering assets while preserving composition and identity. |
| Text and dialogue | `maps/*.asm`, `data/` text/script data, text engine source | Preserve source dialogue and control flow; make text readable at higher resolution. |
| Menus and items | `engine/menus/`, `engine/items/`, item and menu data tables | Preserve menu options, cursor rules, item behavior, and state changes. |
| Save/load | save-related code and data structures identified during source audit | Translate the original persistent state and validate round-tripping; browser-local saves first. |
| Worker packaging | New `cloudflare/worker.js` | Embed the finished browser app in one Worker script; no runtime CDN or asset requests. |

## First vertical slice

Start from the real New Bark Town opening, not a newly invented meadow. Before implementation, confirm the exact opening map file names, block data format, map attributes, event scripts, player starting coordinates, and title/intro state from the current source. The first browser milestone should support starting the game, walking on that real map, collision, facing/interacting with a real object, and saving/restoring the player position. Elm's Lab event metadata has now been catalogued and tested, but its block grid, collision, rendering, and actual transitions are still not implemented.

## Verification rule

Each feature should have a small source-linked test or comparison note. A system remains `not ported` until behavior is implemented and tested. Rendering can be enhanced independently, but must not change underlying map coordinates, collision, or game rules.