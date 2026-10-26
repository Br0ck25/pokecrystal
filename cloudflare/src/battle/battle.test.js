import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from './battle.js';
import { createMon, expAtLevel } from '../script/mon.js';

/** Drive a battle: the player always picks move slot 0. Returns the events and the result. */
function play(battle, limit = 200) {
  const events = [];
  const gen = battle.run();
  let answer;
  for (let i = 0; i < limit; i++) {
    const { value, done } = gen.next(answer);
    if (done) return { events, result: value };
    events.push(value);
    answer = value.ask ? { action: 'fight', slot: Math.max(0, battle.sides[0].pp.findIndex((p) => p > 0)) } : undefined;
  }
  throw new Error('battle did not end');
}
const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16 & 255;
const texts = (events) => events.filter((e) => e.text).map((e) => e.text.map((c) => c[1]).join(' / '));

test('a level 5 CHIKORITA beats a level 3 RATTATA with TACKLE', () => {
  const player = createMon({ species: 'CHIKORITA', level: 5, dvs: [155, 31] });
  const enemy = createMon({ species: 'RATTATA', level: 3, dvs: [0x88, 0x88] });
  const battle = new Battle({ player: [player], enemy, random: seeded(1) });
  const { events, result } = play(battle);
  assert.equal(result.result, 'win');
  assert.ok(texts(events).some((t) => /used TACKLE!/.test(t)));
  assert.equal(enemy.hp, 0);
  assert.equal(player.pp[0], 35 - events.filter((e) => e.anim === 'TACKLE' && e.user === 0).length);
});

test('winning gives experience, stat experience and a level up with the moves of that level', () => {
  const player = createMon({ species: 'CHIKORITA', level: 7, dvs: [155, 31], id: 1 });
  player.exp = expAtLevel('CHIKORITA', 8) - 10;
  const enemy = createMon({ species: 'PIDGEY', level: 8, dvs: [0x88, 0x88] });
  const battle = new Battle({ player: [player], enemy, random: seeded(3), playerId: 1 });
  const { events, result } = play(battle, 400);
  assert.equal(result.result, 'win');
  assert.ok(texts(events).some((t) => /CHIKORITA gained/.test(t)));
  assert.ok(player.exp > expAtLevel('CHIKORITA', 8));
  assert.equal(player.statExp.hp, 40);
  assert.equal(player.level, 8);
  assert.ok(player.moves.includes('RAZOR_LEAF'));
});

test('running: a faster Pokémon always gets away, a slower one may fail and lose its turn', () => {
  const fast = createMon({ species: 'PIDGEY', level: 20, dvs: [0xff, 0xff], id: 1 });
  const slow = createMon({ species: 'SNORLAX', level: 5, dvs: [0, 0], id: 1 });
  const wildMon = createMon({ species: 'RATTATA', level: 10, dvs: [0xff, 0xff] });
  const run1 = (player, random) => { const b = new Battle({ player: [player], enemy: wildMon, random }); const g = b.run(); let r = g.next(); while (!r.value.ask) r = g.next(); const events = []; r = g.next({ action: 'run' }); while (!r.done && !r.value.ask) { events.push(r.value); r = g.next(); } return { r, events }; };
  assert.equal(run1(fast, () => 253).r.done, true);
  const failed = run1(slow, () => 253);
  assert.ok(texts(failed.events).some((t) => /Can't escape!/.test(t)));
});

test('a fainted Pokémon is replaced from the party after "Use next POKéMON?", and a chosen switch costs the turn', () => {
  const weak = createMon({ species: 'CHIKORITA', level: 5, dvs: [155, 31], id: 1 });
  weak.hp = 1;
  const second = createMon({ species: 'CYNDAQUIL', level: 30, dvs: [0xff, 0xff], id: 1 });
  const enemy = createMon({ species: 'RATTATA', level: 20, dvs: [0xff, 0xff] });
  const battle = new Battle({ player: [weak, second], enemy, random: seeded(9), playerId: 1 });
  const gen = battle.run();
  const seen = [];
  let answer, rounds = 0;
  for (let i = 0; i < 600; i++) {
    const { value, done } = gen.next(answer);
    if (done) { seen.push({ done: value }); break; }
    seen.push(value);
    answer = undefined;
    if (value.ask === 'action') { if (++rounds > 40) break; answer = { action: 'fight', slot: Math.max(0, battle.sides[0].pp.findIndex((p) => p > 0)) }; }
    if (value.ask === 'yesno') answer = true;
    if (value.ask === 'party') answer = 1;
  }
  assert.ok(seen.some((e) => e.faint === 0), 'the first Pokémon fainted');
  assert.ok(texts(seen).some((t) => /Use next/.test(t)));
  assert.ok(seen.some((e) => e.sendOut === 0 && e.species === 'CYNDAQUIL'), 'CYNDAQUIL was sent out');
  assert.equal(battle.sides[0].mon, second);
  assert.equal(seen.at(-1).done?.result, 'win');

  const a = createMon({ species: 'CHIKORITA', level: 10, dvs: [155, 31], id: 1 }), b = createMon({ species: 'PIDGEY', level: 10, dvs: [0, 0], id: 1 });
  const wild = createMon({ species: 'RATTATA', level: 3, dvs: [0, 0] });
  const sw = new Battle({ player: [a, b], enemy: wild, random: seeded(4), playerId: 1 });
  const g = sw.run();
  let r = g.next();
  while (!r.value.ask) r = g.next();
  const evs = [];
  r = g.next({ action: 'switch', index: 1 });
  while (!r.done && !r.value.ask) { evs.push(r.value); r = g.next(); }
  assert.equal(sw.sides[0].mon, b);
  assert.ok(texts(evs).some((t) => /ome back/i.test(t)), 'the withdraw text');
  assert.ok(texts(evs).some((t) => /Enemy RATTATA/.test(t)), 'the enemy moved during the switch turn');
});

test('a ball catches by the formula: a weakened sleeping Pokémon is caught, the capture joins the party with its HP', () => {
  const player = createMon({ species: 'CHIKORITA', level: 10, dvs: [155, 31], id: 1 });
  const wild = createMon({ species: 'RATTATA', level: 3, dvs: [0x88, 0x88] });
  wild.hp = 1;
  wild.status = 3;
  const state = { items: { POKE_BALL: 5 }, dexSeen: new Set(), dexCaught: new Set(), playerName: 'CHRIS', box: [] };
  const battle = new Battle({ player: [player], enemy: wild, random: () => 0, playerId: 1, state });
  const g = battle.run();
  let r = g.next();
  while (!r.value.ask) r = g.next();
  r = g.next({ action: 'item', item: 'POKE_BALL' });
  const seen = [];
  while (!r.done) {
    seen.push(r.value);
    r = g.next(r.value.ask === 'yesno' ? false : undefined);
  }
  assert.equal(r.value.result, 'caught');
  assert.equal(battle.party.length, 2);
  assert.equal(battle.party[1].species, 'RATTATA');
  assert.equal(battle.party[1].hp, 1);
  assert.equal(state.items.POKE_BALL, 4);
  assert.ok(state.dexCaught.has('RATTATA'));
  assert.ok(texts(seen).some((t) => /Gotcha/.test(t)));
});

import { finalCatchRate } from './catching.js';
test('catch rate: 85 for a full-HP 255-rate Pokémon with a POKé BALL (read from the real game), more when weakened, +10 asleep', () => {
  const full = { species: 'PIDGEY', hp: 13, maxHp: 13, status: 0 };
  assert.equal(finalCatchRate('POKE_BALL', full), 85);
  assert.equal(finalCatchRate('POKE_BALL', { ...full, hp: 1 }), Math.floor((255 * (39 - 2)) / 39));
  assert.equal(finalCatchRate('POKE_BALL', { ...full, status: 3 }), 95);
  assert.equal(finalCatchRate('GREAT_BALL', { species: 'GEODUDE', hp: 20, maxHp: 20, status: 0 }), Math.floor((255 * 20) / 60));   // rate 255 anyway, capped
});
