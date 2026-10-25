import test from 'node:test';
import assert from 'node:assert/strict';
import { getLabStarter, getLabStarterBallId, mustBlockLabExit, LAB_STARTERS } from './maps/starter-selection.js';

test('the three lab balls map to the original Johto starters at level 5', () => {
  assert.deepEqual(Object.values(LAB_STARTERS).map(({ species, level }) => [species, level]), [
    ['CYNDAQUIL', 5],
    ['TOTODILE', 5],
    ['CHIKORITA', 5],
  ]);
  assert.equal(getLabStarter('ELMSLAB_POKE_BALL1').species, 'CYNDAQUIL');
  assert.equal(getLabStarter('ELMSLAB_POKE_BALL2').species, 'TOTODILE');
  assert.equal(getLabStarter('ELMSLAB_POKE_BALL3').species, 'CHIKORITA');
  assert.equal(getLabStarter('unknown-ball'), null);
});

test('starter selection is reversible by ball ID and gates lab exit until chosen', () => {
  for (const species of ['CYNDAQUIL', 'TOTODILE', 'CHIKORITA']) {
    const ball = getLabStarterBallId(species);
    assert.ok(ball);
    assert.equal(getLabStarter(ball).species, species);
  }
  assert.equal(getLabStarterBallId('PIKACHU'), null);
  assert.equal(mustBlockLabExit(null), true);
  assert.equal(mustBlockLabExit('CYNDAQUIL'), false);
});
