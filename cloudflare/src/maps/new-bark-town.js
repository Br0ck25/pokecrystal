/**
 * Source-derived New Bark Town event metadata.
 *
 * Transcribed from maps/NewBarkTown.asm on the upstream master branch and
 * constants/map_constants.asm. Coordinates and destination identifiers match
 * the disassembly; this file intentionally does not guess block collision or
 * render tiles. Those require parsing the corresponding .blk and tileset data.
 */
export const NEW_BARK_TOWN = Object.freeze({
  id: 'NEW_BARK_TOWN',
  group: 'NEW_BARK',
  dimensions: Object.freeze({
    blocksWide: 10,
    blocksHigh: 9,
    metatilesWide: 20,
    metatilesHigh: 18,
    blockSizeMetatiles: 2,
  }),
  callbacks: Object.freeze([
    Object.freeze({
      trigger: 'MAPCALLBACK_NEWMAP',
      action: 'NewBarkTownFlypointCallback',
      setsFlags: ['ENGINE_FLYPOINT_NEW_BARK'],
      clearsEvents: ['EVENT_FIRST_TIME_BANKING_WITH_MOM'],
    }),
  ]),
  warps: Object.freeze([
    Object.freeze({ x: 6, y: 3, destinationMap: 'ELMS_LAB', destinationWarp: 1 }),
    Object.freeze({ x: 13, y: 5, destinationMap: 'PLAYERS_HOUSE_1F', destinationWarp: 1 }),
    Object.freeze({ x: 3, y: 11, destinationMap: 'PLAYERS_NEIGHBORS_HOUSE', destinationWarp: 1 }),
    Object.freeze({ x: 11, y: 13, destinationMap: 'ELMS_HOUSE', destinationWarp: 1 }),
  ]),
  coordinateEvents: Object.freeze([
    Object.freeze({ x: 1, y: 8, scene: 'SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU', script: 'NewBarkTown_TeacherStopsYouScene1' }),
    Object.freeze({ x: 1, y: 9, scene: 'SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU', script: 'NewBarkTown_TeacherStopsYouScene2' }),
  ]),
  backgroundEvents: Object.freeze([
    Object.freeze({ x: 8, y: 8, kind: 'BGEVENT_READ', script: 'NewBarkTownSign' }),
    Object.freeze({ x: 11, y: 5, kind: 'BGEVENT_READ', script: 'NewBarkTownPlayersHouseSign' }),
    Object.freeze({ x: 3, y: 3, kind: 'BGEVENT_READ', script: 'NewBarkTownElmsLabSign' }),
    Object.freeze({ x: 9, y: 13, kind: 'BGEVENT_READ', script: 'NewBarkTownElmsHouseSign' }),
  ]),
  objects: Object.freeze([
    Object.freeze({ id: 'NEWBARKTOWN_TEACHER', x: 6, y: 8, sprite: 'SPRITE_TEACHER', movement: 'SPRITEMOVEDATA_SPINRANDOM_SLOW', palette: 0, script: 'NewBarkTownTeacherScript' }),
    Object.freeze({ id: 'NEWBARKTOWN_FISHER', x: 12, y: 9, sprite: 'SPRITE_FISHER', movement: 'SPRITEMOVEDATA_WALK_UP_DOWN', palette: 'PAL_NPC_GREEN', script: 'NewBarkTownFisherScript' }),
    Object.freeze({ id: 'NEWBARKTOWN_RIVAL', x: 3, y: 2, sprite: 'SPRITE_RIVAL', movement: 'SPRITEMOVEDATA_STANDING_RIGHT', palette: 0, script: 'NewBarkTownRivalScript', appearsWhen: 'EVENT_RIVAL_NEW_BARK_TOWN' }),
  ]),
});

function at(events, x, y) {
  return events.filter(event => event.x === x && event.y === y);
}

/** Return source event records at a map coordinate without inventing behavior. */
export function eventsAt(x, y, scene = null) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
  return [
    ...at(NEW_BARK_TOWN.warps, x, y).map(event => ({ type: 'warp', ...event })),
    ...at(NEW_BARK_TOWN.coordinateEvents, x, y)
      .filter(event => scene === null || event.scene === scene)
      .map(event => ({ type: 'coordinate', ...event })),
    ...at(NEW_BARK_TOWN.backgroundEvents, x, y).map(event => ({ type: 'background', ...event })),
    ...at(NEW_BARK_TOWN.objects, x, y).map(event => ({ type: 'object', ...event })),
  ];
}
