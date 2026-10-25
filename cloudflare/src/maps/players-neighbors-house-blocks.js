/** Source block grid shared by PlayersNeighborsHouse and other small houses. */
import { PLAYERS_NEIGHBORS_HOUSE } from './players-neighbors-house.js';
import { getJohtoMetatileCollision } from './johto-collision.js';

// data/maps/blocks.asm assigns PlayersNeighborsHouse_Blocks to maps/House1.blk.
// These are the original 4x4 source block IDs, not a substitute map layout.
export const PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS = Object.freeze([
  4, 30, 79, 29,
  15, 1, 2, 15,
  15, 12, 13, 15,
  6, 11, 15, 7,
]);

export function getPlayersNeighborsHouseCollisionAtMetatile(x, y) {
  const d = PLAYERS_NEIGHBORS_HOUSE.dimensions;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= d.metatilesWide || y >= d.metatilesHigh) return null;
  const id = PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS[Math.floor(y / 2) * d.blocksWide + Math.floor(x / 2)];
  return getJohtoMetatileCollision(id, (y % 2) * 2 + (x % 2));
}
