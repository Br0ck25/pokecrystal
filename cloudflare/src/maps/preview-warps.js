/**
 * Resolve a source warp using the destination map's numbered warp entry.
 *
 * Source warp coordinates and destinationWarp indices come from the disassembly.
 * The one-tile arrival offset is preview movement glue, inferred from whether
 * the destination door is on a room's top/bottom edge. It is not a complete
 * implementation of Crystal's warp engine or map connections.
 */
export function resolvePreviewWarp(sourceMapId, warp, maps = null) {
  if (!warp || typeof sourceMapId !== 'string' || typeof warp.destinationMap !== 'string') return null;
  const key = `${sourceMapId}:${warp.destinationMap}`;
  const fallback = PREVIEW_WARP_LANDINGS[key];
  if (!fallback) return null;

  // When source metadata is supplied, honor the actual destination warp number
  // rather than treating every doorway between two maps as interchangeable.
  const destination = maps?.[warp.destinationMap]?.metadata ?? maps?.[warp.destinationMap];
  if (!destination || !Number.isInteger(warp.destinationWarp) || warp.destinationWarp < 1) {
    return { ...fallback };
  }
  const destinationWarp = destination.warps?.[warp.destinationWarp - 1];
  if (!destinationWarp) return null;

  const d = destination.dimensions;
  let x = destinationWarp.x;
  let y = destinationWarp.y;
  let facing = 'down';
  if (destinationWarp.y === 0) {
    y += 1;
    facing = 'down';
  } else if (destinationWarp.y === d.metatilesHigh - 1) {
    y -= 1;
    facing = 'up';
  } else if (destinationWarp.x === 0) {
    x += 1;
    facing = 'right';
  } else if (destinationWarp.x === d.metatilesWide - 1) {
    x -= 1;
    facing = 'left';
  } else {
    // Outdoor doors are represented as warp tiles within the map, not on its edge.
    y += 1;
    facing = 'down';
  }
  if (x < 0 || y < 0 || x >= d.metatilesWide || y >= d.metatilesHigh) return null;
  return { mapId: warp.destinationMap, x, y, facing };
}

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

