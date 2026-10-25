import { TILESETS } from '../generated/tilesets.js';

/**
 * Collision classes for TilesetJohto metatiles 0x00–0x7f.
 * Source: data/tilesets/johto_collision.asm (upstream blob
 * 8da65db437ca441fcf35cc064eb17f5daac5e65c).
 *
 * Each row lists the source collision labels for the metatile's four 8x8
 * quadrants in source order: top-left, top-right, bottom-left, bottom-right.
 * These are raw labels, not a simplified passability rule: doors, ledges,
 * water, and special movement need engine-level handling.
 */
export const JOHTO_METATILE_COLLISION = TILESETS.JOHTO.collision;

export const COLLISION_QUADRANTS = Object.freeze({
  topLeft: 0,
  topRight: 1,
  bottomLeft: 2,
  bottomRight: 3,
});

export function getJohtoMetatileCollision(metatileId, quadrant = 0) {
  if (!Number.isInteger(metatileId) || metatileId < 0
      || metatileId >= JOHTO_METATILE_COLLISION.length) return null;
  if (!Number.isInteger(quadrant) || quadrant < 0 || quadrant > 3) return null;
  return JOHTO_METATILE_COLLISION[metatileId][quadrant];
}
