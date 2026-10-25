/**
 * Conservative movement rules for the browser preview.
 *
 * Collision labels are copied from the disassembly, but this is not a full
 * port of Pokémon Crystal's movement engine: ledges, doors, surfing, cut,
 * ladders, and warp transitions need dedicated behavior.
 */
export const PREVIEW_WALKABLE_COLLISIONS = Object.freeze(new Set([
  'FLOOR',
  'TALL_GRASS',
  'DOOR',
  'WARP_CARPET_LEFT',
  'WARP_CARPET_RIGHT',
  'WARP_CARPET_DOWN',
]));

/** Unknown and special collision labels are blocked until explicitly handled. */
export function isPreviewCollisionWalkable(collision) {
  return typeof collision === 'string' && PREVIEW_WALKABLE_COLLISIONS.has(collision);
}

/** Check bounds before querying collision data, failing closed for invalid input. */
export function canPreviewEnter(x, y, width, height, getCollision) {
  if (![x, y, width, height].every(Number.isInteger)
      || width <= 0 || height <= 0
      || x < 0 || y < 0 || x >= width || y >= height
      || typeof getCollision !== 'function') return false;
  return isPreviewCollisionWalkable(getCollision(x, y));
}
