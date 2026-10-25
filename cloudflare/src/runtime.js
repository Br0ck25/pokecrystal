/*
 * Browser-port runtime foundation.
 * This file deliberately contains no invented map or substitute game rules.
 * Map/event adapters must be populated from the source disassembly before this
 * runtime can be called a playable Pokémon Crystal port.
 */
export const CRYSTAL_VIEW = Object.freeze({
  logicalWidth: 160,
  logicalHeight: 144,
  tileSize: 8,
  scaleMode: 'integer',
});

export const DIRECTIONS = Object.freeze({
  up: Object.freeze({ dx: 0, dy: -1, facing: 'up' }),
  down: Object.freeze({ dx: 0, dy: 1, facing: 'down' }),
  left: Object.freeze({ dx: -1, dy: 0, facing: 'left' }),
  right: Object.freeze({ dx: 1, dy: 0, facing: 'right' }),
});

export function createGameState(seed = {}) {
  return {
    schemaVersion: 1,
    mode: 'source-data-required',
    mapId: seed.mapId ?? null,
    player: {
      x: Number.isInteger(seed.player?.x) ? seed.player.x : 0,
      y: Number.isInteger(seed.player?.y) ? seed.player.y : 0,
      facing: DIRECTIONS[seed.player?.facing] ? seed.player.facing : 'down',
      moving: false,
    },
    flags: { ...(seed.flags ?? {}) },
    scriptState: seed.scriptState ?? null,
  };
}

/*
 * Collision and map transitions are supplied by a source-derived map adapter.
 * This method refuses movement if no adapter is available rather than guessing
 * which tiles are walkable.
 */
export function tryStep(state, direction, mapAdapter) {
  const step = DIRECTIONS[direction];
  if (!step) return { ok: false, reason: 'unknown-direction' };
  state.player.facing = step.facing;
  if (!mapAdapter || typeof mapAdapter.canEnter !== 'function') {
    return { ok: false, reason: 'source-map-adapter-missing' };
  }
  const x = state.player.x + step.dx;
  const y = state.player.y + step.dy;
  if (!mapAdapter.canEnter(state.mapId, x, y, state)) {
    return { ok: false, reason: 'blocked' };
  }
  const transition = typeof mapAdapter.transitionAt === 'function'
    ? mapAdapter.transitionAt(state.mapId, x, y, state)
    : null;
  state.player.x = x;
  state.player.y = y;
  if (transition) {
    state.mapId = transition.mapId;
    if (Number.isInteger(transition.x)) state.player.x = transition.x;
    if (Number.isInteger(transition.y)) state.player.y = transition.y;
  }
  return { ok: true, transition };
}

export function saveToStorage(state, storage = globalThis.localStorage) {
  if (!storage) throw new Error('Browser storage is unavailable');
  const payload = { ...state, savedAt: new Date().toISOString() };
  storage.setItem('crystal-browser-save-v1', JSON.stringify(payload));
  return payload.savedAt;
}

export function loadFromStorage(storage = globalThis.localStorage) {
  if (!storage) return null;
  const raw = storage.getItem('crystal-browser-save-v1');
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved?.schemaVersion !== 1 || !saved.player || typeof saved.player !== 'object') return null;
    return createGameState(saved);
  } catch {
    return null;
  }
}

export function configureCrispCanvas(canvas, cssWidth, cssHeight) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError('Expected a canvas element');
  const ratio = Math.max(1, Math.floor(Math.min(cssWidth / CRYSTAL_VIEW.logicalWidth, cssHeight / CRYSTAL_VIEW.logicalHeight)));
  canvas.width = CRYSTAL_VIEW.logicalWidth * ratio;
  canvas.height = CRYSTAL_VIEW.logicalHeight * ratio;
  canvas.style.width = `${canvas.width}px`;
  canvas.style.height = `${canvas.height}px`;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.imageSmoothingEnabled = false;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, scale: ratio, width: CRYSTAL_VIEW.logicalWidth, height: CRYSTAL_VIEW.logicalHeight };
}