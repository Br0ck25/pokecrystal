import { TILESETS } from '../generated/tilesets.js';
/** Exact tile-collision labels parsed from pret/pokecrystal data/tilesets/*_collision.asm. */
export const TILESET_COLLISION = Object.freeze(Object.fromEntries(
  ['HOUSE', 'LAB', 'PLAYERS_HOUSE', 'PLAYERS_ROOM'].map((k) => [k, TILESETS[k].collision])));
export function getTilesetCollision(tileset, metatileId, quadrant = 0) {
  const table = TILESET_COLLISION[tileset];
  if (!table || !Number.isInteger(metatileId) || metatileId < 0 || metatileId >= table.length || !table[metatileId]) return null;
  if (!Number.isInteger(quadrant) || quadrant < 0 || quadrant > 3) return null;
  return table[metatileId][quadrant];
}
