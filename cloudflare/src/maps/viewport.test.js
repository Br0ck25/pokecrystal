import test from 'node:test';
import assert from 'node:assert/strict';
import { GBC_VIEWPORT_WIDTH, GBC_VIEWPORT_HEIGHT, SPRITE_Y_OFFSET, getCameraTransform, integerRenderScale } from './viewport.js';

test('uses the original fixed 160x144 Game Boy Color viewport', () => {
  assert.equal(GBC_VIEWPORT_WIDTH, 160);
  assert.equal(GBC_VIEWPORT_HEIGHT, 144);
});

test('camera always puts the player tile at the original screen position (64, 64)', () => {
  assert.deepEqual({ ...getCameraTransform(10, 9) }, { cameraX: 96, cameraY: 80 });
  // Map edges do not clamp: the player's tile maps to (64, 64) wherever it is.
  assert.equal(SPRITE_Y_OFFSET, -4);
  assert.deepEqual({ ...getCameraTransform(0, 0) }, { cameraX: -64, cameraY: -64 });
  assert.deepEqual({ ...getCameraTransform(7, 1) }, { cameraX: 48, cameraY: -48 });
});

test('invalid camera input fails clearly', () => {
  assert.throws(() => getCameraTransform(NaN, 0), TypeError);
  assert.throws(() => getCameraTransform(0, 0, 0), TypeError);
});

test('integerRenderScale picks the largest whole multiple of the 160px screen', () => {
  assert.equal(integerRenderScale(320, 1), 2);
  assert.equal(integerRenderScale(359, 1), 2);
  assert.equal(integerRenderScale(360, 2), 4);
  assert.equal(integerRenderScale(100, 1), 1);
  assert.equal(integerRenderScale(0, 1), 1);
  assert.equal(integerRenderScale(NaN, 1), 1);
  assert.equal(integerRenderScale(480, 0), 3);
});
