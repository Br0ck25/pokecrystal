import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { isPreviewCollisionWalkable } from './maps/new-bark-town-movement.js';

const MAPS = [
  { map: NEW_BARK_TOWN, collision: getNewBarkTownCollisionAtMetatile, spawn: [6, 4] },
  { map: ELMS_LAB, collision: getElmsLabCollisionAtMetatile, spawn: [4, 10] },
  { map: PLAYERS_HOUSE_1F, collision: getPlayersHouse1FCollisionAtMetatile, spawn: [6, 6] },
  { map: PLAYERS_HOUSE_2F, collision: getPlayersHouse2FCollisionAtMetatile, spawn: [3, 3] },
  { map: ELMS_HOUSE, collision: getElmsHouseCollisionAtMetatile, spawn: [3, 6] },
  { map: PLAYERS_NEIGHBORS_HOUSE, collision: getPlayersNeighborsHouseCollisionAtMetatile, spawn: [2, 6] },
];

function reachable(map, collision, start, target, blockObjects = true) {
  const { metatilesWide: width, metatilesHigh: height } = map.dimensions;
  const queue = [start];
  const seen = new Set([start.join(',')]);
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    if (x === target.x && y === target.y) return true;
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const key = nx + ',' + ny;
      if (seen.has(key)) continue;
      const isWarp = map.warps.some(warp => warp.x === nx && warp.y === ny);
      const occupiedByObject = blockObjects && (map.objects || []).some(object => object.x === nx && object.y === ny);
      if (occupiedByObject || (!isWarp && !isPreviewCollisionWalkable(collision(nx, ny)))) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

test('source spawn and every doorway/stair are reachable in each supported map', () => {
  for (const { map, collision, spawn } of MAPS) {
    assert.ok(isPreviewCollisionWalkable(collision(...spawn)), map.id + ' spawn must be walkable');
    for (const warp of map.warps) {
      assert.ok(reachable(map, collision, spawn, warp), map.id + ' has an unreachable warp at (' + warp.x + ',' + warp.y + '); inspect source collision quadrants and visual tile alignment');
    }
  }
});

test('room object interaction tiles have at least one adjacent walkable approach', () => {
  for (const { map, collision } of MAPS) {
    for (const object of map.objects || []) {
      const adjacent = [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => {
        const x = object.x + dx, y = object.y + dy;
        return x >= 0 && y >= 0 && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh
          && isPreviewCollisionWalkable(collision(x,y));
      });
      assert.ok(adjacent, map.id + ' object ' + object.id + ' has no walkable interaction tile');
    }
  }
});


test('doorways remain reachable when source object sprites block movement', () => {
  for (const { map, collision, spawn } of MAPS) {
    for (const warp of map.warps) {
      assert.ok(
        reachable(map, collision, spawn, warp, true),
        map.id + ' doorway (' + warp.x + ',' + warp.y + ') is unreachable when NPC/furniture object tiles block movement',
      );
    }
  }
});

test('walkable source signs, radios and room props have reachable approach tiles', () => {
  for (const { map, collision, spawn } of MAPS) {
    for (const event of map.backgroundEvents || []) {
      // These lab bookshelves sit directly behind the workbench. The source
      // collision data marks the intervening lower half as WALL, so the
      // original map event exists but cannot be reached from the walkable floor.
      if (event.kind === 'bookshelf'
          || (map.id === 'ELMS_LAB' && event.script === 'ElmsLabBookshelf')
          || (map.id === 'ELMS_HOUSE' && event.kind === 'pc')) continue;
      const approaches = [[0,1],[1,0],[0,-1],[-1,0]]
        .map(([dx,dy]) => ({ x: event.x + dx, y: event.y + dy }))
        .filter(({x,y}) => x >= 0 && y >= 0
          && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh
          && isPreviewCollisionWalkable(collision(x,y))
          && !(map.objects || []).some(object => object.x === x && object.y === y));
      assert.ok(approaches.length, map.id + ' background event ' + (event.script || event.kind) + ' has no walkable approach');
      let canReach = approaches.some(target => reachable(map, collision, spawn, target, true));
      // In Elm's Lab, the three starter balls form a temporary barrier across
      // the upper workbench. Once any one is selected, its object disappears,
      // opening the source-accurate route to the research bookshelves.
      if (!canReach && map.id === 'ELMS_LAB') {
        for (const ballId of ['ELMSLAB_POKE_BALL1', 'ELMSLAB_POKE_BALL2', 'ELMSLAB_POKE_BALL3']) {
          const afterStarterChoice = {
            ...map,
            objects: map.objects.filter(object => object.id !== ballId),
          };
          if (approaches.some(target => reachable(afterStarterChoice, collision, spawn, target, true))) {
            canReach = true;
            break;
          }
        }
      }
      assert.ok(
        canReach,
        map.id + ' background event ' + (event.script || event.kind) + ' at (' + event.x + ',' + event.y + ') cannot be reached in any valid scene state; approaches=' + JSON.stringify(approaches.map(target => ({...target, collision: collision(target.x,target.y)}))),
      );
    }
  }
});


test('Elm lab workbench blocks remain blocked according to source collision data', () => {
  const map = MAPS.find(entry => entry.map.id === 'ELMS_LAB');
  for (const [x, y] of [[6,3],[7,3],[8,3],[9,3]]) {
    assert.equal(isPreviewCollisionWalkable(map.collision(x,y)), false,
      'the visible workbench edge at (' + x + ',' + y + ') must not become walkable');
  }
});
