import test from 'node:test';
import assert from 'node:assert/strict';
import { composeMetatilePixels } from './graphics.js';

test('metatile composition arranges 16 8x8 tiles into a 32x32 palette-index image', () => {
  const pixels = new Uint8Array(16 * 64);
  for (let tile = 0; tile < 16; tile++) pixels.fill(tile, tile * 64, (tile + 1) * 64);
  const result = composeMetatilePixels(7, Array.from({ length: 16 }, (_, i) => i), { tileCount: 16, pixels });
  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  assert.equal(result.pixels.length, 1024);
  assert.equal(result.pixels[0], 0);
  assert.equal(result.pixels[8], 1);
  assert.equal(result.pixels[8 * 32], 4);
  assert.equal(result.pixels[31 * 32 + 31], 15);
  assert.throws(() => composeMetatilePixels(7, [999], { tileCount: 1, pixels }), /exactly 16/);
});
