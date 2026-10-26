import test from 'node:test';
import assert from 'node:assert/strict';
import { checkHit, modifiedAccuracy, rawAccuracy } from './accuracy.js';

const mon = { accLevel: 7, evaLevel: 7 };
const move = (extra) => ({ name: 'TACKLE', effect: 'EFFECT_NORMAL_HIT', accuracy: rawAccuracy(95), ...extra });

test('raw accuracy is percent * 255 / 100 and the stage table scales it twice', () => {
  assert.equal(rawAccuracy(95), 242);
  assert.equal(modifiedAccuracy(242, 7, 7, false), 242);
  assert.equal(modifiedAccuracy(242, 8, 7, false), 255);                 // +1 accuracy: 133/100 passes the cap
  assert.equal(modifiedAccuracy(200, 7, 8, false), 150);                 // +1 evasion: stage 6 of the table is 75/100
  assert.equal(modifiedAccuracy(200, 7, 8, true), 200);                  // identified targets ignore evasion
});

test('a roll below the accuracy byte hits; 255 never rolls', () => {
  assert.equal(checkHit({ user: mon, target: mon, move: move(), random: () => 241 }).hit, true);
  assert.equal(checkHit({ user: mon, target: mon, move: move(), random: () => 242 }).hit, false);
  assert.equal(checkHit({ user: mon, target: mon, move: move({ accuracy: 255 }), random: () => { throw new Error('rolled'); } }).hit, true);
});

test('semi-invulnerable, protect, dream eater, lock-on and BRIGHTPOWDER', () => {
  const never = () => { throw new Error('rolled'); };
  assert.equal(checkHit({ user: mon, target: { ...mon, flying: true }, move: move(), random: never }).hit, false);
  assert.equal(checkHit({ user: mon, target: { ...mon, flying: true }, move: move({ name: 'GUST' }), random: () => 0 }).hit, true);
  assert.equal(checkHit({ user: mon, target: { ...mon, protect: true }, move: move(), random: never }).hit, false);
  assert.equal(checkHit({ user: mon, target: mon, move: move({ effect: 'EFFECT_DREAM_EATER' }), random: never }).hit, false);
  const locked = checkHit({ user: mon, target: mon, move: move(), lockedOn: true, random: never });
  assert.deepEqual(locked, { hit: true, lockOnUsed: true });
  assert.equal(checkHit({ user: mon, target: { ...mon, item: 'BRIGHTPOWDER' }, move: move(), random: () => 225 }).hit, false);
  assert.equal(checkHit({ user: mon, target: { ...mon, item: 'BRIGHTPOWDER' }, move: move(), random: () => 221 }).hit, true);
});
