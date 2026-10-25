/**
 * Explicitly supported browser-preview warp transitions.
 * Coordinates are map metatile coordinates, taken from source map warp data;
 * arrival positions are preview landing positions, not a claim of full engine parity.
 */
export const PREVIEW_WARP_LANDINGS = Object.freeze({
  'NEW_BARK_TOWN:ELMS_LAB': Object.freeze({ mapId: 'ELMS_LAB', x: 4, y: 10, facing: 'up' }),
  'ELMS_LAB:NEW_BARK_TOWN': Object.freeze({ mapId: 'NEW_BARK_TOWN', x: 6, y: 4, facing: 'down' }),
});

/** Return a supported landing state, or null for an unported destination. */
export function resolvePreviewWarp(sourceMapId, warp) {
  if (!warp || typeof sourceMapId !== 'string' || typeof warp.destinationMap !== 'string') return null;
  const landing = PREVIEW_WARP_LANDINGS[`${sourceMapId}:${warp.destinationMap}`];
  if (!landing) return null;
  return { ...landing };
}
