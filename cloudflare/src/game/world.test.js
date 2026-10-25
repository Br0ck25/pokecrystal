import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld, collisionValue, mapIdOf } from './world.js';
import { MAPS } from '../generated/maps.js';
import { COLLISION_VALUES } from '../generated/collision.js';

test('every map in the game loads with a collision value for each of its squares', () => {
  for (const id of Object.keys(MAPS)) {
    const world = loadWorld(id);
    for (let y = -2; y < world.height + 2; y++) for (let x = -2; x < world.width + 2; x++) {
      assert.ok(Number.isInteger(world.collisionAt(x, y)), `${id} ${x},${y}`);
    }
  }
});

test('outside the map the border block decides, and labels are resolved strictly', () => {
  const world = loadWorld('NEW_BARK_TOWN');
  assert.equal(world.border, 5);
  assert.equal(world.collisionAt(-1, 0), COLLISION_VALUES.WALL);   // border block $05 is trees: WALL
  assert.equal(collisionValue('FLOOR'), 0);
  assert.equal(collisionValue('7a'), 0x7a);
  assert.throws(() => collisionValue('NOT_A_LABEL'));
  assert.throws(() => loadWorld('NOPE'));
  assert.equal(mapIdOf('ElmsLab'), 'ELMS_LAB');
});

test('events come from the generated source events', () => {
  const world = loadWorld('ELMS_LAB');
  assert.deepEqual(world.warps.map((w) => [w.x, w.y]), [[4, 11], [5, 11]]);
  assert.equal(world.objects[0].id, 'ELMSLAB_ELM');
});
