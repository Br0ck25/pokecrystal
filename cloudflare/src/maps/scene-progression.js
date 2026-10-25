/** Source-scene progression guards shared by the runtime and regression tests. */
export function shouldStartElmOpeningScene({ mapId, previousMapId, starter, labIntroComplete }) {
  return mapId === 'ELMS_LAB'
    && previousMapId !== 'ELMS_LAB'
    && !starter
    && !labIntroComplete;
}

/** Crystal's first Elm scene loops on NO and cannot be cancelled before YES. */
export function canCancelPendingScene(pendingScene) {
  return pendingScene !== 'LAB_INTRO';
}

/** Exact direction sequence in ElmsLab_WalkUpToElmMovement from maps/ElmsLab.asm. */
export const ELM_OPENING_MOVEMENT = Object.freeze(['up','up','up','up','up','up','up']);

/** Exact actor order from ElmsLab_ElmToDefaultPositionMovement1/2 and turnobject calls. */
export const ELM_RETURN_TO_STATION_MOVEMENT = Object.freeze([
  Object.freeze({ actor: 'ELM', direction: 'up' }),
  Object.freeze({ actor: 'PLAYER', facing: 'up' }),
  Object.freeze({ actor: 'ELM', direction: 'right' }),
  Object.freeze({ actor: 'ELM', direction: 'right' }),
  Object.freeze({ actor: 'ELM', direction: 'up' }),
  Object.freeze({ actor: 'ELM', facing: 'down' }),
  Object.freeze({ actor: 'PLAYER', facing: 'right' }),
]);
