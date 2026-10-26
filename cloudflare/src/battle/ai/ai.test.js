import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../battle.js';
import { createMon } from '../../script/mon.js';
import { trainerParty } from '../trainer-party.js';

const seeded = (seed) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16 & 255;

function battleAgainst(cls, id, playerSpecies, playerMoves, { random = seeded(5) } = {}) {
  const t = trainerParty(cls, id);
  const mon = createMon({ species: playerSpecies, level: 12, dvs: [0xab, 0xcd], id: 1 });
  mon.moves = playerMoves; mon.pp = playerMoves.map(() => 20);
  const b = new Battle({ player: [mon], enemy: t.party, wild: false, random, playerId: 1, state: { money: 0, items: {} }, trainerInfo: { name: t.name, className: t.className, reward: t.reward, ai: t.ai, items: t.items, flags: t.flags } });
  return b;
}

// Both results were read from the real game (tools/reference/damage/ai_probe3.py style probes of Falkner's first turn): his PIDGEY uses MUD_SLAP on a
// GEODUDE and TACKLE on a CHIKORITA, every time.
test('Falkner: MUD_SLAP against GEODUDE, TACKLE against CHIKORITA (as in the real game)', () => {
  const pick = (species, moves) => { const picks = new Set(); for (let s = 1; s < 30; s++) { const b = battleAgainst('FALKNER', 'FALKNER1', species, moves, { random: seeded(s) }); b.aiChooseMove(); picks.add(b.sides[1].curMove); } return [...picks]; };
  assert.deepEqual(pick('GEODUDE', ['ROCK_THROW', 'TACKLE', 'DEFENSE_CURL']), ['MUD_SLAP']);
  assert.deepEqual(pick('CHIKORITA', ['TACKLE', 'RAZOR_LEAF', 'POISONPOWDER']), ['TACKLE']);
});

test('AI_Basic: a status-only move is discouraged once the player already has a status, a redundant one too', () => {
  const picks = new Set();
  for (let seed = 1; seed < 40; seed++) {
    const b = battleAgainst('GRUNTM', 'GRUNTM_1', 'CHIKORITA', ['TACKLE'], { random: seeded(seed) });
    Object.assign(b.sides[1], { moves: ['THUNDER_WAVE', 'TACKLE', 'SUBSTITUTE', 'GROWL'], pp: [10, 35, 10, 40] });
    b.sides[1].sub.substitute = true;                      // the enemy already has a substitute
    b.sides[0].status = 0x40;                              // the player is paralysed
    b.aiChooseMove();
    picks.add(b.sides[1].curMove);
  }
  assert.ok(!picks.has('THUNDER_WAVE') && !picks.has('SUBSTITUTE'), [...picks].join());
});

test('the trainer may use a potion when its Pokémon is hurt and strongest, and only once per item', () => {
  const t = trainerParty('FALKNER', 'FALKNER1');
  const mon = createMon({ species: 'CHIKORITA', level: 12, dvs: [0xab, 0xcd], id: 1 });
  const b = new Battle({ player: [mon], enemy: t.party, wild: false, random: seeded(3), playerId: 1, state: { money: 0, items: {} },
    trainerInfo: { name: t.name, className: t.className, reward: t.reward, ai: t.ai, items: ['HYPER_POTION'], flags: ['CONTEXT_USE'] } });
  b.enemyIndex = 1;                                          // the level 9 PIDGEOTTO is the highest level of the party
  b.sides[1] = Object.assign(b.sides[1], { mon: b.enemyParty[1] });
  const hurt = () => { b.sides[1].hp = Math.floor(b.sides[1].maxHp * 0.2); };
  const run = () => { const g = b.aiTryItem(); let r = g.next(); while (!r.done) r = g.next(); return r.value; };
  let used = false;
  for (let i = 0; i < 20 && !used; i++) { hurt(); used = run(); }
  assert.equal(used, true);
  assert.deepEqual(b.trainerItems, [null]);
  assert.ok(b.sides[1].hp > Math.floor(b.sides[1].maxHp * 0.2));
  hurt();
  assert.equal(run(), false);
});
