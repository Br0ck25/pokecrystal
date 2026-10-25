import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPreviewEnter, canPreviewEnterOrWarp, isPreviewCollisionWalkable } from './new-bark-town-movement.js';

test('walkability follows the source collision permission table', () => {
  // data/collision/collision_permissions.asm: these are LAND_TILE (COLL_01 is "garbage" but still land)
  for (const collision of ['FLOOR', 'TALL_GRASS', 'DOOR', 'WARP_CARPET_LEFT', 'WARP_CARPET_RIGHT', 'WARP_CARPET_DOWN', 'STAIRCASE', 'LADDER', '01', '01'.toUpperCase()]) {
    assert.equal(isPreviewCollisionWalkable(collision), true, collision);
  }
  // WALL_TILE, WATER_TILE and WALL_TILE | TALK entries, plus labels the table does not know
  for (const collision of ['WALL', 'WATER', 'BUOY', 'HEADBUTT_TREE', 'CUT_TREE', 'WHIRLPOOL', null, undefined, 'UNKNOWN', 7]) {
    assert.equal(isPreviewCollisionWalkable(collision), false, String(collision));
  }
});

test('walkable labels match the permission table exactly', () => {
  const table = readFileSync(new URL('../../../data/collision/collision_permissions.asm', import.meta.url), 'utf8');
  assert.match(table, /db LAND_TILE\s+; COLL_LADDER/);
  assert.match(table, /db WALL_TILE \| TALK\s+; COLL_CUT_TREE\n/);
});

test('map bounds and malformed coordinates fail closed', () => {
  const collision = () => 'FLOOR';
  assert.equal(canPreviewEnter(0, 0, 20, 18, collision), true);
  assert.equal(canPreviewEnter(19, 17, 20, 18, collision), true);
  assert.equal(canPreviewEnter(-1, 0, 20, 18, collision), false);
  assert.equal(canPreviewEnter(0, -1, 20, 18, collision), false);
  assert.equal(canPreviewEnter(20, 0, 20, 18, collision), false);
  assert.equal(canPreviewEnter(0, 18, 20, 18, collision), false);
  assert.equal(canPreviewEnter(0.5, 0, 20, 18, collision), false);
  assert.equal(canPreviewEnter(0, 0, 0, 18, collision), false);
  assert.equal(canPreviewEnter(0, 0, 20, 18, null), false);
});

test('map collision callback decides whether an in-bounds cell is enterable', () => {
  const grid = [['FLOOR', 'WALL'], ['TALL_GRASS', 'WATER']];
  const getCollision = (x, y) => grid[y]?.[x] ?? null;
  assert.equal(canPreviewEnter(0, 0, 2, 2, getCollision), true);
  assert.equal(canPreviewEnter(0, 1, 2, 2, getCollision), true);
  assert.equal(canPreviewEnter(1, 0, 2, 2, getCollision), false);
  assert.equal(canPreviewEnter(1, 1, 2, 2, getCollision), false);
});


test('source warp tiles are enterable even when simplified collision is special', () => {
  const collisionAt = () => 'WALL';
  const warps = [{ x: 2, y: 7 }, { x: 3, y: 7 }];
  assert.equal(canPreviewEnterOrWarp(2, 7, 8, 8, collisionAt, warps), true);
  assert.equal(canPreviewEnterOrWarp(3, 7, 8, 8, collisionAt, warps), true);
  assert.equal(canPreviewEnterOrWarp(1, 7, 8, 8, collisionAt, warps), false);
});

test('warp overrides never permit leaving map bounds', () => {
  const warps = [{ x: 8, y: 7 }];
  assert.equal(canPreviewEnterOrWarp(8, 7, 8, 8, () => 'WALL', warps), false);
  assert.equal(canPreviewEnterOrWarp(-1, 7, 8, 8, () => 'FLOOR', warps), false);
});
