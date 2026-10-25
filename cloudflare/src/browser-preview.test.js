import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN_BLOCK_IDS } from './maps/new-bark-town-blocks.js';
import { JOHTO_METATILE_TILES } from './maps/johto-metatiles.js';
import { JOHTO_TILESET_PNG_BASE64 } from './assets/johto-tileset.js';

test('browser map preview references tiles present in the 16x12 source atlas', () => {
  assert.equal(NEW_BARK_TOWN_BLOCK_IDS.length, 90);
  assert.equal(JOHTO_TILESET_PNG_BASE64.startsWith('iVBORw0KGgo'), true);
  assert.ok(JOHTO_TILESET_PNG_BASE64.length > 1000);
  for (const blockId of NEW_BARK_TOWN_BLOCK_IDS) {
    assert.ok(Array.isArray(JOHTO_METATILE_TILES[blockId]), `missing block metatile ${blockId}`);
    for (const tileId of JOHTO_METATILE_TILES[blockId]) {
      assert.ok(Number.isInteger(tileId) && tileId >= 0 && tileId < 192, `tile ${tileId} outside 16x12 atlas`);
    }
  }
});
