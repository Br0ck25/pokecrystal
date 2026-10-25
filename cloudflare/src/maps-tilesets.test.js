import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from './generated/maps.js';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';

test('every ported map declares the tileset and size data/maps/maps.asm gives it', () => {
  for (const map of [NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE]) {
    const source = MAPS[map.id];
    assert.ok(source, map.id);
    assert.equal(map.tileset, source.tileset, `${map.id} tileset`);
    assert.equal(map.dimensions.blocksWide, source.width, `${map.id} width`);
    assert.equal(map.dimensions.blocksHigh, source.height, `${map.id} height`);
  }
});
