/** Game Boy Color map viewport and camera helpers. One metatile is 16px. */
export const GBC_VIEWPORT_WIDTH = 160;
export const GBC_VIEWPORT_HEIGHT = 144;

// The original always centres the player on screen: the player's tile sits at (64, 64) and the map
// scrolls under it, so the edge of a map shows its border block (or a connected map). Object sprites
// are drawn 4px above their tile (measured against the game: the player sprite's top is y=60).
export const PLAYER_SCREEN_X = 64;
export const PLAYER_SCREEN_Y = 64;
export const SPRITE_Y_OFFSET = -4;

export function getCameraTransform(playerX, playerY, tileSize = 16) {
  if (![playerX, playerY, tileSize].every(Number.isFinite) || tileSize <= 0) {
    throw new TypeError('Camera player coordinates and tile size must be finite; tile size must be positive.');
  }
  return Object.freeze({ cameraX: playerX * tileSize - PLAYER_SCREEN_X, cameraY: playerY * tileSize - PLAYER_SCREEN_Y });
}

/**
 * Backing-store multiplier for the game canvas: the largest whole multiple of the
 * 160x144 Game Boy screen that fits the on-screen size in device pixels, so every
 * source pixel is drawn as an exact square block instead of being stretched unevenly.
 */
export function integerRenderScale(cssWidth, devicePixelRatio = 1, logicalWidth = GBC_VIEWPORT_WIDTH) {
  const devicePixels = cssWidth * (Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1);
  if (!Number.isFinite(devicePixels)) return 1;
  return Math.max(1, Math.floor(devicePixels / logicalWidth));
}
