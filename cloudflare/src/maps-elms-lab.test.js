import test from 'node:test';
import assert from 'node:assert/strict';
import { ELMS_LAB, elmLabEventsAt } from './maps/elms-lab.js';

test("Elm's Lab dimensions match the original map constants", () => {
  assert.deepEqual(ELMS_LAB.dimensions, {
    blocksWide: 5,
    blocksHigh: 6,
    metatilesWide: 10,
    metatilesHigh: 12,
    blockSizeMetatiles: 2,
  });
});

test("Elm's Lab keeps both source exit warps", () => {
  assert.deepEqual(ELMS_LAB.warps.map(({ x, y, destinationMap, destinationWarp }) =>
    [x, y, destinationMap, destinationWarp]), [
    [4, 11, 'NEW_BARK_TOWN', 1],
    [5, 11, 'NEW_BARK_TOWN', 1],
  ]);
  assert.equal(elmLabEventsAt(4, 11)[0].type, 'warp');
  assert.equal(elmLabEventsAt(5, 11)[0].destinationMap, 'NEW_BARK_TOWN');
});

test("Elm, aide, officer, and all three starter balls retain source coordinates", () => {
  assert.deepEqual(ELMS_LAB.objects.map(({ id, x, y }) => [id, x, y]), [
    ['ELMSLAB_ELM', 5, 2],
    ['ELMSLAB_ELMS_AIDE', 2, 9],
    ['ELMSLAB_POKE_BALL1', 6, 3],
    ['ELMSLAB_POKE_BALL2', 7, 3],
    ['ELMSLAB_POKE_BALL3', 8, 3],
    ['ELMSLAB_OFFICER', 5, 3],
  ]);
  assert.equal(elmLabEventsAt(5, 2)[0].script, 'ProfElmScript');
});

test('coordinate scripts retain scene conditions rather than becoming unconditional events', () => {
  assert.equal(elmLabEventsAt(4, 6).length, 1);
  assert.equal(elmLabEventsAt(4, 6, 'SCENE_ELMSLAB_CANT_LEAVE')[0].script, 'LabTryToLeaveScript');
  assert.equal(elmLabEventsAt(4, 6, 'SCENE_ELMSLAB_NOOP').length, 0);
  assert.equal(elmLabEventsAt(4, 8, 'SCENE_ELMSLAB_AIDE_GIVES_POTION')[0].script, 'AideScript_WalkPotion1');
  assert.equal(elmLabEventsAt(4, 8, 'SCENE_ELMSLAB_AIDE_GIVES_POKE_BALLS')[0].script, 'AideScript_WalkBalls1');
});

test('background events and object lookups reject out-of-bounds coordinates', () => {
  assert.equal(elmLabEventsAt(2, 1)[0].script, 'ElmsLabHealingMachine');
  assert.equal(elmLabEventsAt(5, 0)[0].script, 'ElmsLabWindow');
  assert.deepEqual(elmLabEventsAt(-1, 0), []);
  assert.deepEqual(elmLabEventsAt(10, 0), []);
  assert.deepEqual(elmLabEventsAt(0, 12), []);
  assert.deepEqual(elmLabEventsAt(1.5, 1), []);
});
