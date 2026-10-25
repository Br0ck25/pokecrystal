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
    /**
     * Block under square (x, y). Outside the map it is the connected map's block when a connection covers it (its three
     * nearest rows or columns, aligned by the connection offset; drawn and collided with this map's tileset, as the game
     * does), otherwise the border block.
     */
    blockIdAt(x, y) {
      if (x >= 0 && y >= 0 && x < width && y < height) return this.blocks[(y >> 1) * map.width + (x >> 1)];
      const link = this.connectedBlock(x >> 1, y >> 1);
      return link === null ? map.border : link;
    },
    connectedBlock(bx, by) {
      for (const { direction, map: otherId, offset } of map.connections) {
        const other = MAPS[otherId];
        let nx, ny;
        if (direction === 'west' && bx < 0 && bx >= -3 && by >= 0 && by < map.height) { nx = other.width + bx; ny = by - offset; }
        else if (direction === 'east' && bx >= map.width && bx < map.width + 3 && by >= 0 && by < map.height) { nx = bx - map.width; ny = by - offset; }
        else if (direction === 'north' && by < 0 && by >= -3 && bx >= 0 && bx < map.width) { nx = bx - offset; ny = other.height + by; }
        else if (direction === 'south' && by >= map.height && by < map.height + 3 && bx >= 0 && bx < map.width) { nx = bx - offset; ny = by - map.height; }
        else continue;
        if (nx >= 0 && ny >= 0 && nx < other.width && ny < other.height) return other.blocks[ny * other.width + nx];
      }
      return null;
    },
    /** Where leaving the map through square (x, y) outside it lands in the connected map, or null (no connection). */
    connectionExit(x, y) {
      for (const { direction, map: otherId, offset } of map.connections) {
        const other = MAPS[otherId];
        if (direction === 'west' && x < 0) return { map: otherId, x: other.width * 2 - 1, y: y - offset * 2 };
        if (direction === 'east' && x >= width) return { map: otherId, x: 0, y: y - offset * 2 };
        if (direction === 'north' && y < 0) return { map: otherId, x: x - offset * 2, y: other.height * 2 - 1 };
        if (direction === 'south' && y >= height) return { map: otherId, x: x - offset * 2, y: 0 };
      }
      return null;
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
