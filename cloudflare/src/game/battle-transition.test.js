import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleTransition, sineWave, transitionKind } from './battle-transition.js';

test('transitionKind: caves and a lead three levels or more under the last enemy level', () => {
  assert.deepEqual(transitionKind({ environment: 'CAVE', leadLevel: 10, enemyLevel: 14 }), { cave: true, stronger: true });
  assert.deepEqual(transitionKind({ environment: 'ROUTE', leadLevel: 10, enemyLevel: 13 }), { cave: false, stronger: false });
  assert.deepEqual(transitionKind({ environment: 'DUNGEON', leadLevel: 10, enemyLevel: 0 }), { cave: true, stronger: false });
});

test('sineWave is d * sin(phase * pi / 32) with the ROM table (256 at the peak)', () => {
  assert.equal(sineWave(0, 100), 0);
  assert.equal(sineWave(16, 100), 100);
  assert.equal(sineWave(48, 100), -100);
  assert.equal(sineWave(8, 100), 70);
});

const run = (options) => {
  const t = new BattleTransition({ random: () => Math.floor(Math.random() * 256), ...options });
  const frames = [];
  while (!t.update()) frames.push({ ...t.view, cells: t.view.cells.slice() });
  return frames;
};

test('trainer transition: the Poké Ball and pal7 at frame 24, flashes from 28, black at 170 (spin outro)', () => {
  const frames = run({ trainer: true, cave: false, stronger: false });
  assert.equal(frames[23].pal7, false);
  assert.equal(frames[24].pal7, true);
  assert.ok(frames[24].cells.some((c) => c === 1));
  assert.equal(frames[27].bgp, null);
  assert.notEqual(frames[28].bgp, null);
  assert.equal(frames[169].black, false);
  assert.equal(frames[170].black, true);
  assert.equal(frames.length, 170 + 92);
  assert.equal(frames[104].sprites, 'fighters');
});

test('wild transition has no Poké Ball and starts flashing three frames earlier', () => {
  const frames = run({ trainer: false, cave: false, stronger: false });
  assert.equal(frames.some((f) => f.pal7), false);
  assert.notEqual(frames[25].bgp, null);
  assert.equal(frames[24].bgp, null);
});

test('the four outros end with black at 170 (spin), 126 (speckle), 122 (wavy) and 142 (zoom)', () => {
  const black = (opts) => run({ trainer: true, ...opts }).findIndex((f) => f.black);
  assert.equal(black({ cave: false, stronger: false }), 170);
  assert.equal(black({ cave: false, stronger: true }), 126);
  assert.equal(black({ cave: true, stronger: false }), 122);
  assert.equal(black({ cave: true, stronger: true }), 142);
});
