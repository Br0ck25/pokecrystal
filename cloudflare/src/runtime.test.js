import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, tryStep, loadFromStorage, saveToStorage } from './runtime.js';

test('state starts without pretending a map is loaded', () => {
  const state = createGameState();
  assert.equal(state.mode, 'source-data-required');
  assert.equal(state.mapId, null);
  assert.deepEqual(state.player, { x: 0, y: 0, facing: 'down', moving: false });
});

test('movement refuses to guess when source map adapter is missing', () => {
  const state = createGameState();
  const result = tryStep(state, 'right', null);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'source-map-adapter-missing');
  assert.equal(state.player.x, 0);
  assert.equal(state.player.facing, 'right');
});

test('movement uses adapter collision and applies map transitions', () => {
  const state = createGameState({ mapId: 'TEST', player: { x: 2, y: 3 } });
  const adapter = {
    canEnter: (_map, x, y) => x >= 0 && y >= 0 && !(x === 3 && y === 3),
    transitionAt: (_map, x, y) => x === 2 && y === 2 ? { mapId: 'NEXT', x: 7, y: 8 } : null,
  };
  assert.equal(tryStep(state, 'right', adapter).reason, 'blocked');
  assert.equal(state.player.x, 2);
  const moved = tryStep(state, 'up', adapter);
  assert.equal(moved.ok, true);
  assert.equal(state.mapId, 'NEXT');
  assert.equal(state.player.x, 7);
  assert.equal(state.player.y, 8);
});

test('save and load round-trip the portable game state', () => {
  const store = new Map();
  const storage = { setItem: (key, value) => store.set(key, value), getItem: key => store.get(key) ?? null };
  const state = createGameState({ mapId: 'TEST', player: { x: 5, y: 6, facing: 'left' }, flags: { gotStarter: true } });
  saveToStorage(state, storage);
  const loaded = loadFromStorage(storage);
  assert.equal(loaded.mapId, 'TEST');
  assert.equal(loaded.player.x, 5);
  assert.equal(loaded.player.y, 6);
  assert.equal(loaded.player.facing, 'left');
  assert.equal(loaded.flags.gotStarter, true);
});

test('invalid saves are ignored', () => {
  const storage = { getItem: () => '{bad json' };
  assert.equal(loadFromStorage(storage), null);
});