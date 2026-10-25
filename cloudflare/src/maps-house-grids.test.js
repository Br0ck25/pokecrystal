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
import { ELMS_LAB } from './maps/elms-lab.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './maps/players-neighbors-house.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './maps/players-neighbors-house-blocks.js';

test('all imported house block grids match their source dimensions', () => {
 assert.equal(PLAYERS_HOUSE_1F_BLOCK_IDS.length, PLAYERS_HOUSE_1F.dimensions.blocksWide * PLAYERS_HOUSE_1F.dimensions.blocksHigh);
 assert.equal(PLAYERS_HOUSE_2F_BLOCK_IDS.length, PLAYERS_HOUSE_2F.dimensions.blocksWide * PLAYERS_HOUSE_2F.dimensions.blocksHigh);
 assert.equal(ELMS_HOUSE_BLOCK_IDS.length, ELMS_HOUSE.dimensions.blocksWide * ELMS_HOUSE.dimensions.blocksHigh);
 assert.equal(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS.length, PLAYERS_NEIGHBORS_HOUSE.dimensions.blocksWide * PLAYERS_NEIGHBORS_HOUSE.dimensions.blocksHigh);
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,79,29,15,1,2,15,15,12,13,15,6,11,15,7]);
 assert.deepEqual(PLAYERS_HOUSE_1F_BLOCK_IDS.slice(0,5),[7,15,17,5,10]);
 assert.deepEqual(PLAYERS_HOUSE_2F_BLOCK_IDS,[4,1,3,2,5,6,5,5,5,5,7,5]);
 assert.deepEqual(ELMS_HOUSE_BLOCK_IDS.slice(0,4),[16,1,17,27]);
});
test('house collision lookups fail closed outside map bounds',()=>{
 assert.equal(getPlayersHouse1FCollisionAtMetatile(-1,0),null);
 assert.equal(getPlayersHouse2FCollisionAtMetatile(8,0),null);
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
 assert.deepEqual(PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, [4,30,79,29,15,1,2,15,15,12,13,15,6,11,15,7]);
 const daughter = PLAYERS_NEIGHBORS_HOUSE.objects.find(object => object.id === 'DAUGHTER');
 assert.match(daughter.dialogue.join(' '), /PIKACHU is an evolved POKéMON/);
 assert.match(daughter.dialogue.join(' '), /researcher like him/);
});


test('each map records its original source tileset instead of assuming Johto everywhere', () => {
 assert.equal(NEW_BARK_TOWN.tileset, 'JOHTO');
 assert.equal(ELMS_LAB.tileset, 'LAB');
 assert.equal(PLAYERS_HOUSE_1F.tileset, 'PLAYERS_HOUSE');
 assert.equal(PLAYERS_HOUSE_2F.tileset, 'PLAYERS_ROOM');
 assert.equal(ELMS_HOUSE.tileset, 'HOUSE');
 assert.equal(PLAYERS_NEIGHBORS_HOUSE.tileset, 'HOUSE');
});
