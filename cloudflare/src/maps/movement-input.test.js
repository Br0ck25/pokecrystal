import test from 'node:test';
import assert from 'node:assert/strict';
import { getCardinalStep } from './movement-input.js';

test('movement is cardinal when more than one direction is held', () => {
  assert.deepEqual(getCardinalStep(1, 1), { dx: 0, dy: 1, facing: 'down' });
  assert.deepEqual(getCardinalStep(1, -1), { dx: 0, dy: -1, facing: 'up' });
  assert.deepEqual(getCardinalStep(-1, 0), { dx: -1, dy: 0, facing: 'left' });
  assert.deepEqual(getCardinalStep(0, 1), { dx: 0, dy: 1, facing: 'down' });
  assert.equal(getCardinalStep(0, 0), null);
});
