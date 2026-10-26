import test from 'node:test';
import assert from 'node:assert/strict';
import { MoveScreen } from './move-screen.js';

const mon = () => ({ species: 'CHIKORITA', level: 12, nickname: 'TEST', moves: ['TACKLE', 'RAZOR_LEAF', 'POISONPOWDER'], pp: [35, 25, 35] });

test('A on one move then another swaps the moves and their PP after the sound', () => {
  const state = { party: [mon()] };
  const screen = new MoveScreen(state, 0);
  const press = (input, n = 1) => { for (let i = 0; i < n; i++) screen.update(i === 0 ? input : {}); };
  press({}, 40);
  press({ a: true });
  press({ dir: 'down' });
  press({ a: true });
  assert.deepEqual(state.party[0].moves, ['TACKLE', 'RAZOR_LEAF', 'POISONPOWDER']);   // still the old list while the sound plays
  press({}, 60);
  assert.deepEqual(state.party[0].moves, ['RAZOR_LEAF', 'TACKLE', 'POISONPOWDER']);
  assert.deepEqual(state.party[0].pp, [25, 35, 35]);
});

test('B leaves the screen, or cancels a pick-up first', () => {
  const screen = new MoveScreen({ party: [mon()] }, 0);
  screen.update({ a: true });
  assert.equal(screen.update({ b: true }), false);
  assert.equal(screen.update({ b: true }), true);
});
