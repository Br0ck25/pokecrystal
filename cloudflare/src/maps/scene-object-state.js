/**
 * Resolve runtime object state that differs from static map event coordinates.
 * Keep this pure so movement, rendering, and interaction tests can share it.
 */
export function resolveSceneObjectPosition(mapId, object, state = {}) {
  if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.y)) return null;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_ELM') {
    // ElmsLabMoveElmCallback places Elm at (3, 4) only during the first-meeting
    // scene; after the intro he returns to his ordinary map-object position.
    return state.labIntroComplete
      ? { x: object.x, y: object.y }
      : { x: 3, y: 4 };
  }
  return { x: object.x, y: object.y };
}

export function isSceneObjectVisible(mapId, object, state = {}) {
  if (!object) return false;
  if (mapId === 'ELMS_LAB' && object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starterBall === object.id) return false;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_OFFICER' && state.starter) return false;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter) return false;
  return true;
}
