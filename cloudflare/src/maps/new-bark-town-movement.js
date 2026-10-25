import { COLLISION_VALUES, COLLISION_PERMISSIONS } from '../generated/collision.js';

/**
 * Conservative movement rules for the browser preview.
 *
 * Collision labels are copied from the disassembly, but this is not a full
 * port of Pokémon Crystal's movement engine: ledges, doors, surfing, cut,
 * ladders, and warp transitions need dedicated behavior.
 */
const LAND_TILE = 0;

/**
 * Walkable the way engine/overworld/player_movement.asm CheckWalkable decides it: the collision's entry in
 * CollisionPermissionTable (data/collision/collision_permissions.asm) must be LAND_TILE. Tile collision labels are
 * COLL_* names or two-digit hex values; anything else fails closed.
 */
export function isPreviewCollisionWalkable(collision) {
  if (typeof collision !== 'string') return false;
  const value = collision in COLLISION_VALUES ? COLLISION_VALUES[collision]
    : /^[0-9a-fA-F]{2}$/.test(collision) ? parseInt(collision, 16) : null;
  return value !== null && COLLISION_PERMISSIONS[value] === LAND_TILE;
}

/** Check bounds before querying collision data, failing closed for invalid input. */
export function canPreviewEnter(x, y, width, height, getCollision) {
  if (![x, y, width, height].every(Number.isInteger)
      || width <= 0 || height <= 0
      || x < 0 || y < 0 || x >= width || y >= height
      || typeof getCollision !== 'function') return false;
  return isPreviewCollisionWalkable(getCollision(x, y));
}


/** Warp coordinates override simplified collision labels but never map bounds. */
export function canPreviewEnterOrWarp(x, y, width, height, getCollision, warps = []) {
  if (![x, y, width, height].every(Number.isInteger)
      || width <= 0 || height <= 0
      || x < 0 || y < 0 || x >= width || y >= height) return false;
  if (Array.isArray(warps) && warps.some(warp => warp.x === x && warp.y === y)) return true;
  return typeof getCollision === 'function'
    && isPreviewCollisionWalkable(getCollision(x, y));
}
