/**
 * Explicitly supported browser-preview warp transitions.
 * Coordinates are map metatile coordinates, taken from source map warp data;
 * arrival positions are preview landing positions, not a claim of full engine parity.
 */
export const PREVIEW_WARP_LANDINGS = Object.freeze({
  'NEW_BARK_TOWN:ELMS_LAB': Object.freeze({ mapId: 'ELMS_LAB', x: 4, y: 10, facing: 'up' }),
  'ELMS_LAB:NEW_BARK_TOWN': Object.freeze({ mapId: 'NEW_BARK_TOWN', x: 6, y: 4, facing: 'down' }),
  'NEW_BARK_TOWN:PLAYERS_HOUSE_1F': Object.freeze({ mapId: 'PLAYERS_HOUSE_1F', x: 6, y: 6, facing: 'up' }),
  'PLAYERS_HOUSE_1F:NEW_BARK_TOWN': Object.freeze({ mapId: 'NEW_BARK_TOWN', x: 13, y: 6, facing: 'down' }),
  'PLAYERS_HOUSE_1F:PLAYERS_HOUSE_2F': Object.freeze({ mapId: 'PLAYERS_HOUSE_2F', x: 7, y: 1, facing: 'up' }),
  'PLAYERS_HOUSE_2F:PLAYERS_HOUSE_1F': Object.freeze({ mapId: 'PLAYERS_HOUSE_1F', x: 9, y: 1, facing: 'down' }),
  'NEW_BARK_TOWN:ELMS_HOUSE': Object.freeze({ mapId: 'ELMS_HOUSE', x: 2, y: 6, facing: 'up' }),
  'ELMS_HOUSE:NEW_BARK_TOWN': Object.freeze({ mapId: 'NEW_BARK_TOWN', x: 11, y: 14, facing: 'down' }),
  'NEW_BARK_TOWN:PLAYERS_NEIGHBORS_HOUSE': Object.freeze({ mapId: 'PLAYERS_NEIGHBORS_HOUSE', x: 2, y: 6, facing: 'up' }),
  'PLAYERS_NEIGHBORS_HOUSE:NEW_BARK_TOWN': Object.freeze({ mapId: 'NEW_BARK_TOWN', x: 3, y: 12, facing: 'down' }),
});

/** Return a supported landing state, or null for an unported destination. */
export function resolvePreviewWarp(sourceMapId, warp) {
  if (!warp || typeof sourceMapId !== 'string' || typeof warp.destinationMap !== 'string') return null;
  const landing = PREVIEW_WARP_LANDINGS[`${sourceMapId}:${warp.destinationMap}`];
  if (!landing) return null;
  return { ...landing };
}
