// A map as the engine sees it: blocks, collision per 16x16 square, and its source events. Everything is read from
// src/generated, so any map in the game loads the same way.
import { MAPS } from '../generated/maps.js';
import { TILESETS } from '../generated/tilesets.js';
import { EVENTS } from '../generated/events.js';
import { COLLISION_VALUES } from '../generated/collision.js';

const mapIdByName = new Map(Object.entries(MAPS).map(([id, m]) => [m.name, id]));

/** Collision value (COLL_* number) for a tile collision label from data/tilesets/*_collision.asm. */
export function collisionValue(label) {
  if (label in COLLISION_VALUES) return COLLISION_VALUES[label];
  if (/^[0-9a-fA-F]{2}$/.test(label)) return parseInt(label, 16);
  throw new Error(`unknown collision label ${label}`);
}

export function mapIdOf(name) {
  const id = mapIdByName.get(name);
  if (!id) throw new Error(`unknown map ${name}`);
  return id;
}

/**
 * Load a map by its constant (NEW_BARK_TOWN). Coordinates are 16x16 squares; event coordinates are the source's.
 * `blocks` is a private copy that map callbacks may change (changeblock, decorations); collision follows it.
 */
export function loadWorld(mapId) {
  const map = MAPS[mapId];
  if (!map) throw new Error(`unknown map ${mapId}`);
  const events = EVENTS[map.name] ?? { warps: [], coordEvents: [], bgEvents: [], objects: [] };
  const collision = TILESETS[map.tileset].collision;
  const width = map.width * 2;
  const height = map.height * 2;
  const world = {
    id: mapId, name: map.name, group: map.group, number: map.number, tileset: map.tileset, environment: map.environment,
    width, height, blockWidth: map.width, blockHeight: map.height, border: map.border,
    blocks: [...map.blocks],
    warps: events.warps, coordEvents: events.coordEvents, bgEvents: events.bgEvents, objects: events.objects,
    blockIdAt(x, y) {
      return x >= 0 && y >= 0 && x < width && y < height ? this.blocks[(y >> 1) * map.width + (x >> 1)] : map.border;
    },
    /** Collision value of the 16x16 square; outside the map it is the border block's, as in wOverworldMap. */
    collisionAt(x, y) {
      const row = collision[this.blockIdAt(x, y)];
      if (!row) throw new Error(`no collision for block ${this.blockIdAt(x, y)} of ${map.tileset}`);
      return collisionValue(row[(y & 1) * 2 + (x & 1)]);
    },
    /** changeblock: set the block covering square (x, y), which must be inside the map. */
    setBlockAt(x, y, id) {
      if (!(x >= 0 && y >= 0 && x < width && y < height)) throw new Error(`changeblock ${x},${y} is outside ${mapId}`);
      this.blocks[(y >> 1) * map.width + (x >> 1)] = id;
    },
  };
  return world;
}
