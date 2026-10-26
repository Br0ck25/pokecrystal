import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from './battle.js';
import { createMon } from '../script/mon.js';

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
