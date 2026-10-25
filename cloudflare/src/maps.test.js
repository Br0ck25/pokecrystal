import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN, eventsAt } from './maps/new-bark-town.js';

test('New Bark Town dimensions match source map constants', () => {
  assert.equal(NEW_BARK_TOWN.dimensions.blocksWide, 10);
  assert.equal(NEW_BARK_TOWN.dimensions.blocksHigh, 9);
  assert.equal(NEW_BARK_TOWN.dimensions.tilesWide, 20);
  assert.equal(NEW_BARK_TOWN.dimensions.tilesHigh, 18);
});

test('New Bark Town preserves all four source warp events', () => {
  assert.deepEqual(NEW_BARK_TOWN.warps.map(({ x, y, destinationMap, destinationWarp }) =>
    [x, y, destinationMap, destinationWarp]), [
    [6, 3, 'ELMS_LAB', 1],
    [13, 5, 'PLAYERS_HOUSE_1F', 1],
    [3, 11, 'PLAYERS_NEIGHBORS_HOUSE', 1],
    [11, 13, 'ELMS_HOUSE', 1],
  ]);
  assert.equal(eventsAt(6, 3)[0].type, 'warp');
});

test('source coordinate events retain their scene requirements', () => {
  assert.equal(eventsAt(1, 8).length, 1);
  assert.equal(eventsAt(1, 8, 'SCENE_NEWBARKTOWN_NOOP').length, 0);
  assert.equal(eventsAt(1, 8, 'SCENE_NEWBARKTOWN_TEACHER_STOPS_YOU')[0].script,
    'NewBarkTown_TeacherStopsYouScene1');
});

test('signs and map objects are represented at source coordinates', () => {
  assert.equal(eventsAt(8, 8)[0].script, 'NewBarkTownSign');
  assert.equal(eventsAt(6, 8)[0].id, 'NEWBARKTOWN_TEACHER');
  assert.equal(eventsAt(12, 9)[0].id, 'NEWBARKTOWN_FISHER');
  assert.equal(eventsAt(3, 2)[0].id, 'NEWBARKTOWN_RIVAL');
  assert.equal(eventsAt(-1, 2).length, 0);
});
