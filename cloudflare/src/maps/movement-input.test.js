import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardinalStep, getSpriteFrameRow } from './movement-input.js';

test('movement is cardinal when more than one direction is held', () => {
  assert.deepEqual(getCardinalStep(1, 1), { dx: 0, dy: 1, facing: 'down' });
  assert.deepEqual(getCardinalStep(1, -1), { dx: 0, dy: -1, facing: 'up' });
  assert.deepEqual(getCardinalStep(-1, 0), { dx: -1, dy: 0, facing: 'left' });
  assert.deepEqual(getCardinalStep(0, 1), { dx: 0, dy: 1, facing: 'down' });
  assert.equal(getCardinalStep(0, 0), null);
});

test('source sprite rows alternate walking frames for each direction', () => {
  assert.equal(getSpriteFrameRow('down', 0), 0);
  assert.equal(getSpriteFrameRow('down', 1), 1);
  assert.equal(getSpriteFrameRow('up', 0), 2);
  assert.equal(getSpriteFrameRow('up', 1), 3);
  assert.equal(getSpriteFrameRow('left', 0), 4);
  assert.equal(getSpriteFrameRow('right', 1), 5);
});
