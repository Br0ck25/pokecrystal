import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { LAB_STARTERS, getLabStarter, getLabStarterBallId, mustBlockLabExit } from './maps/starter-selection.js';
import { CRYSTAL_EXTRA_SPRITES } from './assets/source-sprites.js';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';
import { PLAYERS_HOUSE_1F_BLOCK_IDS, getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { ELMS_HOUSE_BLOCK_IDS, getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { isPreviewCollisionWalkable, canPreviewEnterOrWarp } from './maps/new-bark-town-movement.js';

const MAPS = [NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE];

test('every declared warp, background event and object is inside its source map', () => {
  for (const map of MAPS) {
    const d = map.dimensions;
    for (const type of ['warps', 'coordinateEvents', 'backgroundEvents', 'objects']) {
      for (const event of map[type] || []) {
        assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < d.metatilesWide,
          map.id + ' ' + type + ' x out of bounds: ' + JSON.stringify(event));
        assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < d.metatilesHigh,
          map.id + ' ' + type + ' y out of bounds: ' + JSON.stringify(event));
      }
    }
  }
});

test('New Bark Town has the source entrance warps and three expected overworld NPCs', () => {
  assert.deepEqual(NEW_BARK_TOWN.warps.map(w => [w.x, w.y, w.destinationMap, w.destinationWarp]), [
    [6, 3, 'ELMS_LAB', 1],
    [13, 5, 'PLAYERS_HOUSE_1F', 1],
    [3, 11, 'PLAYERS_NEIGHBORS_HOUSE', 1],
    [11, 13, 'ELMS_HOUSE', 1],
  ]);
  assert.deepEqual(NEW_BARK_TOWN.objects.map(o => o.id), [
    'NEWBARKTOWN_TEACHER', 'NEWBARKTOWN_FISHER', 'NEWBARKTOWN_RIVAL',
  ]);
  assert.deepEqual(NEW_BARK_TOWN.objects.map(({x,y}) => [x,y]), [[6,8],[12,9],[3,2]]);
});

test('Elm and starter balls retain their source event positions and species mapping', () => {
  assert.deepEqual(ELMS_LAB.objects.map(o => [o.id,o.x,o.y]).slice(0,4), [
    ['ELMSLAB_ELM',5,2],
    ['ELMSLAB_ELMS_AIDE',2,9],
    ['ELMSLAB_POKE_BALL1',6,3],
    ['ELMSLAB_POKE_BALL2',7,3],
  ]);
  assert.deepEqual(getLabStarter('ELMSLAB_POKE_BALL1'), {species:'CYNDAQUIL',type:'FIRE',level:5});
  assert.deepEqual(getLabStarter('ELMSLAB_POKE_BALL2'), {species:'TOTODILE',type:'WATER',level:5});
  assert.deepEqual(getLabStarter('ELMSLAB_POKE_BALL3'), {species:'CHIKORITA',type:'GRASS',level:5});
  for (const [ball, data] of Object.entries(LAB_STARTERS)) assert.equal(getLabStarterBallId(data.species), ball);
  assert.equal(mustBlockLabExit(null), true);
  assert.equal(mustBlockLabExit('CYNDAQUIL'), false);
});

test('source starter art is embedded as valid PNG data', () => {
  for (const name of ['CYNDAQUIL','TOTODILE','CHIKORITA']) {
    const data = CRYSTAL_EXTRA_SPRITES[name];
    assert.ok(typeof data === 'string' && data.startsWith('iVBORw0KGgo'), name + ' must be embedded PNG data');
  }
});

test('the player bedroom has source interaction coordinates for PC, radio, console and dolls', () => {
  assert.deepEqual(PLAYERS_HOUSE_2F.backgroundEvents.map(e => [e.kind,e.x,e.y]), [
    ['pc',2,1],['radio',3,1],['bookshelf',5,1],['poster',6,0],
  ]);
  assert.deepEqual(PLAYERS_HOUSE_2F.objects.map(o => [o.id,o.x,o.y]), [
    ['CONSOLE',4,2],['DOLL_1',4,4],['DOLL_2',5,4],['BIG_DOLL',0,1],
  ]);
});


function reachableWarpCoordinates(map, collisionAt, start) {
  const { metatilesWide: width, metatilesHigh: height } = map.dimensions;
  const queue = [start];
  const seen = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
      if (seen.has(key) || !canPreviewEnterOrWarp(nx, ny, width, height, collisionAt, map.warps)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return { seen, missing: map.warps.filter(warp => !seen.has(warp.x + ',' + warp.y)) };
}

test('all building exits and stairs can be reached from their normal arrival points', () => {
  const cases = [
    [NEW_BARK_TOWN, getNewBarkTownCollisionAtMetatile, [6,4]],
    [ELMS_LAB, getElmsLabCollisionAtMetatile, [5,10]],
    [PLAYERS_HOUSE_1F, getPlayersHouse1FCollisionAtMetatile, [6,6]],
    [PLAYERS_HOUSE_2F, getPlayersHouse2FCollisionAtMetatile, [3,3]],
    [ELMS_HOUSE, getElmsHouseCollisionAtMetatile, [4,6]],
    [PLAYERS_NEIGHBORS_HOUSE, getPlayersNeighborsHouseCollisionAtMetatile, [3,6]],
  ];
  for (const [map, collisionAt, start] of cases) {
    const result = reachableWarpCoordinates(map, collisionAt, start);
    assert.deepEqual(result.missing, [], map.id + ' unreachable warp(s) from ' + start.join(','));
  }
});

test('all map block grids have exact dimensions and all source metatile IDs are defined', () => {
  const grids = [
    [NEW_BARK_TOWN, NEW_BARK_TOWN_BLOCK_IDS],
    [ELMS_LAB, ELMS_LAB_BLOCK_IDS],
    [PLAYERS_HOUSE_1F, PLAYERS_HOUSE_1F_BLOCK_IDS],
    [PLAYERS_HOUSE_2F, PLAYERS_HOUSE_2F_BLOCK_IDS],
    [ELMS_HOUSE, ELMS_HOUSE_BLOCK_IDS],
    [PLAYERS_NEIGHBORS_HOUSE, PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS],
  ];
  for (const [map, blocks] of grids) {
    assert.equal(blocks.length, map.dimensions.blocksWide * map.dimensions.blocksHigh, map.id + ' block grid length');
    assert.ok(blocks.every(id => Number.isInteger(id) && id >= 0 && id < 128), map.id + ' invalid metatile ID');
  }
});


test('every source NPC and starter ball has at least one reachable interaction tile', () => {
  const cases = [
    [NEW_BARK_TOWN, getNewBarkTownCollisionAtMetatile, [6,4]],
    [ELMS_LAB, getElmsLabCollisionAtMetatile, [5,10]],
    [PLAYERS_HOUSE_1F, getPlayersHouse1FCollisionAtMetatile, [6,6]],
    [PLAYERS_HOUSE_2F, getPlayersHouse2FCollisionAtMetatile, [3,3]],
    [ELMS_HOUSE, getElmsHouseCollisionAtMetatile, [4,6]],
    [PLAYERS_NEIGHBORS_HOUSE, getPlayersNeighborsHouseCollisionAtMetatile, [3,6]],
  ];
  for (const [map, collisionAt, start] of cases) {
    const { seen } = reachableWarpCoordinates(map, collisionAt, start);
    for (const object of map.objects || []) {
      const adjacent = [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => {
        const x = object.x + dx, y = object.y + dy;
        return seen.has(x + ',' + y) && isPreviewCollisionWalkable(collisionAt(x,y));
      });
      assert.equal(adjacent, true, map.id + ' object has no reachable interaction tile: ' + object.id);
    }
  }
});
