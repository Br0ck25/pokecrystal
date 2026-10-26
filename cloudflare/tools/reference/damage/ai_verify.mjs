// node ai_verify.mjs OUT [aiobserved3.json] — rebuilds each ROM battle snapshot of ai_probe.py (aiobserved*.json) as a Battle and compares how often
// src/battle/ai/ picks each move with how often the ROM's AIChooseMove did.
import fs from 'node:fs';
import { Battle, battleMon } from '../../../src/battle/battle.js';
import { createMon } from '../../../src/script/mon.js';
import { POKEMON } from '../../../src/generated/pokemon.js';
import { MOVES } from '../../../src/generated/moves.js';
import { TRAINER_CLASSES } from '../../../src/generated/trainer-data.js';
import { ITEMS } from '../../../src/generated/items.js';

const out = process.argv[2];
const observed = JSON.parse(fs.readFileSync(`${out}/${process.argv[3] ?? 'aiobserved.json'}`, 'utf8'));
const speciesById = Object.fromEntries(Object.entries(POKEMON).map(([n, p]) => [p.id, n]));
const moveById = Object.fromEntries(Object.entries(MOVES).map(([n, m]) => [m.id, n]));
const classNames = Object.keys(TRAINER_CLASSES);
const itemById = Object.fromEntries(Object.entries(ITEMS).map(([n, i]) => [i.id, n]));
const mv = (id) => (id ? moveById[id] ?? null : null);
const bits = (byte, names) => Object.fromEntries(Object.entries(names).map(([n, b]) => [n, Boolean(byte & (1 << b))]));
const SUB = [
  { nightmare: 0, curse: 1, protect: 2, identified: 3, perish: 4, endure: 5, rollout: 6, inLove: 7 },
  { curled: 0 },
  { bide: 0, rampage: 1, inLoop: 2, flinched: 3, charged: 4, underground: 5, flying: 6, confused: 7 },
  { xAccuracy: 0, mist: 1, focusEnergy: 2, substitute: 4, recharge: 5, rage: 6, leechSeed: 7 },
  { toxic: 0, transformed: 3, encored: 4, lockOn: 5, destinyBond: 6, cantRun: 7 },
];
const STAGES = ['atk', 'def', 'spd', 'sat', 'sdf', 'acc', 'eva'];

function patch(side, snapMon, snapSide) {
  side.hp = snapMon.HP; side.maxHp = snapMon.MaxHP; side.status = snapMon.Status;
  const [atk, def, spd, sat, sdf] = snapMon.Stats;
  side.stats = { atk, def, spd, sat, sdf };
  const [batk, bdef, bspd, bsat, bsdf] = snapSide.Base;
  side.base = { atk: batk, def: bdef, spd: bspd, sat: bsat, sdf: bsdf };
  side.stages = Object.fromEntries(STAGES.map((k, i) => [k, snapSide.StatLevels[i]]));
  side.screens = bits(snapSide.Screens, { spikes: 0, safeguard: 2, lightScreen: 3, reflect: 4, unused: 5 });
  side.sub = Object.assign({}, ...SUB.map((names, i) => bits(snapSide.Sub[i], names)));
  Object.assign(side, { turnsTaken: snapSide.TurnsTaken, protectCount: snapSide.ProtectCount, furyCutterCount: snapSide.FuryCutterCount, wrapCount: snapSide.WrapCount,
    perishCount: snapSide.PerishCount, disableCount: snapSide.DisableCount, rolloutCount: snapSide.RolloutCount, minimized: Boolean(snapSide.Minimized) });
  side.moves = snapMon.Moves.map(mv).filter(Boolean); side.pp = snapMon.PP.slice(0, side.moves.length);
}

function build(snap, random) {
  const pm = createMon({ species: speciesById[snap.wBattleMon.Species], level: snap.wBattleMon.Level, dvs: snap.wBattleMon.DVs, id: 1 });
  const ot = snap.OTParty.map((o) => {
    const m = createMon({ species: speciesById[o.Species], level: o.Level, dvs: o.DVs, id: 0 });
    m.moves = o.Moves.map(mv).filter(Boolean); m.pp = m.moves.map(() => 20);
    m.stats.hp = o.MaxHP; m.hp = o.HP; m.status = o.Status;
    return m;
  });
  const cls = classNames[snap.TrainerClass - 1];
  const b = new Battle({ player: [pm], enemy: ot, wild: false, random, playerId: 1, state: { money: 0, items: {} }, trainerInfo: { name: 'X', className: cls, reward: 0, ai: TRAINER_CLASSES[cls].ai, flags: TRAINER_CLASSES[cls].flags, items: (snap.TrainerItems ?? []).map((i) => itemById[i]).filter(Boolean) } });
  if (snap.TrainerItems) b.trainerItems = snap.TrainerItems.map((i) => itemById[i] ?? null);
  b.enemyIndex = snap.CurOTMon;
  b.sides[1] = battleMon(ot[snap.CurOTMon]);
  b.sides[0] = battleMon(pm);
  patch(b.sides[0], snap.wBattleMon, snap.Player);
  patch(b.sides[1], snap.wEnemyMon, snap.Enemy);
  const p = b.sides[0], e = b.sides[1];
  p.mon.moves = p.moves; p.mon.pp = p.pp; e.mon.hp = e.hp;
  p.usedMoves = snap.Player.UsedMoves.map(mv).filter(Boolean);
  p.lastMove = mv(snap.LastPlayerMove); p.lastCounterMove = mv(snap.LastPlayerCounterMove);
  e.lastMove = mv(snap.LastEnemyMove); e.lastCounterMove = mv(snap.LastEnemyCounterMove);
  e.toxicCount = snap.Enemy.ToxicCount;
  e.rageCounter = snap.Enemy.RageCounter; e.disabledMove = mv(snap.Enemy.DisabledMove);
  b.weather = snap.Weather;
  b.turn = snap.BattleTurn;
  p.move = { type: snap.PlayerMoveType }; e.move = { type: snap.EnemyMoveType };
  return b;
}

function runAi(b) {
  const g = b.aiSwitchOrTryItem(); let r = g.next();
  while (!r.done) r = g.next(r.value?.ask === 'yesno' ? false : undefined);
}
let seed = 12345;
const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 255;
const N = Number(process.env.N ?? 2000);
let bad = 0;
for (const o of observed) {
  const counts = {};
  const b0 = build(o.snapshot, random);
  const ids = {};
  for (let i = 0; i < N; i++) {
    const b = build(o.snapshot, random);
    b.aiChooseMove();
    const name = b.sides[1].curMove;
    counts[name] = (counts[name] ?? 0) + 1;
    ids[name] = MOVES[name].id;
  }
  const rom = {};
  for (const id of o.picks) rom[moveById[id]] = (rom[moveById[id]] ?? 0) + 1;
  const n = o.picks.length;
  const names = new Set([...Object.keys(counts), ...Object.keys(rom)]);
  const rows = [];
  let ok = true;
  for (const name of names) {
    const p = (counts[name] ?? 0) / N, r = rom[name] ?? 0;
    const tol = 4 * Math.sqrt(n * p * (1 - p)) + 3;
    const within = Math.abs(r - n * p) <= tol;
    if (!within) ok = false;
    rows.push(`${name}: rom ${r}/${n} js ${(p * 100).toFixed(1)}%${within ? '' : '  <-- differs'}`);
  }
  if (o.outcomes) {
    const js = {};
    for (let i = 0; i < N; i++) {
      const b = build(o.snapshot, random);
      const before = [...b.trainerItems];
      runAi(b);
      const used = before.findIndex((x, k) => x !== b.trainerItems[k]);
      const key = b.enemyIndex !== o.snapshot.CurOTMon ? `switch ${b.enemyIndex + 1}` : used >= 0 ? `item ${ITEMS[before[used]].id}` : 'none';
      js[key] = (js[key] ?? 0) + 1;
    }
    const rom2 = {};
    for (const k of o.outcomes) rom2[k] = (rom2[k] ?? 0) + 1;
    for (const key of new Set([...Object.keys(js), ...Object.keys(rom2)])) {
      const p = (js[key] ?? 0) / N, r = rom2[key] ?? 0, n2 = o.outcomes.length;
      const tol = 4 * Math.sqrt(n2 * p * (1 - p)) + 3;
      const within = Math.abs(r - n2 * p) <= tol;
      if (!within) ok = false;
      rows.push(`[${key}] rom ${r}/${n2} js ${(p * 100).toFixed(1)}%${within ? '' : '  <-- differs'}`);
    }
  }
  if (!ok) bad++;
  console.log(`${o.scenario ?? `case ${o.case} turn ${o.turn}`} [${b0.trainerInfo.className} ${b0.sides[1].name} vs ${b0.sides[0].name}] ${ok ? 'ok' : 'MISMATCH'}: ${rows.join('; ')}`);
}
console.log(bad ? `${bad} of ${observed.length} snapshots differ` : `all ${observed.length} snapshots match`);
process.exit(bad ? 1 : 0);
