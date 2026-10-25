import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYERS_HOUSE_1F } from './maps/players-house-1f.js';
import { PLAYERS_HOUSE_1F_BLOCK_IDS, getPlayersHouse1FCollisionAtMetatile } from './maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F } from './maps/players-house-2f.js';
import { PLAYERS_HOUSE_2F_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile } from './maps/players-house-2f-blocks.js';
import { ELMS_HOUSE } from './maps/elms-house.js';
import { ELMS_HOUSE_BLOCK_IDS, getElmsHouseCollisionAtMetatile } from './maps/elms-house-blocks.js';
import { resolvePreviewWarp, PREVIEW_WARP_LANDINGS } from './maps/preview-warps.js';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { NEW_BARK_TOWN_BLOCK_IDS } from './maps/new-bark-town-blocks.js';
import { getNewBarkTownCollisionAtMetatile } from './maps/new-bark-town-blocks.js';
import { ELMS_LAB } from './maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS } from './maps/elms-lab-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';
import { JOHTO_METATILE_TILES } from './maps/johto-metatiles.js';
import { HOUSE_METATILE_TILES } from './maps/house-metatiles.js';
import { LAB_METATILE_TILES } from './maps/lab-metatiles.js';
import { PLAYERS_HOUSE_METATILE_TILES } from './maps/players-house-metatiles.js';
import { PLAYERS_ROOM_METATILE_TILES } from './maps/players-room-metatiles.js';
import { TILESET_PALETTE_LABELS, CRYSTAL_PALETTES } from './maps/tileset-palette-data.js';
import { isPreviewCollisionWalkable } from './maps/new-bark-town-movement.js';
import { getTilesetCollision } from './maps/tileset-collision.js';
import { LAB_STARTERS, getLabStarter, getLabStarterBallId, mustBlockLabExit } from './maps/starter-selection.js';
import { resolveSceneObjectPosition, isSceneObjectVisible } from './maps/scene-object-state.js';

test('all imported house block grids match their source dimensions', () => {
 assert.equal(PLAYERS_HOUSE_1F_BLOCK_IDS.length, PLAYERS_HOUSE_1F.dimensions.blocksWide * PLAYERS_HOUSE_1F.dimensions.blocksHigh);
 assert.equal(PLAYERS_HOUSE_2F_BLOCK_IDS.length, PLAYERS_HOUSE_2F.dimensions.blocksWide * PLAYERS_HOUSE_2F.dimensions.blocksHigh);
 assert.equal(ELMS_HOUSE_BLOCK_IDS.length, ELMS_HOUSE.dimensions.blocksWide * ELMS_HOUSE.dimensions.blocksHigh);
 assert.equal(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS.length, PLAYERS_NEIGHBORS_HOUSE.dimensions.blocksWide * PLAYERS_NEIGHBORS_HOUSE.dimensions.blocksHigh);
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,5,29,15,1,2,15,15,12,13,15,6,11,15,7]);
 assert.deepEqual(PLAYERS_HOUSE_1F_BLOCK_IDS.slice(0,5),[7,15,17,5,10]);
 assert.deepEqual(PLAYERS_HOUSE_2F_BLOCK_IDS,[4,1,3,2,5,6,5,5,5,5,7,5]);
 assert.deepEqual(ELMS_HOUSE_BLOCK_IDS.slice(0,4),[16,1,17,27]);
});
test('house collision lookups fail closed outside map bounds',()=>{
 assert.equal(getPlayersHouse1FCollisionAtMetatile(-1,0),null);
 assert.equal(getPlayersHouse2FCollisionAtMetatile(8,0),null);
 assert.equal(isPreviewCollisionWalkable(getPlayersHouse2FCollisionAtMetatile(3,3)), true, 'new game spawn must be walkable');
 assert.equal(getElmsHouseCollisionAtMetatile(0,8),null);
 assert.equal(getPlayersNeighborsHouseCollisionAtMetatile(-1,0),null);
});
test('all imported house entrance and upstairs routes resolve',()=>{
 assert.equal(resolvePreviewWarp('NEW_BARK_TOWN',{destinationMap:'PLAYERS_HOUSE_1F'}).mapId,'PLAYERS_HOUSE_1F');
 assert.equal(resolvePreviewWarp('NEW_BARK_TOWN',{destinationMap:'ELMS_HOUSE'}).mapId,'ELMS_HOUSE');
 assert.equal(resolvePreviewWarp('PLAYERS_HOUSE_1F',{destinationMap:'PLAYERS_HOUSE_2F'}).mapId,'PLAYERS_HOUSE_2F');
 assert.equal(resolvePreviewWarp('PLAYERS_HOUSE_2F',{destinationMap:'PLAYERS_HOUSE_1F'}).mapId,'PLAYERS_HOUSE_1F');
});


test('every New Bark Town building and floor has an in-bounds, reversible preview route', () => {
 const maps = {
  NEW_BARK_TOWN: NEW_BARK_TOWN,
  ELMS_LAB: ELMS_LAB,
  PLAYERS_HOUSE_1F: PLAYERS_HOUSE_1F,
  PLAYERS_HOUSE_2F: PLAYERS_HOUSE_2F,
  ELMS_HOUSE: ELMS_HOUSE,
  PLAYERS_NEIGHBORS_HOUSE: PLAYERS_NEIGHBORS_HOUSE,
 };
 for (const [route, landing] of Object.entries(PREVIEW_WARP_LANDINGS)) {
  const [sourceId, destinationId] = route.split(':');
  assert.ok(maps[sourceId], `unknown route source: ${sourceId}`);
  assert.ok(maps[destinationId], `unknown route destination: ${destinationId}`);
  const dimensions = maps[destinationId].dimensions;
  assert.ok(landing.x >= 0 && landing.x < dimensions.metatilesWide, `${route} landing x is out of bounds`);
  assert.ok(landing.y >= 0 && landing.y < dimensions.metatilesHigh, `${route} landing y is out of bounds`);
  assert.ok(resolvePreviewWarp(sourceId, { destinationMap: destinationId }), `${route} does not resolve`);
 }
 for (const [sourceId, map] of Object.entries(maps)) {
  for (const warp of map.warps) {
   assert.ok(resolvePreviewWarp(sourceId, warp), `missing preview route for ${sourceId} -> ${warp.destinationMap}`);
  }
 }
});


test('warp arrival coordinates come from the numbered destination warp entry', () => {
 const maps = {
  NEW_BARK_TOWN: NEW_BARK_TOWN,
  ELMS_LAB: ELMS_LAB,
  PLAYERS_HOUSE_1F: PLAYERS_HOUSE_1F,
  PLAYERS_HOUSE_2F: PLAYERS_HOUSE_2F,
  ELMS_HOUSE: ELMS_HOUSE,
  PLAYERS_NEIGHBORS_HOUSE: PLAYERS_NEIGHBORS_HOUSE,
 };
 const townToPlayerHouse = resolvePreviewWarp('NEW_BARK_TOWN', NEW_BARK_TOWN.warps[1], maps);
 assert.deepEqual(townToPlayerHouse, { mapId: 'PLAYERS_HOUSE_1F', x: 6, y: 6, facing: 'up' });
 const upstairs = resolvePreviewWarp('PLAYERS_HOUSE_1F', PLAYERS_HOUSE_1F.warps[2], maps);
 assert.deepEqual(upstairs, { mapId: 'PLAYERS_HOUSE_2F', x: 7, y: 1, facing: 'down' });
 const downstairs = resolvePreviewWarp('PLAYERS_HOUSE_2F', PLAYERS_HOUSE_2F.warps[0], maps);
 assert.deepEqual(downstairs, { mapId: 'PLAYERS_HOUSE_1F', x: 9, y: 1, facing: 'down' });
 assert.equal(resolvePreviewWarp('NEW_BARK_TOWN', { destinationMap: 'ELMS_LAB', destinationWarp: 99 }, maps), null);
});


test('player house interaction metadata keeps source NPC coordinates and dialogue', () => {
 const neighbor = PLAYERS_HOUSE_1F.objects.find(object => object.id === 'NEIGHBOR');
 assert.deepEqual({ x: neighbor.x, y: neighbor.y }, { x: 2, y: 2 });
 assert.match(neighbor.dialogue.join(' '), /adamant about becoming PROF\. ELM's assistant/);
 assert.equal(PLAYERS_HOUSE_1F.objects.find(object => object.id === 'MOM').x, 7);
});


test('neighbor house uses the original shared House1 block grid and source dialogue', () => {
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,5,29,15,1,2,15,15,12,13,15,6,11,15,7]);
 const daughter = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'DAUGHTER');
 assert.match(daughter.dialogue.join(' '), /PIKACHU is an evolved POKéMON/);
 assert.match(daughter.dialogue.join(' '), /researcher like him/);
});


test('each map records its original source tileset instead of assuming Johto everywhere', () => {
 assert.equal(NEW_BARK_TOWN.tileset, 'JOHTO');
 assert.equal(ELMS_LAB.tileset, 'LAB');
 assert.equal(PLAYERS_HOUSE_1F.tileset, 'PLAYERS_HOUSE');
 assert.equal(PLAYERS_HOUSE_2F.tileset, 'PLAYERS_ROOM');
 assert.equal(ELMS_HOUSE.tileset, 'PLAYERS_HOUSE');
 assert.equal(PLAYERS_NEIGHBORS_HOUSE.tileset, 'HOUSE');
});


test('each supported map tileset has source metatile graphics and palette assignments', () => {
 for (const [name, table] of Object.entries({ johto: JOHTO_METATILE_TILES, house: HOUSE_METATILE_TILES, lab: LAB_METATILE_TILES, players_house: PLAYERS_HOUSE_METATILE_TILES, players_room: PLAYERS_ROOM_METATILE_TILES })) {
  assert.ok(table.length > 0, `${name} has no source metatiles`);
  assert.ok(table.every(tile => tile.length === 16), `${name} has a malformed metatile`);
  assert.equal(TILESET_PALETTE_LABELS[name][0].length, 96, `${name} tile palette bank 0`);
  assert.equal(TILESET_PALETTE_LABELS[name][1].length, 96, `${name} tile palette bank 1`);
 }
 assert.equal(CRYSTAL_PALETTES.day.RED.length, 4);
 assert.equal(CRYSTAL_PALETTES.indoor.BROWN.length, 4);
 assert.ok(HOUSE_METATILE_TILES.length > Math.max(...PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS));
});


test('indoor collision lookups use their own source tables and stairs are traversable', () => {
 assert.equal(getTilesetCollision('LAB', 1, 0), 'FLOOR');
 assert.equal(getTilesetCollision('PLAYERS_ROOM', 2, 1), 'STAIRCASE');
 assert.equal(isPreviewCollisionWalkable('STAIRCASE'), true);
 assert.equal(isPreviewCollisionWalkable('LADDER'), true, 'source collision tables call the bedroom stair tile LADDER');
 assert.equal(getPlayersNeighborsHouseCollisionAtMetatile(4, 2), 'FLOOR');
});

test('the upstairs entrance in the player house is reachable from the ground-floor landing', () => {
 const start = { x: 6, y: 6 };
 const goal = { x: 9, y: 0 };
 const width = PLAYERS_HOUSE_1F.dimensions.metatilesWide;
 const height = PLAYERS_HOUSE_1F.dimensions.metatilesHigh;
 const queue = [start];
 const visited = new Set([start.x + ',' + start.y]);
 for (let i = 0; i < queue.length; i++) {
  const p = queue[i];
  if (p.x === goal.x && p.y === goal.y) break;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
   const x = p.x + dx, y = p.y + dy, key = x + ',' + y;
   if (visited.has(key) || x < 0 || y < 0 || x >= width || y >= height) continue;
   const isWarp = PLAYERS_HOUSE_1F.warps.some(warp => warp.x === x && warp.y === y);
   if (!isWarp && !isPreviewCollisionWalkable(getPlayersHouse1FCollisionAtMetatile(x, y))) continue;
   visited.add(key);
   queue.push({ x, y });
  }
 }
 assert.ok(visited.has(goal.x + ',' + goal.y), 'the player must be able to walk from the entrance to the upstairs staircase');
});


test('player room staircase warps connect both floors at the source doorway coordinates', () => {
 const up = resolvePreviewWarp('PLAYERS_HOUSE_1F', PLAYERS_HOUSE_1F.warps[2], {
  PLAYERS_HOUSE_2F,
 });
 assert.deepEqual(up, { mapId: 'PLAYERS_HOUSE_2F', x: 7, y: 1, facing: 'down' });
 const down = resolvePreviewWarp('PLAYERS_HOUSE_2F', PLAYERS_HOUSE_2F.warps[0], {
  PLAYERS_HOUSE_1F,
 });
 assert.deepEqual(down, { mapId: 'PLAYERS_HOUSE_1F', x: 9, y: 1, facing: 'down' });
});


test('source ladder collision labels remain walkable for room transitions', () => {
 assert.equal(isPreviewCollisionWalkable('LADDER'), true);
 assert.equal(isPreviewCollisionWalkable('FLOOR'), true);
});


function reachableTiles(map, collisionAt, start) {
 const width=map.dimensions.metatilesWide, height=map.dimensions.metatilesHigh;
 const queue=[start], visited=new Set([start.x+','+start.y]);
 for(let i=0;i<queue.length;i++){
  const p=queue[i];
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=p.x+dx,y=p.y+dy,key=x+','+y;
   if(visited.has(key)||x<0||y<0||x>=width||y>=height)continue;
   const isWarp=map.warps.some(w=>w.x===x&&w.y===y);
   if(!isWarp&&!isPreviewCollisionWalkable(collisionAt(x,y)))continue;
   visited.add(key);queue.push({x,y});
  }
 }
 return visited;
}

test('player bedroom staircase and every source object have reachable interaction tiles',()=>{
 const reachable=reachableTiles(PLAYERS_HOUSE_2F,getPlayersHouse2FCollisionAtMetatile,{x:3,y:3});
 const objects=PLAYERS_HOUSE_2F.objects;
 for(const object of objects){
  const neighbors=[[object.x,object.y-1],[object.x+1,object.y],[object.x,object.y+1],[object.x-1,object.y]];
  assert.ok(neighbors.some(([x,y])=>reachable.has(x+','+y)),`no reachable interaction tile for ${object.id}`);
 }
 assert.ok(reachable.has('7,0'),'bedroom staircase tile must be reachable');
});

test('every ground-floor room object has a reachable interaction tile from the front door',()=>{
 const reachable=reachableTiles(PLAYERS_HOUSE_1F,getPlayersHouse1FCollisionAtMetatile,{x:6,y:6});
 for(const object of PLAYERS_HOUSE_1F.objects){
  const neighbors=[[object.x,object.y-1],[object.x+1,object.y],[object.x,object.y+1],[object.x-1,object.y]];
  assert.ok(neighbors.some(([x,y])=>reachable.has(x+','+y),),`no reachable interaction tile for ${object.id}`);
 }
});


test('New Bark Town has walkable routes from the player-house exit to Elm’s Lab entrance and town NPCs',()=>{
 const reachable=reachableTiles(NEW_BARK_TOWN,getNewBarkTownCollisionAtMetatile,{x:13,y:6});
 assert.ok(reachable.has('6,4'),'the player must be able to reach the lab entrance approach');
 for(const object of NEW_BARK_TOWN.objects){
  const neighbors=[[object.x,object.y-1],[object.x+1,object.y],[object.x,object.y+1],[object.x-1,object.y]];
  assert.ok(neighbors.some(([x,y])=>reachable.has(x+','+y)),`no reachable interaction tile for ${object.id}`);
 }
});


test('every source map block ID resolves within its assigned source tileset', () => {
 const cases = [
  { map: NEW_BARK_TOWN, blocks: NEW_BARK_TOWN_BLOCK_IDS, tiles: JOHTO_METATILE_TILES },
  { map: ELMS_LAB, blocks: ELMS_LAB_BLOCK_IDS, tiles: LAB_METATILE_TILES },
  { map: PLAYERS_HOUSE_1F, blocks: PLAYERS_HOUSE_1F_BLOCK_IDS, tiles: PLAYERS_HOUSE_METATILE_TILES },
  { map: PLAYERS_HOUSE_2F, blocks: PLAYERS_HOUSE_2F_BLOCK_IDS, tiles: PLAYERS_ROOM_METATILE_TILES },
  { map: ELMS_HOUSE, blocks: ELMS_HOUSE_BLOCK_IDS, tiles: PLAYERS_HOUSE_METATILE_TILES },
  { map: PLAYERS_NEIGHBORS_HOUSE, blocks: PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, tiles: HOUSE_METATILE_TILES },
 ];
 for (const {map, blocks, tiles} of cases) {
  assert.equal(blocks.length, map.dimensions.blocksWide * map.dimensions.blocksHigh, map.id + ' source block count');
  for (let index = 0; index < blocks.length; index++) {
   assert.ok(Number.isInteger(blocks[index]) && blocks[index] >= 0 && blocks[index] < tiles.length,
    map.id + ' block ' + index + ' references missing metatile ' + blocks[index] + ' in ' + map.tileset);
   assert.equal(tiles[blocks[index]].length, 16, map.id + ' block ' + index + ' must have 16 tile IDs');
  }
 }
});

test('all three starter images and all required NPC sprite sheets are embedded as PNG data', async () => {
 const { CRYSTAL_EXTRA_SPRITES } = await import('./assets/source-sprites.js');
 const { CRYSTAL_OVERWORLD_SPRITES } = await import('./assets/overworld-sprites.js');
 for (const species of ['CYNDAQUIL', 'TOTODILE', 'CHIKORITA']) {
  assert.match(CRYSTAL_EXTRA_SPRITES[species].replace(/\\s/g, ''), /^iVBORw0KGgo/, species + ' starter image must be embedded PNG data');
 }
 for (const character of ['KRIS', 'ELM', 'MOM', 'TEACHER', 'FISHER', 'RIVAL']) {
  assert.match(CRYSTAL_OVERWORLD_SPRITES[character].replace(/\\s/g, ''), /^iVBORw0KGgo/, character + ' sprite must be embedded PNG data');
 }
});

test('Elm, each starter ball, the lab exit, and the healing machine are reachable from the lab entrance', () => {
 const reachable = reachableTiles(ELMS_LAB, (x,y) => getTilesetCollision('LAB', ELMS_LAB_BLOCK_IDS[Math.floor(y/2)*ELMS_LAB.dimensions.blocksWide+Math.floor(x/2)], (y%2)*2+(x%2)), {x:4,y:10});
 const interactionReachable = (x,y) => [[x,y-1],[x+1,y],[x,y+1],[x-1,y]].some(([nx,ny]) => reachable.has(nx+','+ny));
 assert.ok(interactionReachable(3,4), 'Elm must be approachable at the source opening-scene position');
 for (const ball of ELMS_LAB.objects.filter(object => object.id.startsWith('ELMSLAB_POKE_BALL'))) {
  assert.ok(interactionReachable(ball.x,ball.y), ball.id + ' must be reachable for starter selection');
 }
 assert.ok(reachable.has('4,11') || reachable.has('5,11'), 'lab exit warp tiles must be reachable after choosing a starter');
 assert.ok(interactionReachable(2,1), 'healing machine must be reachable');
});

test('source map event coordinates stay within their map bounds', () => {
 const maps = [NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE];
 for (const map of maps) {
  const d = map.dimensions;
  for (const category of ['warps', 'coordinateEvents', 'backgroundEvents', 'objects']) {
   for (const event of map[category] || []) {
    assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < d.metatilesWide, `${map.id} ${category} ${event.script || event.id || ''} x out of bounds`);
    assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < d.metatilesHigh, `${map.id} ${category} ${event.script || event.id || ''} y out of bounds`);
   }
  }
 }
});

test('lab starter-ball identity, species, level, and reverse lookup stay consistent', () => {
 assert.deepEqual(Object.values(LAB_STARTERS).map(({species, type, level}) => [species, type, level]), [
  ['CYNDAQUIL', 'FIRE', 5], ['TOTODILE', 'WATER', 5], ['CHIKORITA', 'GRASS', 5],
 ]);
 for (const [ballId, starter] of Object.entries(LAB_STARTERS)) {
  assert.equal(getLabStarter(ballId), starter);
  assert.equal(getLabStarterBallId(starter.species), ballId);
 }
 assert.equal(getLabStarter('NOT_A_BALL'), null);
 assert.equal(mustBlockLabExit(null), true);
 assert.equal(mustBlockLabExit('TOTODILE'), false);
});

test('Elm uses the source first-meeting position and starter objects update visibility', () => {
 const elm = ELMS_LAB.objects.find(object => object.id === 'ELMSLAB_ELM');
 assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, {labIntroComplete: false}), {x: 3, y: 4});
 assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, {labIntroComplete: true}), {x: elm.x, y: elm.y});
 assert.equal(isSceneObjectVisible('ELMS_LAB', ELMS_LAB.objects.find(object => object.id === 'ELMSLAB_POKE_BALL1'), {starterBall: 'ELMSLAB_POKE_BALL1'}), false);
 assert.equal(isSceneObjectVisible('ELMS_LAB', ELMS_LAB.objects.find(object => object.id === 'ELMSLAB_OFFICER'), {starter: 'CYNDAQUIL'}), false);
});
