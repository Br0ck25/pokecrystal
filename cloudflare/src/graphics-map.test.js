import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMapPixels } from './graphics.js';

test('map compositor assembles source metatiles into a continuous pixel grid', () => {
  const decoded = { tileCount: 2, pixels: new Uint8Array(2 * 64) };
  decoded.pixels.fill(1, 0, 64);
  decoded.pixels.fill(2, 64, 128);
  const table = [
    Array(16).fill(0),
    Array(16).fill(1),
  ];
  const result = composeMapPixels([0, 1], 2, 1, table, decoded);
  assert.equal(result.width, 64);
  assert.equal(result.height, 32);
  assert.equal(result.pixels[0], 1);
  assert.equal(result.pixels[31], 1);
  assert.equal(result.pixels[32], 2);
  assert.equal(result.pixels[63], 2);
  assert.throws(() => composeMapPixels([4], 1, 1, table, decoded), /missing metatile/);
});
