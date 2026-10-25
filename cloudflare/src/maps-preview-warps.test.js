import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePreviewWarp } from './maps/preview-warps.js';
import { NEW_BARK_TOWN } from './maps/new-bark-town.js';
import { ELMS_LAB } from './maps/elms-lab.js';

test('town entrance warp resolves to the interior lab landing tile', () => {
  const warp = NEW_BARK_TOWN.warps.find(item => item.destinationMap === 'ELMS_LAB');
  assert.deepEqual(resolvePreviewWarp('NEW_BARK_TOWN', warp), {
    mapId: 'ELMS_LAB', x: 4, y: 10, facing: 'up',
  });
});

test('both lab exit warps return to the exterior landing tile', () => {
  for (const warp of ELMS_LAB.warps) {
    assert.deepEqual(resolvePreviewWarp('ELMS_LAB', warp), {
      mapId: 'NEW_BARK_TOWN', x: 6, y: 4, facing: 'down',
    });
  }
});

test('unknown destinations and malformed warps fail closed', () => {
  assert.equal(resolvePreviewWarp('NEW_BARK_TOWN', { destinationMap: 'PLAYERS_NEIGHBORS_HOUSE' }), null);
  assert.equal(resolvePreviewWarp('UNKNOWN_MAP', { destinationMap: 'ELMS_LAB' }), null);
  assert.equal(resolvePreviewWarp('ELMS_LAB', null), null);
});
