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
import { LAB_STARTERS, getLabStarter, getLabStarterBallId, getLabStarterPrompt, mustBlockLabExit } from './maps/starter-selection.js';
import { resolveSceneObjectPosition, isSceneObjectVisible } from './maps/scene-object-state.js';
import { shouldStartElmOpeningScene, canCancelPendingScene } from './maps/scene-progression.js';
import { sourceObjectAt, objectPaletteIndex } from './maps/object-sprites.js';
import { SPRITES } from './generated/sprites.js';
import { CRYSTAL_EXTRA_SPRITES } from './assets/source-sprites.js';

test('interior maps use their source tilesets rather than a similar-looking substitute', () => {
 assert.equal(PLAYERS_HOUSE_1F.tileset, 'PLAYERS_HOUSE');
 assert.equal(PLAYERS_HOUSE_2F.tileset, 'PLAYERS_ROOM');
 assert.equal(ELMS_HOUSE.tileset, 'HOUSE');
 assert.equal(PLAYERS_NEIGHBORS_HOUSE.tileset, 'HOUSE');
});

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
  PLAYERS_HOUSE_1F: { metadata: PLAYERS_HOUSE_1F, collisionAt: getPlayersHouse1FCollisionAtMetatile },
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
 assert.equal(isPreviewCollisionWalkable(getPlayersHouse1FCollisionAtMetatile(downstairs.x, downstairs.y)), true, 'upstairs exit must land on a walkable downstairs tile');
 assert.equal(resolvePreviewWarp('NEW_BARK_TOWN', { destinationMap: 'ELMS_LAB', destinationWarp: 99 }, maps), null);
});


test('player house interaction metadata keeps source NPC coordinates and dialogue', () => {
 const neighbor = PLAYERS_HOUSE_1F.objects.find(object => object.id === 'NEIGHBOR');
 assert.deepEqual({ x: neighbor.x, y: neighbor.y }, { x: 4, y: 4 });
 assert.match(neighbor.dialogue.join(' '), /<PLAY_G>, have you heard\? My daughter is adamant about becoming PROF\. ELM's assistant/);
 assert.equal(PLAYERS_HOUSE_1F.objects.find(object => object.id === 'MOM').x, 7);
});


test('neighbor house uses the original shared House1 block grid and source dialogue', () => {
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,5,29,15,1,2,15,15,12,13,15,6,11,15,7]);
 const daughter = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'DAUGHTER');
 assert.match(daughter.dialogue.join(' '), /PIKACHU is an evolved POKéMON/);
 assert.match(daughter.dialogue.join(' '), /…sigh…/);
 assert.match(daughter.dialogue.join(' '), /researcher like him/);
 const neighbor = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'NEIGHBOR');
 assert.match(neighbor.dialogue.join(' '), /But then, so do I!/);
});


test('each map records its original source tileset instead of assuming Johto everywhere', () => {
 assert.equal(NEW_BARK_TOWN.tileset, 'JOHTO');
 assert.equal(ELMS_LAB.tileset, 'LAB');
 assert.equal(PLAYERS_HOUSE_1F.tileset, 'PLAYERS_HOUSE');
 assert.equal(PLAYERS_HOUSE_2F.tileset, 'PLAYERS_ROOM');
 assert.equal(ELMS_HOUSE.tileset, 'HOUSE');
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

test('all three starter images are embedded as PNG data', async () => {
 const { CRYSTAL_EXTRA_SPRITES } = await import('./assets/source-sprites.js');
 for (const species of ['CYNDAQUIL', 'TOTODILE', 'CHIKORITA']) {
  assert.match(CRYSTAL_EXTRA_SPRITES[species].replace(/\s/g, ''), /^iVBORw0KGgo/, species + ' starter image must be embedded PNG data');
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

test('Elm opening scene starts on first lab entry and cannot be cancelled before accepting', () => {
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'NEW_BARK_TOWN',starter:null,labIntroComplete:false}), true);
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'ELMS_LAB',starter:null,labIntroComplete:false}), false);
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'NEW_BARK_TOWN',starter:'TOTODILE',labIntroComplete:false}), false);
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'NEW_BARK_TOWN',starter:null,labIntroComplete:true}), false);
 assert.equal(canCancelPendingScene('LAB_INTRO'), false);
 assert.equal(canCancelPendingScene('CYNDAQUIL'), true);
});


test('New Bark Town teacher stop scene preserves both source trigger rows and teacher start position', () => {
 assert.deepEqual(NEW_BARK_TOWN.coordinateEvents.map(event => [event.x, event.y, event.script]), [
  [1, 8, 'NewBarkTown_TeacherStopsYouScene1'],
  [1, 9, 'NewBarkTown_TeacherStopsYouScene2'],
 ]);
 const teacher = NEW_BARK_TOWN.objects.find(object => object.id === 'NEWBARKTOWN_TEACHER');
 assert.deepEqual([teacher.x, teacher.y], [6, 8]);
 assert.equal(teacher.movement, 'SPRITEMOVEDATA_SPINRANDOM_SLOW');
 assert.match(teacher.dialogue.join(' '), /Wow, your POKéGEAR is impressive/);
});

import { getPlayersHouse2FCollisionAtMetatile as roomCollision } from './maps/players-house-2f-blocks.js';
import { getPlayersHouse1FCollisionAtMetatile as downstairsCollision } from './maps/players-house-1f-blocks.js';
import { getElmsLabCollisionAtMetatile as labCollision } from './maps/elms-lab-blocks.js';
import { canPreviewEnterOrWarp } from './maps/new-bark-town-movement.js';

function reachable(map, collisionAt, start, target) {
 const w = map.dimensions.metatilesWide, h = map.dimensions.metatilesHigh;
 const queue = [start], seen = new Set([start.x + ',' + start.y]);
 while (queue.length) {
  const p = queue.shift();
  if (p.x === target.x && p.y === target.y) return true;
  for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
   const x=p.x+dx,y=p.y+dy,key=x+','+y;
   if (seen.has(key) || !canPreviewEnterOrWarp(x,y,w,h,collisionAt,map.warps)) continue;
   seen.add(key); queue.push({x,y});
  }
 }
 return false;
}

test('critical first-scene destinations are reachable using actual collision tables', () => {
 assert.equal(reachable(PLAYERS_HOUSE_2F, roomCollision, {x:3,y:3}, {x:7,y:0}), true, 'bedroom spawn must reach the stairs');
 assert.equal(reachable(PLAYERS_HOUSE_1F, downstairsCollision, {x:6,y:6}, {x:9,y:0}), true, 'downstairs landing must reach the bedroom stairs');
 assert.ok([[5,3],[7,3],[6,2],[6,4]].some(([x,y]) => reachable(ELMS_LAB, labCollision, {x:4,y:10}, {x,y})), 'lab entrance must reach a tile adjacent to the starter table');
});


test('house NPCs resolve to their source object_event sprite sheets', () => {
 const visitor = PLAYERS_HOUSE_1F.objects.find(object => object.id === 'NEIGHBOR');
 const wife = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_WIFE');
 const son = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_SON');
 const daughter = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'DAUGHTER');
 assert.equal(sourceObjectAt('PlayersHouse1F', visitor.x, visitor.y).sprite, 'SPRITE_POKEFAN_F');
 assert.equal(sourceObjectAt('ElmsHouse', wife.x, wife.y).sprite, 'SPRITE_TEACHER');
 assert.equal(sourceObjectAt('ElmsHouse', son.x, son.y).sprite, 'SPRITE_BUG_CATCHER');
 assert.equal(sourceObjectAt('PlayersNeighborsHouse', daughter.x, daughter.y).sprite, 'SPRITE_COOLTRAINER_F');
});


test('Elm household dialogue and research-paper interaction retain source text', () => {
 const wife = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_WIFE');
 const son = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_SON');
 const pc = ELMS_HOUSE.backgroundEvents.find(event => event.kind === 'pc');
 assert.match(wife.dialogue.join(' '), /Hi, <PLAYER>! My husband's always so busy/);
 assert.match(wife.dialogue.join(' '), /he even forgets to eat/);
 assert.match(son.dialogue.join(' '), /I'm going to be a great POKéMON professor/);
 assert.match(pc.text, /Why has no one ever witnessed a POKéMON's birth/);
 assert.match(pc.text, /dedicate my life to the study of POKéMON/);
});


test('interior NPC coordinates and initial facing match their source object events', () => {
 const wife = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_WIFE');
 const son = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_SON');
 const daughter = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'DAUGHTER');
 const neighbor = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'NEIGHBOR');
 assert.deepEqual([wife.x, wife.y, wife.facing], [1, 5, 'up']);
 assert.deepEqual([son.x, son.y, son.facing], [5, 4, 'up']);
 assert.deepEqual([daughter.x, daughter.y, daughter.facing], [2, 3, 'right']);
 assert.deepEqual([neighbor.x, neighbor.y, neighbor.facing], [5, 3, 'left']);
});


/**
 * Shared scene-audit helper: verify every source warp and interactable can be
 * reached from the scene entry without walking through collision or NPCs.
 * Interactions are one tile away, matching the game's face-and-press-A rule.
 */
const FIRST_SCENE_MAPS = [
 { map: NEW_BARK_TOWN, collision: getNewBarkTownCollisionAtMetatile, start: {x:6,y:4} },
 { map: ELMS_LAB, collision: labCollision, start: {x:4,y:10} },
 { map: PLAYERS_HOUSE_1F, collision: downstairsCollision, start: {x:6,y:6} },
 { map: PLAYERS_HOUSE_2F, collision: roomCollision, start: {x:3,y:3} },
 { map: ELMS_HOUSE, collision: getElmsHouseCollisionAtMetatile, start: {x:3,y:6} },
 { map: PLAYERS_NEIGHBORS_HOUSE, collision: getPlayersNeighborsHouseCollisionAtMetatile, start: {x:2,y:6} },
];
function sceneReachable(map, collisionAt, start) {
 const width=map.dimensions.metatilesWide, height=map.dimensions.metatilesHigh;
 const seen=new Set([start.x+','+start.y]), queue=[start];
 for(let i=0;i<queue.length;i++) {
  const p=queue[i];
  for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
   const x=p.x+dx,y=p.y+dy,key=x+','+y;
   if(seen.has(key)||!canPreviewEnterOrWarp(x,y,width,height,collisionAt,map.warps)) continue;
   seen.add(key);queue.push({x,y});
  }
 }
 return seen;
}
test('scene audit: each first-scene map has reachable exits and face-to-interact access', () => {
 for(const {map,collision,start} of FIRST_SCENE_MAPS) {
  const seen=sceneReachable(map,collision,start);
  for(const warp of map.warps) {
   assert.ok(seen.has(warp.x+','+warp.y), map.id+' warp '+warp.x+','+warp.y+' is unreachable from scene entry');
  }
  for(const object of map.objects||[]) {
   const adjacent=[[object.x,object.y-1],[object.x+1,object.y],[object.x,object.y+1],[object.x-1,object.y]];
   assert.ok(adjacent.some(([x,y])=>seen.has(x+','+y)),map.id+' object '+object.id+' has no reachable interaction tile');
  }
 }
});


test('scene audit: every source doorway lands on walkable floor with a route back out', () => {
 const maps = {
  NEW_BARK_TOWN: {metadata:NEW_BARK_TOWN,collisionAt:getNewBarkTownCollisionAtMetatile},
  ELMS_LAB: {metadata:ELMS_LAB,collisionAt:labCollision},
  PLAYERS_HOUSE_1F: {metadata:PLAYERS_HOUSE_1F,collisionAt:downstairsCollision},
  PLAYERS_HOUSE_2F: {metadata:PLAYERS_HOUSE_2F,collisionAt:roomCollision},
  ELMS_HOUSE: {metadata:ELMS_HOUSE,collisionAt:getElmsHouseCollisionAtMetatile},
  PLAYERS_NEIGHBORS_HOUSE: {metadata:PLAYERS_NEIGHBORS_HOUSE,collisionAt:getPlayersNeighborsHouseCollisionAtMetatile},
 };
 for(const [sourceId, source] of Object.entries(maps)) {
  for(const warp of source.metadata.warps) {
   const arrival=resolvePreviewWarp(sourceId,warp,maps);
   assert.ok(arrival, sourceId+' -> '+warp.destinationMap+' must resolve');
   const destination=maps[arrival.mapId];
   assert.ok(isPreviewCollisionWalkable(destination.collisionAt(arrival.x,arrival.y)),
     sourceId+' -> '+warp.destinationMap+' arrival '+arrival.x+','+arrival.y+' must be walkable');
   const reachable=sceneReachable(destination.metadata,destination.collisionAt,arrival);
   assert.ok(destination.metadata.warps.some(exit=>reachable.has(exit.x+','+exit.y)),
     sourceId+' -> '+warp.destinationMap+' arrival must connect to an exit');
  }
 }
});


test('all New Bark Town scene objects, background events, and warps stay inside their source map bounds', () => {
 const maps = [
  NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE,
 ];
 for (const map of maps) {
  const { metatilesWide: width, metatilesHigh: height } = map.dimensions;
  for (const kind of ['objects', 'backgroundEvents', 'coordinateEvents', 'warps']) {
   for (const event of map[kind] || []) {
    assert.ok(Number.isInteger(event.x) && event.x >= 0 && event.x < width, `${map.id} ${kind} x out of bounds: ${JSON.stringify(event)}`);
    assert.ok(Number.isInteger(event.y) && event.y >= 0 && event.y < height, `${map.id} ${kind} y out of bounds: ${JSON.stringify(event)}`);
   }
  }
 }
});

test('starter choice maps all three source Poké Balls to distinct level-five species with art', () => {
 assert.deepEqual(Object.keys(LAB_STARTERS), ['ELMSLAB_POKE_BALL1', 'ELMSLAB_POKE_BALL2', 'ELMSLAB_POKE_BALL3']);
 assert.deepEqual(Object.values(LAB_STARTERS).map(starter => starter.species), ['CYNDAQUIL', 'TOTODILE', 'CHIKORITA']);
 for (const [ballId, starter] of Object.entries(LAB_STARTERS)) {
  assert.equal(starter.level, 5, `${ballId} source level`);
  assert.equal(getLabStarterBallId(starter.species), ballId);
  assert.ok(CRYSTAL_EXTRA_SPRITES[starter.species], `${starter.species} starter artwork missing`);
  assert.ok(getLabStarterPrompt(starter.species), `${starter.species} selection prompt missing`);
 }
});

test('every ported object has a source object_event with a decodable source PNG sprite', () => {
 const maps = [['NewBarkTown', NEW_BARK_TOWN], ['ElmsLab', ELMS_LAB], ['PlayersHouse1F', PLAYERS_HOUSE_1F], ['PlayersHouse2F', PLAYERS_HOUSE_2F], ['ElmsHouse', ELMS_HOUSE], ['PlayersNeighborsHouse', PLAYERS_NEIGHBORS_HOUSE]];
 for (const [name, map] of maps) {
  for (const object of map.objects) {
   const source = sourceObjectAt(name, object.x, object.y);
   assert.ok(source, `${name} ${object.id} must match a source object_event at ${object.x},${object.y}`);
   // Decoration sprites (console, dolls) are variable sprites chosen at runtime and hidden in a new game.
   if (name === 'PlayersHouse2F') continue;
   const sprite = SPRITES[source.sprite];
   assert.ok(sprite, `${name} ${object.id} sprite ${source.sprite}`);
   const bytes = Buffer.from(sprite.png, 'base64');
   assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', 'embedded asset must be a PNG');
   assert.equal(bytes.readUInt32BE(16), 16, `${object.id} overworld sprite width`);
   assert.ok(Number.isInteger(objectPaletteIndex(source)));
  }
 }
});

test('Elm family dialogue preserves all source lines used in the New Bark Town scene', () => {
 const wife = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_WIFE');
 const son = ELMS_HOUSE.objects.find(object => object.id === 'ELMS_SON');
 assert.deepEqual({ x: wife.x, y: wife.y }, { x: 1, y: 5 });
 assert.deepEqual({ x: son.x, y: son.y }, { x: 5, y: 4 });
 assert.match(wife.dialogue.join(' '), /husband's always so busy/);
 assert.match(wife.dialogue.join(' '), /forgets to eat/);
 assert.match(son.dialogue.join(' '), /help my dad/);
 assert.match(son.dialogue.join(' '), /great POKéMON professor/);
});

test('all six playable map block grids exactly match the source disassembly', () => {
 assert.deepEqual(NEW_BARK_TOWN_BLOCK_IDS, [
  5,5,24,31,25,5,5,5,5,5,
  5,71,28,119,30,5,24,25,5,5,
  5,2,1,1,1,71,22,30,5,5,
  5,1,1,1,1,1,1,1,1,84,
  1,1,1,1,69,1,1,1,1,88,
  5,20,21,1,1,1,1,1,98,5,
  4,1,1,1,71,20,21,1,98,5,
  5,101,101,1,1,1,1,1,98,5,
  5,5,5,5,5,5,5,5,5,5,
 ]);
 assert.deepEqual(ELMS_LAB_BLOCK_IDS, [
  23,8,9,4,4,
  24,12,1,6,7,
  1,33,1,10,11,
  4,4,1,4,4,
  1,1,1,1,1,
  1,1,2,1,1,
 ]);
 assert.deepEqual(PLAYERS_HOUSE_1F_BLOCK_IDS, [7,15,17,5,10,3,22,8,9,3,3,3,12,13,3,3,3,3,6,3]);
 assert.deepEqual(PLAYERS_HOUSE_2F_BLOCK_IDS, [4,1,3,2,5,6,5,5,5,5,7,5]);
 assert.deepEqual(ELMS_HOUSE_BLOCK_IDS, [16,1,17,27,25,8,9,3,3,12,13,3,3,6,3,3]);
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,5,29,15,1,2,15,15,12,13,15,6,11,15,7]);
});
