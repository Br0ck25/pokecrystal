import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_1F_BLOCK_IDS, getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { PLAYERS_HOUSE_2F_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { ELMS_HOUSE_BLOCK_IDS, getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { isPreviewCollisionWalkable, canPreviewEnterOrWarp } from './maps/new-bark-town-movement.js';
import { LAB_STARTERS, getLabStarter } from './maps/starter-selection.js';

const MAPS = [
  [NEW_BARK_TOWN, NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile],
  [ELMS_LAB, ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile],
  [PLAYERS_HOUSE_1F, PLAYERS_HOUSE_1F_BLOCK_IDS, getPlayersHouse1FCollisionAtMetatile],
  [PLAYERS_HOUSE_2F, PLAYERS_HOUSE_2F_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile],
  [ELMS_HOUSE, ELMS_HOUSE_BLOCK_IDS, getElmsHouseCollisionAtMetatile],
  [PLAYERS_NEIGHBORS_HOUSE, PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile],
];

function reachable(map, collisionAt, start, goal) {
  const d = map.dimensions;
  const queue = [start];
  const seen = new Set([start.x + ',' + start.y]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === goal.x && p.y === goal.y) return true;
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x = p.x + dx, y = p.y + dy, key = x + ',' + y;
      if (seen.has(key) || !canPreviewEnterOrWarp(x, y, d.metatilesWide, d.metatilesHigh, collisionAt, map.warps)) continue;
      seen.add(key); queue.push({ x, y });
    }
  }
  return false;
}

test('all supported New Bark maps have complete grids and in-bounds source event coordinates', () => {
  for (const [map, blocks, collisionAt] of MAPS) {
    const d = map.dimensions;
    assert.equal(blocks.length, d.blocksWide * d.blocksHigh, map.id + ' block count');
    assert.equal(d.metatilesWide, d.blocksWide * 2, map.id + ' width');
    assert.equal(d.metatilesHigh, d.blocksHigh * 2, map.id + ' height');
    for (const group of ['warps', 'coordinateEvents', 'backgroundEvents', 'objects']) {
      for (const event of map[group] || []) {
        assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < d.metatilesWide, map.id + ' ' + group + ' x out of bounds: ' + JSON.stringify(event));
        assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < d.metatilesHigh, map.id + ' ' + group + ' y out of bounds: ' + JSON.stringify(event));
      }
    }
    assert.equal(collisionAt(-1, 0), null, map.id + ' left bound');
    assert.equal(collisionAt(d.metatilesWide, 0), null, map.id + ' right bound');
    assert.equal(collisionAt(0, -1), null, map.id + ' top bound');
    assert.equal(collisionAt(0, d.metatilesHigh), null, map.id + ' bottom bound');
  }
});

test('New Bark Town source objects, signs, and exit events remain present', () => {
  assert.deepEqual(NEW_BARK_TOWN.objects.map(o => [o.id, o.x, o.y]), [
    ['NEWBARKTOWN_TEACHER', 6, 8],
    ['NEWBARKTOWN_FISHER', 12, 9],
    ['NEWBARKTOWN_RIVAL', 3, 2],
  ]);
  assert.deepEqual(NEW_BARK_TOWN.warps.map(w => [w.x, w.y, w.destinationMap, w.destinationWarp]), [
    [6, 3, 'ELMS_LAB', 1],
    [13, 5, 'PLAYERS_HOUSE_1F', 1],
    [3, 11, 'PLAYERS_NEIGHBORS_HOUSE', 1],
    [11, 13, 'ELMS_HOUSE', 1],
  ]);
  assert.equal(NEW_BARK_TOWN.backgroundEvents.length, 4);
  assert.match(NEW_BARK_TOWN.objects[0].dialogue.join(' '), /POKéGEAR is impressive/);
  assert.match(NEW_BARK_TOWN.objects[1].dialogue.join(' '), /PROF\. ELM discovered some new POKéMON/);
  assert.match(NEW_BARK_TOWN.objects[2].dialogue.join(' '), /famous ELM POKéMON LAB/);
});

test('lab starter balls map one-to-one to the original three level-five starters', () => {
  assert.deepEqual(Object.keys(LAB_STARTERS), ['ELMSLAB_POKE_BALL1', 'ELMSLAB_POKE_BALL2', 'ELMSLAB_POKE_BALL3']);
  assert.deepEqual(['ELMSLAB_POKE_BALL1','ELMSLAB_POKE_BALL2','ELMSLAB_POKE_BALL3'].map(id => {
    const s = getLabStarter(id); return [s.species, s.type, s.level];
  }), [['CYNDAQUIL','FIRE',5],['TOTODILE','WATER',5],['CHIKORITA','GRASS',5]]);
  assert.equal(getLabStarter('NOT_A_STARTER'), null);
});

test('all house entrances and the upstairs stair tile have a walkable adjacent landing', () => {
  for (const [map, , collisionAt] of MAPS) {
    for (const warp of map.warps) {
      const candidates = [[warp.x,warp.y],[warp.x+1,warp.y],[warp.x-1,warp.y],[warp.x,warp.y+1],[warp.x,warp.y-1]];
      assert.ok(candidates.some(([x,y]) => canPreviewEnterOrWarp(x,y,map.dimensions.metatilesWide,map.dimensions.metatilesHigh,collisionAt,map.warps)),
        map.id + ' warp has no reachable adjacent tile: ' + JSON.stringify(warp));
    }
  }
  assert.equal(isPreviewCollisionWalkable('STAIRCASE'), true);
});

test('all declared warp destinations are connected to their source map metadata', () => {
  const byId = Object.fromEntries(MAPS.map(([map,,collision]) => [map.id,{map,collision}]));
  for (const [map,,] of MAPS) {
    for (const warp of map.warps) {
      assert.ok(byId[warp.destinationMap], map.id + ' has unregistered destination ' + warp.destinationMap);
      assert.ok(warp.destinationWarp >= 1, map.id + ' has invalid destination warp index');
      assert.ok(byId[warp.destinationMap].map.warps[warp.destinationWarp - 1], map.id + ' destination warp index is missing');
    }
  }
});

test('main walkable areas reach their important destinations without crossing walls', () => {
  assert.equal(reachable(PLAYERS_HOUSE_1F,getPlayersHouse1FCollisionAtMetatile,{x:6,y:6},{x:9,y:0}),true,
    'ground floor entrance must connect to the upstairs stairs');
  assert.equal(reachable(ELMS_LAB,getElmsLabCollisionAtMetatile,{x:4,y:10},{x:6,y:3}),true,
    'lab entry must connect to the starter table area');
  assert.equal(reachable(NEW_BARK_TOWN,getNewBarkTownCollisionAtMetatile,{x:9,y:8},{x:6,y:3}),true,
    'town spawn must connect to Elm Lab entrance');
});
