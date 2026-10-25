/**
 * Johto tileset metatile definitions from data/tilesets/johto_metatiles.bin.
 * Upstream blob SHA: 9024f2ad6c761ca47759645ed12017236ed7e208
 *
 * 128 metatiles, each with 16 8x8 tile IDs arranged in 4x4 row-major order.
 * This is graphics layout only; collision classes live in johto-collision.js.
 */
import { TILESETS } from '../generated/tilesets.js';
export const JOHTO_METATILE_TILES = TILESETS.JOHTO.metatiles;

export function getJohtoMetatileTiles(metatileId) {
  if (!Number.isInteger(metatileId) || metatileId < 0 || metatileId >= JOHTO_METATILE_TILES.length) return null;
  return JOHTO_METATILE_TILES[metatileId];
}
