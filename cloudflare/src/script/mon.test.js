import test from 'node:test';
import assert from 'node:assert/strict';
import { createMon, expAtLevel, movesAtLevel, levelForExp, recalcStats } from './mon.js';
import { monGender } from './gender.js';

// Read from the real game's wPartyMon1 after Elm gave CHIKORITA: DVs 155,31 -> level 5, exp 135, HP 21, ATK 10, DEF 12, SPD 9, SAT 11, SDF 13.
test('a new level-5 CHIKORITA has the stats, moves, PP and experience the real game gave it', () => {
  const mon = createMon({ species: 'CHIKORITA', level: 5, dvs: [155, 31] });
  assert.deepEqual(mon.stats, { hp: 21, atk: 10, def: 12, spd: 9, sat: 11, sdf: 13 });
  assert.deepEqual(mon.moves, ['TACKLE', 'GROWL']);
  assert.deepEqual(mon.pp, [35, 40]);
  assert.equal(mon.exp, 135);
  assert.equal(mon.happiness, 70);
});

test('the learnset fills four slots and drops the oldest move; experience follows the growth curves', () => {
  assert.deepEqual(movesAtLevel('CYNDAQUIL', 20), ['LEER', 'SMOKESCREEN', 'EMBER', 'QUICK_ATTACK']);   // TACKLE, the oldest, is gone
  assert.equal(expAtLevel('CHIKORITA', 100), 1059860);        // medium slow: 6/5 n^3 - 15 n^2 + 100 n - 140
  assert.equal(expAtLevel('RATTATA', 100), 1000000);          // medium fast: n^3
});

test('gender follows the Attack and Speed DVs against the species ratio', () => {
  assert.equal(monGender('CHIKORITA', [155, 31]), 'MALE');
  assert.equal(monGender('CHIKORITA', [0x00, 0x00]), 'FEMALE');
  assert.equal(monGender('MAGNEMITE', [155, 31]), null);
});

test('levelForExp is the highest level whose experience is reached; recalcStats raises HP and current HP together', () => {
  assert.equal(levelForExp('CHIKORITA', 135), 5);
  assert.equal(levelForExp('CHIKORITA', 134), 4);
  assert.equal(levelForExp('CHIKORITA', 10 ** 7), 100);
  const mon = createMon({ species: 'CHIKORITA', level: 5, dvs: [155, 31] });
  mon.hp = 10;
  mon.level = 6;
  recalcStats(mon);
  assert.equal(mon.stats.hp, 23);
  assert.equal(mon.hp, 12);
});
