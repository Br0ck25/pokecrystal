// A Pokémon as the party stores it (wPartyMon struct, engine/pokemon/move_mon.asm GeneratePartyMonStats, CalcMonStats,
// FillMoves, FillPP and engine/pokemon/experience.asm CalcExpAtLevel).
import { POKEMON } from '../generated/pokemon.js';
import { EVOS_ATTACKS, GROWTH_RATES } from '../generated/learnsets.js';
import { MOVES } from '../generated/moves.js';

export const BASE_HAPPINESS = 70;
const GROWTH_INDEX = { GROWTH_MEDIUM_FAST: 0, GROWTH_SLIGHTLY_FAST: 1, GROWTH_SLIGHTLY_SLOW: 2, GROWTH_MEDIUM_SLOW: 3, GROWTH_FAST: 4, GROWTH_SLOW: 5 };
const MAX_STAT = 999, STAT_MIN_NORMAL = 5, STAT_MIN_HP = 10;

/** (a/b)n^3 + c n^2 + d n - e, with the cubic term truncated first, as the 24-bit arithmetic does. */
export function expAtLevel(species, level) {
  const [a, b, c, d, e] = GROWTH_RATES[GROWTH_INDEX[POKEMON[species].growth]];
  return (Math.floor((a * level ** 3) / b) + c * level ** 2 + d * level - e) & 0xffffff;
}

const sqrtCeil = (n) => { let r = 0; while (r * r < n) r++; return r; };

/** CalcMonStatC: the stat for one of hp, atk, def, spd, sat, sdf; statExp is the mon's stat experience for it (0 for a new one). */
export function calcStat(species, stat, level, dvs, statExp = 0) {
  const base = POKEMON[species].stats[stat];
  const atk = dvs[0] >> 4, def = dvs[0] & 15, spd = dvs[1] >> 4, spc = dvs[1] & 15;
  const dv = { hp: ((atk & 1) << 3) | ((def & 1) << 2) | ((spd & 1) << 1) | (spc & 1), atk, def, spd, sat: spc, sdf: spc }[stat];
  const value = Math.floor((((base + dv) * 2 + (sqrtCeil(statExp) >> 2)) * level) / 100) + (stat === 'hp' ? level + STAT_MIN_HP : STAT_MIN_NORMAL);
  return Math.min(value, MAX_STAT);
}

/** FillMoves: the moves of the learnset up to `level`; when all four slots are taken the oldest drops out. */
export function movesAtLevel(species, level) {
  const moves = [];
  for (const [at, move] of EVOS_ATTACKS[species].learnset) {
    if (at > level) break;
    if (moves.includes(move)) continue;
    if (moves.length === 4) moves.shift();
    moves.push(move);
  }
  return moves;
}

export function createMon({ species, level, dvs, id, item = null }) {
  const moves = movesAtLevel(species, level);
  const stats = Object.fromEntries(['hp', 'atk', 'def', 'spd', 'sat', 'sdf'].map((s) => [s, calcStat(species, s, level, dvs)]));
  return {
    species, level, item, dvs, id, moves, pp: moves.map((m) => MOVES[m].pp), exp: expAtLevel(species, level), statExp: { hp: 0, atk: 0, def: 0, spd: 0, spc: 0 },
    happiness: BASE_HAPPINESS, status: 0, hp: stats.hp, stats,
  };
}
