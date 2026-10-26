import test from 'node:test';
import assert from 'node:assert/strict';
import { NewGame } from './new-game.js';
import { NamingScreen } from './naming.js';

const advance = (g, until, limit = 20000) => {
  for (let i = 0; i < limit; i++) {
    const t = g.view.text;
    const r = g.update(t && t.ready && g.wait?.text ? { a: true } : {});
    if (r || until()) return r;
  }
  throw new Error('did not reach the goal');
};

test('NEW GAME: gender, Oak, a preset name, then the state for the room', () => {
  const g = new NewGame({ playerId: 7 });
  advance(g, () => g.wait?.menu?.items.length === 2);
  g.update({ dir: 'down' }); g.update({});
  g.update({ a: true });                                   // Girl
  advance(g, () => g.wait?.menu?.items.length === 5);
  assert.deepEqual(g.wait.menu.items.slice(1), ['KRIS', 'AMANDA', 'JUANA', 'JODI']);
  g.update({ dir: 'down' }); g.update({}); g.update({ a: true });   // KRIS
  const done = advance(g, () => false);
  assert.equal(done.state.playerName, 'KRIS');
  assert.equal(done.state.playerGender, 'FEMALE');
  assert.equal(done.state.playerId, 7);
});

test('the naming screen enters, deletes and ends like the game (empty names fall back to the preset)', () => {
  const n = new NamingScreen();
  n.update({ a: true });                                  // A
  n.update({ dir: 'right' }); n.update({});
  n.update({ a: true });                                  // B
  assert.equal(n.name(), 'AB');
  n.update({ b: true });
  assert.equal(n.name(), 'A');
  n.update({ start: true });                              // cursor to END
  assert.deepEqual(n.update({ a: true }), { name: 'A' });
});
