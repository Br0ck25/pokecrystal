/**
 * Raw 30-byte block grid extracted from maps/ElmsLab.blk.
 * Upstream blob SHA: e3916185d258ac12731616fd99f94f61b87a4e0e.
 * constants/map_constants.asm defines 5 x 6 blocks = 10 x 12 metatiles.
 */
import { MAPS } from '../generated/maps.js';
import { ELMS_LAB } from './elms-lab.js';
import { getTilesetCollision } from './tileset-collision.js';

export const ELMS_LAB_BLOCK_IDS = MAPS.ELMS_LAB.blocks;

export function getElmsLabBlock(blockX, blockY) {
  const d = ELMS_LAB.dimensions;
  if (!Number.isInteger(blockX) || !Number.isInteger(blockY) || blockX < 0 || blockY < 0 || blockX >= d.blocksWide || blockY >= d.blocksHigh) return null;
  return ELMS_LAB_BLOCK_IDS[blockY * d.blocksWide + blockX];
}
export function getElmsLabBlockAtMetatile(x, y) {
  const d = ELMS_LAB.dimensions;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= d.metatilesWide || y >= d.metatilesHigh) return null;
  return getElmsLabBlock(Math.floor(x / 2), Math.floor(y / 2));
}
export function getElmsLabCollisionAtMetatile(x, y) {
  const blockId = getElmsLabBlockAtMetatile(x, y);
  return blockId === null ? null : getTilesetCollision('LAB', blockId, (y % 2) * 2 + (x % 2));
}
