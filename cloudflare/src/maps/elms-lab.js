/**
 * Source-derived Professor Elm's Laboratory map metadata.
 *
 * Source references:
 * - maps/ElmsLab.asm (map scripts, scene declarations, map events, object events)
 * - constants/map_constants.asm (ELMS_LAB dimensions: 5 x 6 blocks)
 *
 * The event coordinates are copied from the disassembly. This module does not
 * claim that the laboratory is rendered, that its collision is imported, or
 * that any of its scripts are fully implemented in the browser.
 */
export const ELMS_LAB = Object.freeze({
  id: 'ELMS_LAB',
  tileset: 'LAB',
  group: 'NEW_BARK',
  dimensions: Object.freeze({
    blocksWide: 5,
    blocksHigh: 6,
    metatilesWide: 10,
    metatilesHigh: 12,
    blockSizeMetatiles: 2,
  }),
  scenes: Object.freeze([
    'SCENE_ELMSLAB_MEET_ELM',
    'SCENE_ELMSLAB_CANT_LEAVE',
    'SCENE_ELMSLAB_NOOP',
    'SCENE_ELMSLAB_MEET_OFFICER',
    'SCENE_ELMSLAB_UNUSED',
    'SCENE_ELMSLAB_AIDE_GIVES_POTION',
    'SCENE_ELMSLAB_AIDE_GIVES_POKE_BALLS',
  ]),
  callbacks: Object.freeze([
    Object.freeze({
      trigger: 'MAPCALLBACK_OBJECTS',
      action: 'ElmsLabMoveElmCallback',
      sourceCondition: 'Move Professor Elm to (3, 4) only during SCENE_ELMSLAB_MEET_ELM',
    }),
  ]),
  warps: Object.freeze([
    Object.freeze({ x: 4, y: 11, destinationMap: 'NEW_BARK_TOWN', destinationWarp: 1 }),
    Object.freeze({ x: 5, y: 11, destinationMap: 'NEW_BARK_TOWN', destinationWarp: 1 }),
  ]),
  coordinateEvents: Object.freeze([
    Object.freeze({ x: 4, y: 6, scene: 'SCENE_ELMSLAB_CANT_LEAVE', script: 'LabTryToLeaveScript' }),
    Object.freeze({ x: 5, y: 6, scene: 'SCENE_ELMSLAB_CANT_LEAVE', script: 'LabTryToLeaveScript' }),
    Object.freeze({ x: 4, y: 5, scene: 'SCENE_ELMSLAB_MEET_OFFICER', script: 'MeetCopScript' }),
    Object.freeze({ x: 5, y: 5, scene: 'SCENE_ELMSLAB_MEET_OFFICER', script: 'MeetCopScript2' }),
    Object.freeze({ x: 4, y: 8, scene: 'SCENE_ELMSLAB_AIDE_GIVES_POTION', script: 'AideScript_WalkPotion1' }),
    Object.freeze({ x: 5, y: 8, scene: 'SCENE_ELMSLAB_AIDE_GIVES_POTION', script: 'AideScript_WalkPotion2' }),
    Object.freeze({ x: 4, y: 8, scene: 'SCENE_ELMSLAB_AIDE_GIVES_POKE_BALLS', script: 'AideScript_WalkBalls1' }),
    Object.freeze({ x: 5, y: 8, scene: 'SCENE_ELMSLAB_AIDE_GIVES_POKE_BALLS', script: 'AideScript_WalkBalls2' }),
  ]),
  backgroundEvents: Object.freeze([
    Object.freeze({ x: 2, y: 1, kind: 'BGEVENT_READ', script: 'ElmsLabHealingMachine' }),
    ...[6, 7, 8, 9].map(x => Object.freeze({ x, y: 1, kind: 'BGEVENT_READ', script: 'ElmsLabBookshelf' })),
    ...[0, 1, 2, 3].map(x => Object.freeze({ x, y: 7, kind: 'BGEVENT_READ', script: `ElmsLabTravelTip${x + 1}` })),
    ...[6, 7, 8, 9].map(x => Object.freeze({ x, y: 7, kind: 'BGEVENT_READ', script: 'ElmsLabBookshelf' })),
    Object.freeze({ x: 9, y: 3, kind: 'BGEVENT_READ', script: 'ElmsLabTrashcan' }),
    Object.freeze({ x: 5, y: 0, kind: 'BGEVENT_READ', script: 'ElmsLabWindow' }),
    Object.freeze({ x: 3, y: 5, kind: 'BGEVENT_DOWN', script: 'ElmsLabPC' }),
  ]),
  objects: Object.freeze([
    Object.freeze({ id: 'ELMSLAB_ELM', x: 5, y: 2, sprite: 'SPRITE_ELM', script: 'ProfElmScript' }),
    Object.freeze({ id: 'ELMSLAB_ELMS_AIDE', x: 2, y: 9, sprite: 'SPRITE_SCIENTIST', script: 'ElmsAideScript', appearsWhen: 'EVENT_ELMS_AIDE_IN_LAB' }),
    Object.freeze({ id: 'ELMSLAB_POKE_BALL1', x: 6, y: 3, sprite: 'SPRITE_POKE_BALL', script: 'CyndaquilPokeBallScript', appearsWhen: 'EVENT_CYNDAQUIL_POKEBALL_IN_ELMS_LAB' }),
    Object.freeze({ id: 'ELMSLAB_POKE_BALL2', x: 7, y: 3, sprite: 'SPRITE_POKE_BALL', script: 'TotodilePokeBallScript', appearsWhen: 'EVENT_TOTODILE_POKEBALL_IN_ELMS_LAB' }),
    Object.freeze({ id: 'ELMSLAB_POKE_BALL3', x: 8, y: 3, sprite: 'SPRITE_POKE_BALL', script: 'ChikoritaPokeBallScript', appearsWhen: 'EVENT_CHIKORITA_POKEBALL_IN_ELMS_LAB' }),
    Object.freeze({ id: 'ELMSLAB_OFFICER', x: 5, y: 3, sprite: 'SPRITE_OFFICER', script: 'CopScript', appearsWhen: 'EVENT_COP_IN_ELMS_LAB' }),
  ]),
});

/** Return source event records at a coordinate; optional scene filters coordinate events only. */
export function elmLabEventsAt(x, y, scene = null) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return [];
  const inside = ELMS_LAB.dimensions.metatilesWide > x && x >= 0
    && ELMS_LAB.dimensions.metatilesHigh > y && y >= 0;
  if (!inside) return [];
  const matching = (events) => events.filter(event => event.x === x && event.y === y);
  return [
    ...matching(ELMS_LAB.warps).map(event => ({ type: 'warp', ...event })),
    ...matching(ELMS_LAB.coordinateEvents)
      .filter(event => scene === null || event.scene === scene)
      .map(event => ({ type: 'coordinate', ...event })),
    ...matching(ELMS_LAB.backgroundEvents).map(event => ({ type: 'background', ...event })),
    ...matching(ELMS_LAB.objects).map(event => ({ type: 'object', ...event })),
  ];
}
