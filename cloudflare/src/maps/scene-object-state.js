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
  // engine/overworld/decorations.asm ToggleDecorationsVisibility hides the console, both ornaments and the
  // big doll (it sets their EVENT_PLAYERS_HOUSE_2F_* flags) unless the matching wDeco* is owned; a new
  // game owns none of them (wDecoConsole, wDecoLeftOrnament, wDecoRightOrnament, wDecoBigDoll are all 0).
  if (mapId === 'PLAYERS_HOUSE_2F') return false;
  if (mapId === 'NEW_BARK_TOWN' && object.appearsWhen === 'EVENT_RIVAL_NEW_BARK_TOWN' && !state.starter) return false;
  if (mapId === 'ELMS_LAB' && object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starterBall === object.id) return false;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_OFFICER' && state.officerVisible !== true) return false;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter) return false;
  return true;
}
