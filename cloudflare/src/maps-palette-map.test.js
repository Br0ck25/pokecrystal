import test from 'node:test';
import assert from 'node:assert/strict';
import { JOHTO_TILE_PALETTE_MAP, JOHTO_PALETTE_MAP_GAP, getJohtoTilePalette } from './maps/johto-palette-map.js';

test('Johto palette map preserves source tile palette assignments and padding', () => {
  assert.equal(JOHTO_TILE_PALETTE_MAP.length, 2);
  assert.equal(JOHTO_TILE_PALETTE_MAP[0].length, 96);
  assert.equal(JOHTO_TILE_PALETTE_MAP[1].length, 96);
  assert.equal(JOHTO_PALETTE_MAP_GAP.length, 16);
  assert.deepEqual(JOHTO_TILE_PALETTE_MAP[0].slice(0, 8), ['GRAY', 'BROWN', 'BROWN', 'RED', 'GREEN', 'GREEN', 'GRAY', 'RED']);
  assert.equal(getJohtoTilePalette(1, 0), 'BROWN');
  assert.equal(JOHTO_PALETTE_MAP_GAP[0], 'UNUSED');
});

test('palette lookup rejects invalid indexes without throwing', () => {
  assert.equal(getJohtoTilePalette(-1, 0), null);
  assert.equal(getJohtoTilePalette(0, -1), null);
  assert.equal(getJohtoTilePalette(9, 0), null);
  assert.equal(getJohtoTilePalette(0, 999), null);
});
