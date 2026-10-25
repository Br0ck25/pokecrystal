/**
 * Raw block IDs extracted from maps/NewBarkTown.blk in upstream pokecrystal.
 * Upstream blob SHA: 4cec0216aa8b8806a41837f8957d9b052ebf21bf
 *
 * This is the source block grid (10 x 9 blocks). Each block ID selects one
 * 32x32 metatile made from 16 8x8 graphics tiles; collision is defined by
 * four 16x16 quadrants in the separate source collision table.
 */
import { MAPS } from '../generated/maps.js';
import { NEW_BARK_TOWN } from './new-bark-town.js';
import { getJohtoMetatileCollision } from './johto-collision.js';

export const NEW_BARK_TOWN_BLOCK_IDS = MAPS.NEW_BARK_TOWN.blocks;

/** Get the source block ID at a block coordinate, or null outside the map. */
export function getNewBarkTownBlock(blockX, blockY) {
  const { blocksWide, blocksHigh } = NEW_BARK_TOWN.dimensions;
  if (!Number.isInteger(blockX) || !Number.isInteger(blockY)
      || blockX < 0 || blockY < 0 || blockX >= blocksWide || blockY >= blocksHigh) {
    return null;
  }
  return NEW_BARK_TOWN_BLOCK_IDS[blockY * blocksWide + blockX];
}

/** Resolve which source map block contains a metatile coordinate. */
export function getNewBarkTownBlockAtMetatile(x, y) {
  const { metatilesWide, metatilesHigh } = NEW_BARK_TOWN.dimensions;
  if (!Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || y < 0 || x >= metatilesWide || y >= metatilesHigh) return null;
  return getNewBarkTownBlock(Math.floor(x / 2), Math.floor(y / 2));
}


/**
 * Resolve the source collision class for a 16x16 map-coordinate cell.
 * Each .blk entry is a 32x32 metatile with four 16x16 collision quadrants.
 */
export function getNewBarkTownCollisionAtMetatile(x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || y < 0
      || x >= NEW_BARK_TOWN.dimensions.metatilesWide
      || y >= NEW_BARK_TOWN.dimensions.metatilesHigh) return null;
  const blockId = getNewBarkTownBlockAtMetatile(x, y);
  const quadrant = (y % 2) * 2 + (x % 2);
  return getJohtoMetatileCollision(blockId, quadrant);
}
