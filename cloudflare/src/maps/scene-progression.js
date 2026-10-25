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
