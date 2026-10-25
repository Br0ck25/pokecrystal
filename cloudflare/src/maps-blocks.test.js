import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BARK_TOWN_BLOCK_IDS,
  getNewBarkTownBlock,
  getNewBarkTownBlockAtTile,
} from './maps/new-bark-town-blocks.js';

test('source New Bark Town block file contains exactly 10 by 9 block IDs', () => {
  assert.equal(NEW_BARK_TOWN_BLOCK_IDS.length, 90);
  assert.equal(getNewBarkTownBlock(0, 0), 5);
  assert.equal(getNewBarkTownBlock(2, 0), 24);
  assert.equal(getNewBarkTownBlock(9, 8), 5);
});

test('tile coordinates resolve to their containing 2x2 source block', () => {
  assert.equal(getNewBarkTownBlockAtTile(0, 0), 5);
  assert.equal(getNewBarkTownBlockAtTile(4, 0), 24);
  assert.equal(getNewBarkTownBlockAtTile(19, 17), 5);
  assert.equal(getNewBarkTownBlockAtTile(20, 0), null);
  assert.equal(getNewBarkTownBlockAtTile(0, 18), null);
  assert.equal(getNewBarkTownBlockAtTile(-1, 0), null);
});
