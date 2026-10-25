/** Game Boy Color map viewport and camera helpers. One metatile is 16px. */
export const GBC_VIEWPORT_WIDTH = 160;
export const GBC_VIEWPORT_HEIGHT = 144;

export function getCameraTransform(mapWidth, mapHeight, playerX, playerY, viewportWidth = GBC_VIEWPORT_WIDTH, viewportHeight = GBC_VIEWPORT_HEIGHT, tileSize = 16) {
  if (![mapWidth,mapHeight,playerX,playerY,viewportWidth,viewportHeight,tileSize].every(Number.isFinite)
      || mapWidth <= 0 || mapHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0 || tileSize <= 0) {
    throw new TypeError('Camera dimensions and player coordinates must be finite and positive where applicable.');
  }
  const worldWidth = mapWidth * tileSize;
  const worldHeight = mapHeight * tileSize;
  const maxX = Math.max(0, worldWidth - viewportWidth);
  const maxY = Math.max(0, worldHeight - viewportHeight);
  const cameraX = Math.max(0, Math.min(maxX, playerX * tileSize + tileSize / 2 - viewportWidth / 2));
  const cameraY = Math.max(0, Math.min(maxY, playerY * tileSize + tileSize / 2 - viewportHeight / 2));
  return Object.freeze({
    cameraX, cameraY,
    originX: worldWidth < viewportWidth ? Math.floor((viewportWidth - worldWidth) / 2) : 0,
    originY: worldHeight < viewportHeight ? Math.floor((viewportHeight - worldHeight) / 2) : 0,
    worldWidth, worldHeight,
  });
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
