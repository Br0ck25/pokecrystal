import test from 'node:test';
import assert from 'node:assert/strict';
import { PokedexScreen } from './pokedex.js';

const seenAll = (species) => ({ dexSeen: new Set(species), dexCaught: new Set(species.slice(0, 1)) });

test('the list follows the new order and stops at the last Pokémon seen', () => {
  const g = new PokedexScreen(seenAll(['CHIKORITA', 'BAYLEEF', 'MEGANIUM', 'CYNDAQUIL', 'QUILAVA', 'TYPHLOSION', 'TOTODILE', 'CROCONAW', 'FERALIGATR']));
  assert.equal(g.end, 9);
  for (let i = 0; i < 40; i++) g.update({});
  const press = (dir) => { g.update({ dir }); g.update({}); };
  for (let i = 0; i < 8; i++) press('down');
  assert.equal(g.cursor + g.scroll, 8);
  assert.equal(g.scroll, 2, 'the list scrolls once the cursor reaches the bottom row');
  press('down');
  assert.equal(g.cursor + g.scroll, 8, 'and stops at the end');
  press('left');
  assert.equal(g.scroll, 0, 'LEFT goes up a page');
});

test('A opens the entry of a seen Pokémon after a short delay, UP and DOWN skip the unseen, B returns', () => {
  const g = new PokedexScreen(seenAll(['CHIKORITA', 'MEGANIUM']));
  for (let i = 0; i < 40; i++) g.update({});
  g.update({ a: true });
  for (let i = 0; i < 20; i++) g.update({});
  assert.equal(g.mode, 'entry');
  g.update({ dir: 'down' });
  assert.equal(g.species, 'MEGANIUM');
  g.update({}); g.update({ a: true }); assert.equal(g.page, 1, 'the arrow starts on PAGE: A turns the page');
  g.update({ b: true });
  assert.equal(g.mode, 'list');
  assert.equal(g.update({ b: true }), true);
});
