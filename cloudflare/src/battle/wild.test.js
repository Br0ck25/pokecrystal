import test from 'node:test';
import assert from 'node:assert/strict';
import { wildEncounter } from './wild.js';

const rolls = (...values) => () => values.shift();
const party = [{ hp: 10, level: 5 }];

test('ROUTE_29 by day: rate 25 of 256, slot by probability bracket, level raised by the extra roll', () => {
  // rate roll 24 < 25; slot roll 0 -> 1 -> first bracket (30%): slot 0 of the day table = PIDGEY 2; level roll 200 -> +2
  assert.deepEqual(wildEncounter({ map: 'ROUTE_29', timeOfDay: 1, party, random: rolls(24, 0, 200) }), { species: 'PIDGEY', level: 4 });
  assert.equal(wildEncounter({ map: 'ROUTE_29', timeOfDay: 1, party, random: rolls(25) }), null);
});

test('rolls of 100 or more are rerolled, a Repel blocks weaker encounters, unknown maps have none', () => {
  assert.deepEqual(wildEncounter({ map: 'ROUTE_29', timeOfDay: 1, party, random: rolls(0, 150, 99, 0) }), { species: 'HOPPIP', level: 3 });
  assert.equal(wildEncounter({ map: 'ROUTE_29', timeOfDay: 1, party, repelSteps: 50, random: rolls(0, 0, 0) }), null);
  assert.equal(wildEncounter({ map: 'NEW_BARK_TOWN', timeOfDay: 1, party, random: () => 0 }), null);
});
