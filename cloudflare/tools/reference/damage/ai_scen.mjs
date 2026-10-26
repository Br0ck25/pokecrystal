// node ai_scen.mjs [count] [seed] > OUT/aiscen.json — random battle situations for ai_probe3.py to poke into a Falkner battle.
import { createMon } from '../../../src/script/mon.js';
import { POKEMON } from '../../../src/generated/pokemon.js';
import { MOVES } from '../../../src/generated/moves.js';
import { TRAINER_CLASSES } from '../../../src/generated/trainer-data.js';
import { BATTLE } from '../../../src/generated/battle-data.js';
import { ITEMS } from '../../../src/generated/items.js';
const AI_ITEMS = ['FULL_RESTORE', 'MAX_POTION', 'HYPER_POTION', 'SUPER_POTION', 'POTION', 'X_ACCURACY', 'FULL_HEAL', 'GUARD_SPEC', 'DIRE_HIT', 'X_ATTACK', 'X_DEFEND', 'X_SPEED', 'X_SPECIAL'];

const count = Number(process.argv[2] ?? 100);
let seed = Number(process.argv[3] ?? 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) / (0x7fffff + 1);
const int = (n) => Math.floor(rnd() * n);
const pick = (a) => a[int(a.length)];
const species = Object.keys(POKEMON).filter((s) => POKEMON[s].id <= 251);
const moves = Object.keys(MOVES).filter((m) => MOVES[m].id <= 251 && m !== 'STRUGGLE');
const classes = Object.keys(TRAINER_CLASSES);
const withAi = classes.filter((c) => TRAINER_CLASSES[c].ai.some((a) => a.startsWith('AI_')));
const fracs = [1, 1, 1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1];
const stageRoll = () => (rnd() < 0.65 ? 7 : Math.max(1, Math.min(13, 7 + int(7) - 3)));
const chance = (p) => rnd() < p;
const statuses = [0, 0, 0, 0, 0, 8, 16, 32, 64, 1, 2, 3, 5];

function mon(level) {
  const sp = pick(species);
  const dvs = [int(256), int(256)];
  const m = createMon({ species: sp, level, dvs, id: 1 });
  const learned = m.moves.slice(0, 4);
  const set = [];
  const n = 1 + int(4);
  for (let i = 0; i < n; i++) set.push(chance(0.4) && learned[i] ? learned[i] : pick(moves));
  const uniq = [...new Set(set)];
  const ids = [...uniq.map((x) => MOVES[x].id), 0, 0, 0, 0].slice(0, 4);
  return {
    species: sp, speciesId: POKEMON[sp].id, level, dvs, moveIds: ids, moveNames: uniq,
    pp: ids.map((id, i) => (id ? (chance(0.1) ? 0 : 5 + int(20)) : 0)),
    types: POKEMON[sp].types.map((t) => BATTLE.types[t]),
    stats: m.stats, hpFrac: pick(fracs), status: pick(statuses),
  };
}
const SUB = [
  [0, 1, 2, 3, 4, 5, 6, 7].map((b) => [b, 0.08]),
  [[0, 0.05]],
  [0, 1, 2, 3, 4, 5, 6, 7].map((b) => [b, 0.06]),
  [[0, 0.1], [1, 0.1], [2, 0.1], [4, 0.15], [5, 0.04], [6, 0.08], [7, 0.15]],
  [[0, 0.12], [3, 0.05], [4, 0.1], [5, 0.12], [6, 0.05], [7, 0.1]],
];
const subBytes = () => SUB.map((bits) => bits.reduce((v, [b, p]) => v | (chance(p) ? 1 << b : 0), 0));

const out = [];
for (let i = 0; i < count; i++) {
  const cls = pick(withAi);
  const enemyLevel = 5 + int(60), playerLevel = 5 + int(60);
  const enemy = mon(enemyLevel), player = mon(playerLevel);
  const otParty = [enemy, ...Array.from({ length: int(3) }, () => mon(5 + int(60)))];
  const partyExtra = Array.from({ length: int(3) }, () => ({ speciesId: POKEMON[pick(species)].id, hpFrac: pick([0, 1, 0.5]) }));
  const used = player.moveIds.filter(Boolean).filter(() => chance(0.5));
  out.push({
    trainerItems: [chance(0.6) ? pick(AI_ITEMS) : null, chance(0.3) ? pick(AI_ITEMS) : null],
    cls, classId: classes.indexOf(cls) + 1, enemy, player, otParty, partyExtra,
    enemyStages: Array.from({ length: 7 }, stageRoll), playerStages: Array.from({ length: 7 }, stageRoll),
    enemySub: subBytes().map((v, i) => v & [~0x40, ~0, ~0x13, ~0x20, ~0][i] & 0xff), playerSub: subBytes(),      // the enemy is never locked in (AIChooseMove would not run)
    enemyScreens: chance(0.3) ? int(64) & 0x3d : 0, playerScreens: chance(0.3) ? int(64) & 0x3d : 0,
    weather: chance(0.35) ? 1 + int(3) : 0, enemyTurns: chance(0.3) ? 0 : 1 + int(5), playerTurns: chance(0.3) ? 0 : 1 + int(5),
    usedMoves: used, lastPlayerMove: used.length ? pick(used) : 0, lastPlayerCounterMove: used.length && chance(0.8) ? pick(used) : 0,
    enemyProtect: chance(0.15) ? 1 + int(2) : 0, playerFury: chance(0.15) ? 1 + int(4) : 0, enemyFury: chance(0.15) ? 1 + int(4) : 0,
    enemyRage: chance(0.1) ? 1 + int(4) : 0, playerWrap: chance(0.1) ? 2 : 0, enemyWrap: chance(0.08) ? 2 : 0,
    enemyToxic: chance(0.15) ? 1 + int(8) : 0, enemyPerish: chance(0.1) ? 1 + int(3) : 0, playerMinimized: chance(0.15) ? 1 : 0, playerRollout: chance(0.1) ? 1 + int(4) : 0,
  });
}
for (const sc of out) sc.trainerItemIds = sc.trainerItems.map((n) => (n ? ITEMS[n].id : 0));
console.log(JSON.stringify(out));
