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
import { canPreviewEnterOrWarp, isPreviewCollisionWalkable } from './maps/new-bark-town-movement.js';
import { resolveSceneObjectPosition } from './maps/scene-object-state.js';
import { JOHTO_METATILE_TILES } from './maps/johto-metatiles.js';
import { HOUSE_METATILE_TILES } from './maps/house-metatiles.js';
import { LAB_METATILE_TILES } from './maps/lab-metatiles.js';
import { PLAYERS_HOUSE_METATILE_TILES } from './maps/players-house-metatiles.js';
import { PLAYERS_ROOM_METATILE_TILES } from './maps/players-room-metatiles.js';

const MAPS = [
  { map: NEW_BARK_TOWN, blocks: NEW_BARK_TOWN_BLOCK_IDS, collisionAt: getNewBarkTownCollisionAtMetatile, tiles: JOHTO_METATILE_TILES, spawn: [6, 4] },
  { map: ELMS_LAB, blocks: ELMS_LAB_BLOCK_IDS, collisionAt: getElmsLabCollisionAtMetatile, tiles: LAB_METATILE_TILES, spawn: [4, 10] },
  { map: PLAYERS_HOUSE_1F, blocks: PLAYERS_HOUSE_1F_BLOCK_IDS, collisionAt: getPlayersHouse1FCollisionAtMetatile, tiles: PLAYERS_HOUSE_METATILE_TILES, spawn: [6, 6] },
  { map: PLAYERS_HOUSE_2F, blocks: PLAYERS_HOUSE_2F_BLOCK_IDS, collisionAt: getPlayersHouse2FCollisionAtMetatile, tiles: PLAYERS_ROOM_METATILE_TILES, spawn: [3, 3] },
  { map: ELMS_HOUSE, blocks: ELMS_HOUSE_BLOCK_IDS, collisionAt: getElmsHouseCollisionAtMetatile, tiles: PLAYERS_HOUSE_METATILE_TILES, spawn: [3, 6] },
  { map: PLAYERS_NEIGHBORS_HOUSE, blocks: PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, collisionAt: getPlayersNeighborsHouseCollisionAtMetatile, tiles: HOUSE_METATILE_TILES, spawn: [2, 6] },
];

test('every scene map block grid and metatile reference is structurally valid', () => {
  for (const { map, blocks, tiles } of MAPS) {
    const d = map.dimensions;
    assert.equal(blocks.length, d.blocksWide * d.blocksHigh, map.id + ' block count');
    assert.ok(tiles.length > 0, map.id + ' has metatile definitions');
    for (const id of blocks) assert.ok(Number.isInteger(id) && id >= 0 && id < tiles.length, map.id + ' invalid block ' + id);
    for (const [index, metatile] of tiles.entries()) {
      assert.equal(metatile.length, 16, map.id + ' metatile ' + index + ' tile count');
      for (const tileId of metatile) assert.ok(Number.isInteger(tileId) && tileId >= 0 && tileId < 256, map.id + ' invalid graphics tile ' + tileId);
    }
  }
});

test('all initial map landings are in bounds and walkable', () => {
  for (const { map, collisionAt, spawn } of MAPS) {
    const [x, y] = spawn;
    assert.ok(x >= 0 && y >= 0 && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh, map.id + ' spawn bounds');
    assert.ok(isPreviewCollisionWalkable(collisionAt(x, y)), map.id + ' spawn is blocked at ' + x + ',' + y + ' (' + collisionAt(x,y) + ')');
  }
});

test('NPCs are placed on walkable map cells and have at least one adjacent interaction tile', () => {
  for (const { map, collisionAt } of MAPS) {
    for (const object of map.objects || []) {
      // Poké Balls are sprites sitting on the lab table, so their underlying
      // collision is intentionally solid. Elm's first-meeting callback also
      // moves him from the static event coordinate to (3, 4).
      if (object.id?.startsWith('ELMSLAB_POKE_BALL') || /DOLL|CONSOLE/.test(object.id || '')) continue;
      const position = resolveSceneObjectPosition(map.id, object, { labIntroComplete: false }) || { x: object.x, y: object.y };
      const collision = collisionAt(position.x, position.y);
      assert.ok(isPreviewCollisionWalkable(collision), map.id + ' NPC ' + object.id + ' is on blocked collision ' + collision + ' at ' + position.x + ',' + position.y);
      const adjacent = [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => {
        const x = position.x + dx, y = position.y + dy;
        return x >= 0 && y >= 0 && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh
          && isPreviewCollisionWalkable(collisionAt(x,y));
      });
      assert.ok(adjacent, map.id + ' NPC ' + object.id + ' cannot be approached');
    }
  }
});

test('every declared warp is in bounds and has a walkable adjacent tile on both sides', () => {
  for (const { map, collisionAt } of MAPS) {
    for (const warp of map.warps || []) {
      assert.ok(warp.x >= 0 && warp.y >= 0 && warp.x < map.dimensions.metatilesWide && warp.y < map.dimensions.metatilesHigh, map.id + ' warp out of bounds');
      const approachable = [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => {
        const x = warp.x + dx, y = warp.y + dy;
        return x >= 0 && y >= 0 && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh
          && isPreviewCollisionWalkable(collisionAt(x,y));
      });
      assert.ok(approachable, map.id + ' warp cannot be reached at ' + warp.x + ',' + warp.y);
    }
  }
});


function reachableCells(map, collisionAt, start) {
  const queue = [start];
  const visited = new Set([start.join(',')]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy;
      const key = nx + ',' + ny;
      if (visited.has(key)) continue;
      if (!canPreviewEnterOrWarp(nx, ny, map.dimensions.metatilesWide, map.dimensions.metatilesHigh, collisionAt, map.warps)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return visited;
}

test('all doors and visible NPC interaction positions are reachable from each scene entry', () => {
  for (const { map, collisionAt, spawn } of MAPS) {
    const reachable = reachableCells(map, collisionAt, spawn);
    for (const warp of map.warps || []) {
      assert.ok(reachable.has(warp.x + ',' + warp.y), map.id + ' door is cut off by collision at ' + warp.x + ',' + warp.y);
    }
    for (const object of map.objects || []) {
      if (object.id?.startsWith('ELMSLAB_POKE_BALL') || /DOLL|CONSOLE/.test(object.id || '')) continue;
      const position = resolveSceneObjectPosition(map.id, object, { labIntroComplete: false }) || { x: object.x, y: object.y };
      const canApproach = [[0,-1],[1,0],[0,1],[-1,0]].some(([dx,dy]) => reachable.has((position.x + dx) + ',' + (position.y + dy)));
      assert.ok(canApproach, map.id + ' NPC ' + object.id + ' is unreachable from entry');
    }
  }
});
