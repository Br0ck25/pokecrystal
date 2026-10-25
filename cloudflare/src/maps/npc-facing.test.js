import test from 'node:test';
import assert from 'node:assert/strict';
import { getNpcFacingTowardPlayer } from './npc-facing.js';

test('faceplayer direction matches each adjacent player position', () => {
  const npc = { x: 5, y: 5 };
  assert.equal(getNpcFacingTowardPlayer(npc, { x: 4, y: 5 }), 'left');
  assert.equal(getNpcFacingTowardPlayer(npc, { x: 6, y: 5 }), 'right');
  assert.equal(getNpcFacingTowardPlayer(npc, { x: 5, y: 4 }), 'up');
  assert.equal(getNpcFacingTowardPlayer(npc, { x: 5, y: 6 }), 'down');
});

test('faceplayer helper refuses non-adjacent or malformed coordinates', () => {
  assert.equal(getNpcFacingTowardPlayer({ x: 2, y: 2 }, { x: 4, y: 2 }), null);
  assert.equal(getNpcFacingTowardPlayer({ x: 2, y: 2 }, { x: 2, y: 2 }), null);
  assert.equal(getNpcFacingTowardPlayer(null, { x: 2, y: 2 }), null);
  assert.equal(getNpcFacingTowardPlayer({ x: NaN, y: 2 }, { x: 2, y: 2 }), null);
});
