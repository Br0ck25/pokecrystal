import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { NEW_BARK_TOWN_BLOCK_IDS } from './maps/new-bark-town-blocks.js';
import { ELMS_LAB_BLOCK_IDS } from './maps/elms-lab-blocks.js';
import { PLAYERS_HOUSE_1F_BLOCK_IDS } from './maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F_BLOCK_IDS } from './maps/players-house-2f-blocks.js';
import { ELMS_HOUSE_BLOCK_IDS } from './maps/elms-house-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS } from './maps/players-neighbors-house-blocks.js';
import { LAB_STARTERS, getLabStarter, getLabStarterBallId, mustBlockLabExit } from './maps/starter-selection.js';

const maps = [NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE];
const grids = {
  NEW_BARK_TOWN: NEW_BARK_TOWN_BLOCK_IDS,
  ELMS_LAB: ELMS_LAB_BLOCK_IDS,
  PLAYERS_HOUSE_1F: PLAYERS_HOUSE_1F_BLOCK_IDS,
  PLAYERS_HOUSE_2F: PLAYERS_HOUSE_2F_BLOCK_IDS,
  ELMS_HOUSE: ELMS_HOUSE_BLOCK_IDS,
  PLAYERS_NEIGHBORS_HOUSE: PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS,
};

test('every connected New Bark Town scene has a complete source block grid', () => {
  for (const map of maps) {
    const d = map.dimensions;
    assert.equal(grids[map.id].length, d.blocksWide * d.blocksHigh, map.id + ' block grid length');
    assert.equal(d.metatilesWide, d.blocksWide * 2, map.id + ' metatile width');
    assert.equal(d.metatilesHigh, d.blocksHigh * 2, map.id + ' metatile height');
    for (const event of [...map.warps, ...map.coordinateEvents, ...map.backgroundEvents, ...map.objects]) {
      assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < d.metatilesWide, map.id + ' event x out of bounds: ' + JSON.stringify(event));
      assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < d.metatilesHigh, map.id + ' event y out of bounds: ' + JSON.stringify(event));
    }
  }
});

test('source warp connections include every New Bark Town building and both player-house floors', () => {
  assert.deepEqual(NEW_BARK_TOWN.warps.map(w => [w.x, w.y, w.destinationMap, w.destinationWarp]), [
    [6,3,'ELMS_LAB',1],
    [13,5,'PLAYERS_HOUSE_1F',1],
    [3,11,'PLAYERS_NEIGHBORS_HOUSE',1],
    [11,13,'ELMS_HOUSE',1],
  ]);
  assert.equal(PLAYERS_HOUSE_1F.warps[2].destinationMap, 'PLAYERS_HOUSE_2F');
  assert.equal(PLAYERS_HOUSE_2F.warps[0].destinationMap, 'PLAYERS_HOUSE_1F');
});

test('Elm lab starter ball IDs map to the exact source species, type, and level', () => {
  assert.deepEqual(Object.values(LAB_STARTERS).map(x => [x.species, x.type, x.level]), [
    ['CYNDAQUIL','FIRE',5], ['TOTODILE','WATER',5], ['CHIKORITA','GRASS',5],
  ]);
  for (const [ballId, starter] of Object.entries(LAB_STARTERS)) {
    assert.equal(getLabStarter(ballId).species, starter.species);
    assert.equal(getLabStarterBallId(starter.species), ballId);
  }
  assert.equal(getLabStarter('UNKNOWN'), null);
  assert.equal(canLeaveLabBeforeStarter(null), true);
  assert.equal(canLeaveLabBeforeStarter('CYNDAQUIL'), false);
});

test('source NPC positions and dialogue remain present for the connected scenes', () => {
  assert.deepEqual(NEW_BARK_TOWN.objects.map(o => [o.id, o.x, o.y]), [
    ['NEWBARKTOWN_TEACHER',6,8], ['NEWBARKTOWN_FISHER',12,9], ['NEWBARKTOWN_RIVAL',3,2],
  ]);
  assert.deepEqual(ELMS_HOUSE.objects.map(o => [o.id, o.x, o.y]), [
    ['ELMSHOUSE_ELMS_WIFE',1,5], ['ELMSHOUSE_ELMS_SON',5,4],
  ]);
  assert.match(PLAYERS_HOUSE_1F.objects.find(o => o.id === 'MOM').dialogue.join(' '), /PROF\. ELM was looking for you/);
  assert.match(PLAYERS_NEIGHBORS_HOUSE.objects.find(o => o.id === 'DAUGHTER').dialogue.join(' '), /PIKACHU is an evolved POKéMON/);
});
