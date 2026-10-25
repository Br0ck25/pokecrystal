import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSceneObjectPosition, isSceneObjectVisible } from './scene-object-state.js';

test('Elm is positioned at his opening-scene coordinate, then returns to his source map coordinate', () => {
  const elm = { id: 'ELMSLAB_ELM', x: 5, y: 2 };
  assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: false }), { x: 3, y: 4 });
  assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: true }), { x: 5, y: 2 });
  assert.deepEqual(resolveSceneObjectPosition('NEW_BARK_TOWN', elm, {}), { x: 5, y: 2 });
});

test('runtime position rejects malformed objects and does not mutate source metadata', () => {
  assert.equal(resolveSceneObjectPosition('ELMS_LAB', null, {}), null);
  assert.equal(resolveSceneObjectPosition('ELMS_LAB', { id: 'bad', x: NaN, y: 2 }, {}), null);
  const elm = Object.freeze({ id: 'ELMSLAB_ELM', x: 5, y: 2 });
  resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: false });
  assert.deepEqual({ x: elm.x, y: elm.y }, { x: 5, y: 2 });
});

test('starter balls, officer, and aide visibility follow current starter state', () => {
  const ball = { id: 'ELMSLAB_POKE_BALL1' };
  const officer = { id: 'ELMSLAB_OFFICER' };
  const aide = { id: 'ELMSLAB_ELMS_AIDE' };
  assert.equal(isSceneObjectVisible('ELMS_LAB', ball, { starterBall: null }), true);
  assert.equal(isSceneObjectVisible('ELMS_LAB', ball, { starterBall: 'ELMSLAB_POKE_BALL1' }), false);
  assert.equal(isSceneObjectVisible('ELMS_LAB', officer, { starter: null }), true);
  assert.equal(isSceneObjectVisible('ELMS_LAB', officer, { starter: 'TOTODILE' }), false);
  assert.equal(isSceneObjectVisible('ELMS_LAB', aide, { starter: null }), false);
  assert.equal(isSceneObjectVisible('ELMS_LAB', aide, { starter: 'TOTODILE' }), true);
  assert.equal(isSceneObjectVisible('NEW_BARK_TOWN', ball, { starterBall: ball.id }), true);
});
