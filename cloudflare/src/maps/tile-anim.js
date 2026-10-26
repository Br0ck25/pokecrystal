// Animated map tiles (engine/tilesets/tileset_anims.asm): water ripples, flowers, whirlpools, lava, fountains, tower
// pillars, cave water. One list entry runs per frame; entries read and tick wTileAnimationTimer.
import { TILE_ANIM_LISTS, TILE_ANIM_FRAMES, TILE_ANIM_BY_TILESET } from '../generated/tile-anims.js';

const rowsOf = (pixels) => Array.from({ length: 8 }, (_, y) => pixels.slice(y * 8, y * 8 + 8));
const FOUNTAIN_ORDER = [0, 1, 2, 3, 2, 3, 4, 0];                   // .FountainTileFramePointers: 1 2 3 4 3 4 5 1
const PILLAR_ORDER = [0, 1, 2, 3, 4, 3, 2, 1];                     // .TowerPillarTileFrameOffsets

export class TileAnimator {
  /** tilesetName: the TILESET_ name without the prefix, e.g. 'JOHTO'. */
  constructor(tilesetName) {
    const list = TILE_ANIM_BY_TILESET[tilesetName.replace(/_/g, '')];
    this.list = list ? TILE_ANIM_LISTS[list] : [];
    this.index = 0;          // hTileAnimFrame
    this.timer = 0;          // wTileAnimationTimer
    this.buffer = null;      // wTileAnimBuffer: a tile's rows while a scroll is in progress
    this.tiles = new Map();  // tile id -> 64-digit palette-index string drawn instead of the tileset's own
    this.waterColor = 0;     // which of the WATER palette's colors 0-2 currently stands in for its color 0
    this.changed = false;    // set when a tile or the water color changed since the renderer last looked
  }

  set(tile, pixels) {
    if (this.tiles.get(tile) !== pixels) { this.tiles.set(tile, pixels); this.changed = true; }
  }

  /** One frame (the VBlank AnimateTileset call). */
  step() {
    if (!this.list.length) return;
    const entry = this.list[this.index];
    this.index = entry.op === 'done' ? 0 : this.index + 1;
    const F = TILE_ANIM_FRAMES;
    const t = this.timer;
    switch (entry.op) {
      case 'water': this.set(entry.tile, F.water[(t & 6) >> 1]); break;
      case 'flower': this.set(3, F.flower[(t & 2) >> 1]); break;
      case 'fountain': this.set(entry.tile, F.fountain[FOUNTAIN_ORDER[t & 7]]); break;
      case 'lava2': this.set(0x38, F.lava[(t & 6) >> 1]); break;
      case 'lava1': this.set(0x5b, F.lava[(((t & 6) >> 1) + 2) & 3]); break;
      case 'frames': this.set(entry.tile, entry.frames[t & 3]); break;
      case 'tower': this.set(entry.tile, entry.frames[PILLAR_ORDER[t & 7]]); break;
      case 'forestL': this.set(0x0c, F.forestTree[0]); break;     // the trees only move during the Celebi event
      case 'forestR': this.set(0x0f, F.forestTree[2]); break;
      case 'waterPalette':
        if ((t & 1) === 0) { const color = (t & 6) === 0 ? 0 : (t & 6) === 4 ? 2 : 1; if (color !== this.waterColor) { this.waterColor = color; this.changed = true; } }
        break;
      case 'tick8': this.timer = (t + 1) & 7; break;
      case 'tick': this.timer = (t + 1) & 255; break;
      case 'read': this.buffer = rowsOf(this.tiles.get(entry.tile) ?? this.base?.(entry.tile)); break;
      case 'scrollRL': this.timer = (t + 1) & 7; this.buffer = this.buffer.map((r) => ((t + 1) & 4 ? r.slice(1) + r[0] : r[7] + r.slice(0, 7))); break;   // 4 ticks left, 4 right
      case 'scrollDown': this.buffer = [this.buffer[7], ...this.buffer.slice(0, 7)]; break;
      case 'write': this.set(entry.tile, this.buffer.join('')); break;
      default: break;                                              // wait, done, flicker (dark caves only)
    }
  }
}
