import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSceneObjectPosition, isSceneObjectVisible } from './scene-object-state.js';
import { INITIAL_EVENT_FLAGS } from '../generated/events.js';
import { NEW_BARK_TOWN } from './new-bark-town.js';
import { ELMS_LAB } from './elms-lab.js';
import { PLAYERS_HOUSE_1F } from './players-house-1f.js';
import { PLAYERS_HOUSE_2F } from './players-house-2f.js';
import { ELMS_HOUSE } from './elms-house.js';
import { PLAYERS_NEIGHBORS_HOUSE } from './players-neighbors-house.js';

test('Elm is positioned at his opening-scene coordinate, then returns to his source map coordinate', () => {
  const elm = { id: 'ELMSLAB_ELM', x: 5, y: 2 };
  assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: false }), { x: 3, y: 4 });
  assert.deepEqual(resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: true }), { x: 5, y: 2 });
  assert.deepEqual(resolveSceneObjectPosition('NEW_BARK_TOWN', elm, {}), { x: 5, y: 2 });
});

test('runtime position rejects malformed objects and does not mutate source metadata', () => {
  assert.equal(resolveSceneObjectPosition('ELMS_LAB', null, {}), null);
  assert.equal(resolveSceneObjectPosition('ELMS_LAB', { id: 'bad', x: NaN, y: 2 }, {}), null);
  const elm = Object.freeze({ id: 'ELMSLAB_ELM', x: 5, y: 2 });
  resolveSceneObjectPosition('ELMS_LAB', elm, { labIntroComplete: false });
  assert.deepEqual({ x: elm.x, y: elm.y }, { x: 5, y: 2 });
});

test('objects are hidden by the new-game event flags, not by guessed story state', () => {
  const find = (map, id) => map.objects.find((o) => o.id === id);
  const ball = find(ELMS_LAB, 'ELMSLAB_POKE_BALL1');
  const officer = find(ELMS_LAB, 'ELMSLAB_OFFICER');
  const aide = find(ELMS_LAB, 'ELMSLAB_ELMS_AIDE');
  assert.equal(isSceneObjectVisible('ELMS_LAB', ball, {}), true);
  assert.equal(isSceneObjectVisible('ELMS_LAB', ball, { starterBall: 'ELMSLAB_POKE_BALL1' }), false);
  assert.equal(isSceneObjectVisible('ELMS_LAB', find(ELMS_LAB, 'ELMSLAB_POKE_BALL2'), { starterBall: 'ELMSLAB_POKE_BALL1' }), true);
  // InitializeEventsScript sets EVENT_COP_IN_ELMS_LAB, so the officer starts hidden; only an explicit story event clears it.
  assert.equal(isSceneObjectVisible('ELMS_LAB', officer, { starter: 'TOTODILE' }), false);
  assert.equal(isSceneObjectVisible('ELMS_LAB', officer, { officerVisible: true }), true);
  // EVENT_ELMS_AIDE_IN_LAB is only ever set later (phone/Elm scripts), so the aide is in the lab from the start (checked against the real game).
  assert.equal(isSceneObjectVisible('ELMS_LAB', aide, {}), true);
  assert.equal(isSceneObjectVisible('ELMS_LAB', aide, { starter: 'TOTODILE' }), true);
  assert.equal(isSceneObjectVisible('NEW_BARK_TOWN', ball, { starterBall: ball.id }), false, 'objects are looked up by map and coordinates');
});

test('the New Bark Town rival is visible in a new game; EVENT_RIVAL_NEW_BARK_TOWN is set much later', () => {
  const rival = NEW_BARK_TOWN.objects.find((o) => o.id === 'NEWBARKTOWN_RIVAL');
  assert.equal(INITIAL_EVENT_FLAGS.includes('EVENT_RIVAL_NEW_BARK_TOWN'), false);
  assert.equal(isSceneObjectVisible('NEW_BARK_TOWN', rival, {}), true);
});

test('neighbor visibility follows the source flags in each house', () => {
  const home = PLAYERS_HOUSE_1F.objects.find((o) => o.id === 'NEIGHBOR');
  const away = PLAYERS_NEIGHBORS_HOUSE.objects.find((o) => o.id === 'NEIGHBOR');
  assert.equal(isSceneObjectVisible('PLAYERS_HOUSE_1F', home, {}), true);
  assert.equal(isSceneObjectVisible('PLAYERS_NEIGHBORS_HOUSE', away, {}), false);
});

test('no ported map has an hour-limited object', () => {
  for (const [id, map] of Object.entries({ NEW_BARK_TOWN, ELMS_LAB, PLAYERS_HOUSE_1F, PLAYERS_HOUSE_2F, ELMS_HOUSE, PLAYERS_NEIGHBORS_HOUSE })) {
    for (const object of map.objects) assert.doesNotThrow(() => isSceneObjectVisible(id, object, {}), `${id} ${object.id}`);
  }
});
