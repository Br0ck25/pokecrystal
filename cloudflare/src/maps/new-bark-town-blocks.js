/**
 * Raw block IDs extracted from maps/NewBarkTown.blk in upstream pokecrystal.
 * Upstream blob SHA: 4cec0216aa8b8806a41837f8957d9b052ebf21bf
 *
 * This is the source block grid (10 x 9 blocks), not the final tile/pixel map.
 * Each map block occupies 2 x 2 metatiles (16x16-pixel units). Collision
 * cannot be resolved from this grid until the block's four metatile IDs are
 * decoded from the source metatile-definition binary.
 */
import { NEW_BARK_TOWN } from './new-bark-town.js';

export const NEW_BARK_TOWN_BLOCK_IDS = Object.freeze([
  5, 5, 24, 31, 25, 5, 5, 5, 5, 5,
  5, 71, 28, 119, 30, 5, 24, 25, 5, 5,
  5, 2, 1, 1, 1, 71, 22, 30, 5, 5,
  5, 1, 1, 1, 1, 1, 1, 1, 1, 84,
  1, 1, 1, 1, 69, 1, 1, 1, 1, 88,
  5, 20, 21, 1, 1, 1, 1, 1, 98, 5,
  4, 1, 1, 1, 71, 20, 21, 1, 98, 5,
  5, 101, 101, 1, 1, 1, 1, 1, 98, 5,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
]);

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
