import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartElmOpeningScene, canCancelPendingScene, ELM_OPENING_MOVEMENT, ELM_RETURN_TO_STATION_MOVEMENT } from './scene-progression.js';

test('Elm opening starts only on first eligible lab entry', () => {
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'NEW_BARK_TOWN',starter:null,labIntroComplete:false}), true);
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'ELMS_LAB',starter:null,labIntroComplete:false}), false);
 assert.equal(shouldStartElmOpeningScene({mapId:'ELMS_LAB',previousMapId:'NEW_BARK_TOWN',starter:'TOTODILE',labIntroComplete:false}), false);
 assert.equal(canCancelPendingScene('LAB_INTRO'), false);
});

test('Elm approach exactly preserves seven UP steps from the disassembly', () => {
 assert.deepEqual(ELM_OPENING_MOVEMENT, ['up','up','up','up','up','up','up']);
 assert.equal(ELM_OPENING_MOVEMENT.length, 7);
});


test('Elm returns to his source map position with the original actor order and facings', () => {
 assert.deepEqual(ELM_RETURN_TO_STATION_MOVEMENT, [
  { actor: 'ELM', direction: 'up' },
  { actor: 'PLAYER', facing: 'up' },
  { actor: 'ELM', direction: 'right' },
  { actor: 'ELM', direction: 'right' },
  { actor: 'ELM', direction: 'up' },
  { actor: 'ELM', facing: 'down' },
  { actor: 'PLAYER', facing: 'right' },
 ]);
});
