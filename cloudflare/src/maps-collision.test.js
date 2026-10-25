import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN_BLOCK_IDS } from './maps/new-bark-town-blocks.js';
import { getJohtoMetatileCollision, JOHTO_METATILE_COLLISION } from './maps/johto-collision.js';

test('Johto collision table contains source metatiles 0x00 through 0x77', () => {
  assert.equal(JOHTO_METATILE_COLLISION.length, 0x78);
  assert.deepEqual(JOHTO_METATILE_COLLISION[0x03], ['TALL_GRASS', 'TALL_GRASS', 'TALL_GRASS', 'TALL_GRASS']);
  assert.deepEqual(JOHTO_METATILE_COLLISION[0x05], ['WALL', 'WALL', 'WALL', 'WALL']);
  assert.deepEqual(JOHTO_METATILE_COLLISION[0x14], ['WALL', 'WALL', 'WALL', 'DOOR']);
});

test('collision lookup validates IDs and quadrants', () => {
  assert.equal(getJohtoMetatileCollision(0x03, 2), 'TALL_GRASS');
  assert.equal(getJohtoMetatileCollision(-1), null);
  assert.equal(getJohtoMetatileCollision(0x78), null);
  assert.equal(getJohtoMetatileCollision(1, 4), null);
});

test('every New Bark Town map block currently references a known Johto collision row', () => {
  assert.equal(NEW_BARK_TOWN_BLOCK_IDS.every(id => id < JOHTO_METATILE_COLLISION.length), true);
});
