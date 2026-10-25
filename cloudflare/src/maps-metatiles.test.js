import test from 'node:test';
import assert from 'node:assert/strict';
import { JOHTO_METATILE_TILES, getJohtoMetatileTiles } from './maps/johto-metatiles.js';

test('Johto metatile binary decodes into 128 rows of 16 tile IDs', () => {
  assert.equal(JOHTO_METATILE_TILES.length, 128);
  assert.equal(JOHTO_METATILE_TILES.every(row => row.length === 16), true);
  assert.deepEqual(getJohtoMetatileTiles(0), Array(16).fill(0));
  assert.deepEqual(getJohtoMetatileTiles(1), Array(16).fill(6));
  assert.equal(getJohtoMetatileTiles(128), null);
});
