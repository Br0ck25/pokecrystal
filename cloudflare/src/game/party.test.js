import test from 'node:test';
import assert from 'node:assert/strict';
import { PartyScreen, hpPixels, hpColor, hpBarTiles, submenuItems } from './party.js';
import { createMon } from '../script/mon.js';

const state = (...species) => ({ party: species.map((s) => createMon({ species: s, level: 5, dvs: [155, 31], id: 1 })), playerName: 'A' });
const press = (screen, input, frames = 1) => { for (let i = 0; i < frames; i++) screen.update(i === 0 ? input : {}); };

test('HP bar: pixels out of 48, at least one while alive, colors by pixel count, tiles from DrawBattleHPBar', () => {
  assert.equal(hpPixels(21, 21), 48);
  assert.equal(hpPixels(1, 200), 1);
  assert.equal(hpPixels(0, 20), 0);
  assert.deepEqual([47, 24, 23, 10, 9].map((p) => hpColor(p)), ['HP_GREEN', 'HP_GREEN', 'HP_YELLOW', 'HP_YELLOW', 'HP_RED']);
  assert.deepEqual(hpBarTiles(48), [0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a]);
  assert.deepEqual(hpBarTiles(10), [0x6a, 0x64, 0x62, 0x62, 0x62, 0x62]);       // one full tile, two pixels of the next
});

test('the submenu lists field moves first, then STATS SWITCH MOVE ITEM CANCEL', () => {
  const mon = createMon({ species: 'CHIKORITA', level: 5, dvs: [0, 0], id: 1 });
  assert.deepEqual(submenuItems(mon).map((i) => i.id), ['STATS', 'SWITCH', 'MOVE', 'ITEM', 'CANCEL']);
  assert.deepEqual(submenuItems({ ...mon, moves: ['CUT', 'TACKLE'] }).map((i) => i.id).slice(0, 2), ['CUT', 'STATS']);
});

test('the party screen moves the cursor, switches two Pokémon and closes on CANCEL', () => {
  const s = state('CHIKORITA', 'CYNDAQUIL');
  const screen = new PartyScreen(s);
  press(screen, { dir: 'down' }, 20);
  assert.equal(screen.cursor, 2);
  press(screen, { a: true });                                  // CYNDAQUIL's submenu
  press(screen, { dir: 'down' }, 20);                          // SWITCH
  press(screen, { a: true });
  assert.equal(screen.phase, 'switch');
  press(screen, { dir: 'up' }, 20);
  press(screen, { a: true });                                  // swap with CHIKORITA
  assert.deepEqual(s.party.map((m) => m.species), ['CYNDAQUIL', 'CHIKORITA']);
  press(screen, { dir: 'down' }, 20); press(screen, { dir: 'down' }, 20);
  assert.equal(screen.cursor, 3, 'the CANCEL row');
  assert.equal(screen.update({ a: true }), true);
});
