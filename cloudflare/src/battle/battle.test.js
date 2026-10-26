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
    answer = value.ask ? { action: 'fight', slot: 0 } : undefined;
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
