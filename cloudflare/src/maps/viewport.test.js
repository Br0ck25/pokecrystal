import test from 'node:test';
import assert from 'node:assert/strict';
import { GBC_VIEWPORT_WIDTH, GBC_VIEWPORT_HEIGHT, getCameraTransform, integerRenderScale } from './viewport.js';

test('uses the original fixed 160x144 Game Boy Color viewport', () => {
  assert.equal(GBC_VIEWPORT_WIDTH, 160);
  assert.equal(GBC_VIEWPORT_HEIGHT, 144);
});

test('camera follows the player on large outdoor maps without revealing the whole map', () => {
  const camera = getCameraTransform(20, 18, 10, 9);
  assert.equal(camera.cameraX, 88);
  assert.equal(camera.cameraY, 80);
  assert.equal(camera.worldWidth, 320);
  assert.equal(camera.worldHeight, 288);
});

test('camera clamps to map edges instead of showing outside the map', () => {
  const start = getCameraTransform(20, 18, 0, 0);
  const end = getCameraTransform(20, 18, 19, 17);
  assert.equal(start.cameraX, 0);
  assert.equal(start.cameraY, 0);
  assert.equal(end.cameraX, 160);
  assert.equal(end.cameraY, 144);
});

test('small rooms stay centered in the viewport and do not jitter at edges', () => {
  const camera = getCameraTransform(8, 8, 4, 4);
  assert.equal(camera.cameraX, 0);
  assert.equal(camera.cameraY, 0);
  assert.equal(camera.originX, 16);
  assert.equal(camera.originY, 8);
});

test('invalid map dimensions fail clearly', () => {
  assert.throws(() => getCameraTransform(0, 18, 0, 0), TypeError);
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
