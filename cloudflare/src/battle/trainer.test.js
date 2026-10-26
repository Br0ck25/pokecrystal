import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from './battle.js';
import { createMon } from '../script/mon.js';
import { trainerParty } from './trainer-party.js';

const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16 & 255;

function play(battle, limit = 600) {
  const events = [];
  const gen = battle.run();
  let answer;
  for (let i = 0; i < limit; i++) {
    const { value, done } = gen.next(answer);
    if (done) return { events, result: value };
    events.push(value);
    answer = value.ask === 'yesno' ? false : value.ask ? { action: 'fight', slot: 0 } : undefined;
  }
  throw new Error('battle did not end');
}

test('trainer party: FALKNER has moves as listed, PP from the move table, and rewards 25 x the last level', () => {
  const t = trainerParty('FALKNER', 'FALKNER1');
  assert.deepEqual(t.party.map((m) => [m.species, m.level]), [['PIDGEY', 7], ['PIDGEOTTO', 9]]);
  assert.deepEqual(t.party[0].moves, ['TACKLE', 'MUD_SLAP']);
  assert.deepEqual(t.party[0].pp, [35, 10]);
  assert.equal(t.reward, 225);
  assert.equal(t.party[0].dvs[0], 154);
});

test('a trainer battle: the second Pokémon comes in after the first faints, winning pays 4 x reward', () => {
  const t = trainerParty('YOUNGSTER', 'JOEY1');
  t.party.push(createMon({ species: 'RATTATA', level: 3, dvs: [0x88, 0x88] }));
  const player = createMon({ species: 'TYPHLOSION', level: 40, dvs: [0xff, 0xff], id: 1 });
  player.moves = ['FLAMETHROWER']; player.pp = [15];
  const state = { money: 3000, items: {} };
  const battle = new Battle({ player: [player], enemy: t.party, wild: false, random: seeded(2), playerId: 1, state, trainerInfo: { name: t.name, className: t.className, reward: t.reward, ai: t.ai, items: t.items, flags: t.flags } });
  const { events, result } = play(battle);
  assert.equal(result.result, 'win');
  assert.equal(result.trainerDefeated, true);
  assert.ok(t.party.every((m) => m.hp === 0));
  assert.equal(events.filter((e) => e.enemySendOut).length, 2);
  assert.equal(state.money, 3000 + t.reward * 4);
  const text = events.filter((e) => e.text).map((e) => e.text.map((c) => c[1]).join(' '));
  assert.ok(text.some((x) => /YOUNGSTER JOEY was defeated!/.test(x)), text.join('\n'));
});

test('a battle that can be lost ends with the loss text instead of a whiteout, and a win heals the party', () => {
  const t = trainerParty('RIVAL1', 'RIVAL1_1_CHIKORITA');
  const player = createMon({ species: 'CHIKORITA', level: 2, dvs: [0, 0], id: 1 });
  player.hp = 1;
  const info = { name: t.name, className: t.className, cls: 'RIVAL1', canLose: true, reward: t.reward, ai: t.ai, items: t.items, flags: t.flags, win: null, loss: [['text', 'x']] };
  const battle = new Battle({ player: [player], enemy: t.party, wild: false, random: seeded(4), playerId: 1, state: { money: 0, items: {}, rivalName: 'SILVER' }, trainerInfo: info });
  const { events, result } = play(battle);
  assert.equal(result.result, 'lose');
  assert.ok(events.some((e) => e.trainerLossText));
  assert.ok(events.some((e) => e.text && e.text.some((c) => /SILVER/.test(c[1]))));
});
