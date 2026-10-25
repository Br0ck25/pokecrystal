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
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';
import { getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { isPreviewCollisionWalkable } from './maps/new-bark-town-movement.js';
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
  assert.equal(mustBlockLabExit(null), true);
  assert.equal(mustBlockLabExit('CYNDAQUIL'), false);
});

test('source NPC positions and dialogue remain present for the connected scenes', () => {
  assert.deepEqual(NEW_BARK_TOWN.objects.map(o => [o.id, o.x, o.y]), [
    ['NEWBARKTOWN_TEACHER',6,8], ['NEWBARKTOWN_FISHER',12,9], ['NEWBARKTOWN_RIVAL',3,2],
  ]);
  assert.deepEqual(ELMS_HOUSE.objects.map(o => [o.id, o.x, o.y]), [
    ['ELMS_WIFE',1,5], ['ELMS_SON',5,4],
  ]);
  assert.match(PLAYERS_HOUSE_1F.objects.find(o => o.id === 'MOM').dialogue.join(' '), /PROF\. ELM was looking for you/);
  assert.match(PLAYERS_NEIGHBORS_HOUSE.objects.find(o => o.id === 'DAUGHTER').dialogue.join(' '), /PIKACHU is an evolved POKéMON/);
});


const collisionLookups = {
  NEW_BARK_TOWN: getNewBarkTownCollisionAtMetatile,
  ELMS_LAB: getElmsLabCollisionAtMetatile,
  PLAYERS_HOUSE_1F: getPlayersHouse1FCollisionAtMetatile,
  PLAYERS_HOUSE_2F: getPlayersHouse2FCollisionAtMetatile,
  ELMS_HOUSE: getElmsHouseCollisionAtMetatile,
  PLAYERS_NEIGHBORS_HOUSE: getPlayersNeighborsHouseCollisionAtMetatile,
};

function reachableFrom(map, collisionAt, start) {
  const { metatilesWide: width, metatilesHigh: height } = map.dimensions;
  const key = (x, y) => `${x},${y}`;
  if (start.x < 0 || start.y < 0 || start.x >= width || start.y >= height) return new Set();
  const visited = new Set([key(start.x, start.y)]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy, nextKey = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || visited.has(nextKey)) continue;
      const warp = map.warps.some(w => w.x === nx && w.y === ny);
      if (!warp && !isPreviewCollisionWalkable(collisionAt(nx, ny))) continue;
      visited.add(nextKey); queue.push({ x: nx, y: ny });
    }
  }
  return visited;
}

test('scene audit: every NPC has a reachable adjacent tile from its map entry', () => {
  const starts = {
    NEW_BARK_TOWN: { x: 13, y: 6 },
    ELMS_LAB: { x: 5, y: 10 },
    PLAYERS_HOUSE_1F: { x: 6, y: 6 },
    PLAYERS_HOUSE_2F: { x: 3, y: 3 },
    ELMS_HOUSE: { x: 5, y: 6 },
    PLAYERS_NEIGHBORS_HOUSE: { x: 3, y: 6 },
  };
  for (const map of maps) {
    const reachable = reachableFrom(map, collisionLookups[map.id], starts[map.id]);
    assert.ok(reachable.size > 0, map.id + ': start tile is not reachable');
    for (const object of map.objects || []) {
      const adjacent = [[object.x,object.y-1],[object.x+1,object.y],[object.x,object.y+1],[object.x-1,object.y]];
      assert.ok(adjacent.some(([x,y]) => reachable.has(`${x},${y}`)),
        `${map.id}: ${object.id} at (${object.x},${object.y}) has no reachable interaction tile`);
    }
  }
});

test('scene audit: all three starter balls are reachable from the lab doorway and map to source species', () => {
  const reachable = reachableFrom(ELMS_LAB, getElmsLabCollisionAtMetatile, { x: 5, y: 10 });
  const expected = [
    ['ELMSLAB_POKE_BALL1', 'CYNDAQUIL', 6, 3],
    ['ELMSLAB_POKE_BALL2', 'TOTODILE', 7, 3],
    ['ELMSLAB_POKE_BALL3', 'CHIKORITA', 8, 3],
  ];
  for (const [id, species, x, y] of expected) {
    const object = ELMS_LAB.objects.find(candidate => candidate.id === id);
    assert.ok(object, 'missing ' + id);
    assert.deepEqual([object.x, object.y], [x, y], id + ' source coordinates');
    assert.equal(getLabStarter(id).species, species);
    assert.ok([[x,y-1],[x+1,y],[x,y+1],[x-1,y]].some(([ax,ay]) => reachable.has(`${ax},${ay}`)),
      id + ' must be reachable from the lab entrance');
  }
});

test('scene audit: every warp references a registered map and valid destination warp index', () => {
  const byId = Object.fromEntries(maps.map(map => [map.id, map]));
  for (const map of maps) {
    for (const warp of map.warps) {
      assert.ok(warp.x >= 0 && warp.y >= 0 && warp.x < map.dimensions.metatilesWide && warp.y < map.dimensions.metatilesHigh,
        map.id + ': out-of-bounds source warp');
      const destination = byId[warp.destinationMap];
      assert.ok(destination, map.id + ': unregistered destination ' + warp.destinationMap);
      assert.ok(Number.isInteger(warp.destinationWarp) && warp.destinationWarp > 0,
        map.id + ': invalid destination warp index');
      assert.ok(destination.warps[warp.destinationWarp - 1],
        map.id + ': destination warp index missing in ' + warp.destinationMap);
    }
  }
});
