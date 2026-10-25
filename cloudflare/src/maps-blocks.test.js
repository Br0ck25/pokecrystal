import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownBlockAtMetatile, getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';

test('New Bark Town source block grid is 10 by 9', () => {
  assert.equal(NEW_BARK_TOWN_BLOCK_IDS.length, 90);
  assert.equal(getNewBarkTownBlockAtMetatile(0, 0), 5);
  assert.equal(getNewBarkTownBlockAtMetatile(4, 0), 24);
  assert.equal(getNewBarkTownBlockAtMetatile(19, 17), 5);
  assert.equal(getNewBarkTownBlockAtMetatile(20, 0), null);
  assert.equal(getNewBarkTownBlockAtMetatile(0, 18), null);
});

test('collision uses the correct quadrant of each 32x32 map block', () => {
  assert.equal(getNewBarkTownCollisionAtMetatile(0, 0), 'WALL');
  assert.equal(getNewBarkTownCollisionAtMetatile(1, 0), 'WALL');
  assert.equal(getNewBarkTownCollisionAtMetatile(0, 16), 'WALL');
  assert.equal(getNewBarkTownCollisionAtMetatile(20, 0), null);
});
