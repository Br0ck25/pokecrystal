import test from 'node:test';
import assert from 'node:assert/strict';
import { PokegearScreen, hoursMins } from './pokegear.js';

test('hoursMins prints the 12-hour clock', () => {
  assert.equal(hoursMins({ hour: 10, minute: 0 }), '10:00 AM');
  assert.equal(hoursMins({ hour: 0, minute: 5 }), '12:05 AM');
  assert.equal(hoursMins({ hour: 13, minute: 30 }), ' 1:30 PM');
});

test('RIGHT and LEFT switch between the cards owned, B leaves', () => {
  const state = { engineFlags: new Set(['ENGINE_MAP_CARD']), clock: { day: 0, hour: 10, minute: 0 } };
  const g = new PokegearScreen(state);
  const run = (n, input = {}) => { for (let i = 0; i < n; i++) g.update(i ? {} : input); };
  run(60);
  run(1, { dir: 'right' }); run(40);
  assert.equal(g.card, 1);
  run(1, { dir: 'right' }); run(40);
  assert.equal(g.card, 1, 'no phone or radio card yet');
  run(1, { dir: 'up' });
  assert.equal(g.cursorLandmark, 2);
  run(1, { dir: 'left' }); run(40);
  assert.equal(g.card, 0);
  assert.equal(g.update({ b: true }), true);
});
