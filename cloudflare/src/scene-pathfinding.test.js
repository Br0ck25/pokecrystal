import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';
import { getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { isPreviewCollisionWalkable } from './maps/new-bark-town-movement.js';
import { PREVIEW_WARP_LANDINGS } from './maps/preview-warps.js';

const records = {
  NEW_BARK_TOWN: [NEW_BARK_TOWN, getNewBarkTownCollisionAtMetatile],
  ELMS_LAB: [ELMS_LAB, getElmsLabCollisionAtMetatile],
  PLAYERS_HOUSE_1F: [PLAYERS_HOUSE_1F, getPlayersHouse1FCollisionAtMetatile],
  PLAYERS_HOUSE_2F: [PLAYERS_HOUSE_2F, getPlayersHouse2FCollisionAtMetatile],
  ELMS_HOUSE: [ELMS_HOUSE, getElmsHouseCollisionAtMetatile],
  PLAYERS_NEIGHBORS_HOUSE: [PLAYERS_NEIGHBORS_HOUSE, getPlayersNeighborsHouseCollisionAtMetatile],
};

function reachable(map, collisionAt, start, warpTiles) {
  const { metatilesWide: width, metatilesHigh: height } = map.dimensions;
  const key = (x, y) => y * width + x;
  const queue = [[start.x, start.y]];
  const seen = new Set([key(start.x, start.y)]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const isWarp = warpTiles.some(w => w.x === nx && w.y === ny);
      if (!isWarp && !isPreviewCollisionWalkable(collisionAt(nx, ny))) continue;
      const k = key(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return { seen, key };
}

test('each building entrance can reach its exit and all map transitions by walkable source collision', () => {
  for (const [mapId, [map, collisionAt]] of Object.entries(records)) {
    const entry = Object.entries(PREVIEW_WARP_LANDINGS).find(([route]) => route.endsWith(':' + mapId));
    if (!entry) continue;
    const start = entry[1];
    const { seen, key } = reachable(map, collisionAt, start, map.warps);
    for (const warp of map.warps) {
      assert.ok(seen.has(key(warp.x, warp.y)), mapId + ' cannot reach warp ' + warp.x + ',' + warp.y);
    }
  }
});

test('every NPC can be approached from at least one reachable adjacent tile in interiors', () => {
  for (const mapId of ['ELMS_LAB','PLAYERS_HOUSE_1F','PLAYERS_HOUSE_2F','ELMS_HOUSE','PLAYERS_NEIGHBORS_HOUSE']) {
    const [map, collisionAt] = records[mapId];
    const entry = Object.entries(PREVIEW_WARP_LANDINGS).find(([route]) => route.endsWith(':' + mapId));
    const { seen, key } = reachable(map, collisionAt, entry[1], map.warps);
    for (const npc of map.objects) {
      const adjacent = [[npc.x,npc.y-1],[npc.x+1,npc.y],[npc.x,npc.y+1],[npc.x-1,npc.y]];
      assert.ok(adjacent.some(([x,y]) => x >= 0 && y >= 0 && x < map.dimensions.metatilesWide && y < map.dimensions.metatilesHigh && seen.has(key(x,y))),
        mapId + ' NPC cannot be approached: ' + npc.id + ' at ' + npc.x + ',' + npc.y);
    }
  }
});
