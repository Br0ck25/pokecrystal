// engine/battle/ai/switch.asm: scoring a switch from the moves the player has used and the enemy's party.
// Party sets are bit masks, slot 0 = bit 5 (the ROM's b starts at 1 << (PARTY_LENGTH - 1)); battle.aiSwitchScore is wEnemyAISwitchScore.
// The ROM's CheckTypeMatchup reads the move type from the current turn's move struct, not from the move the caller looked up
// (docs/bugs_and_glitches.md); checkTypeMatchup does the same, so these scores depend on whatever move struct is loaded.
import { BATTLE } from '../../generated/battle-data.js';
import { MOVES } from '../../generated/moves.js';
import { POKEMON } from '../../generated/pokemon.js';

export const BASE_AI_SWITCH_SCORE = 10;
const EFFECTIVE = 10;
const bit = (slot) => 0x20 >> slot;
const typesOf = (species) => POKEMON[species].types.map((t) => BATTLE.types[t]);
const slotOfMask = (mask) => { let i = 0; while (!(mask & (0x20 >> i))) i++; return i; };   // the ROM's "sla b; sla b; c = -1; inc c; sla b" scan

/** CheckTypeMatchup: the chart multiplier of the move type currently loaded for hBattleTurn against these defender types. */
export function checkTypeMatchup(battle, defenderTypes) {
  const moveType = battle.sides[battle.turn].move?.type ?? 0;
  return battle.typeMatchupOf(moveType, { types: defenderTypes, sub: { identified: battle.sides[1 - battle.turn].sub.identified } });
}

/** FindAliveEnemyMons: { carry: true } when the active Pokémon is the only one left, else { carry: false, c: mask of the others alive }. */
export function findAliveEnemyMons(battle) {
  if (battle.enemyParty.length < 2) return { carry: true };
  let c = 0;
  battle.enemyParty.forEach((_, i) => { if (i !== battle.enemyIndex && battle.enemyHp(i) > 0) c |= bit(i); });
  return c ? { carry: false, c } : { carry: true };
}

/** CheckPlayerMoveTypeMatchups: how the moves the player has used fare against the enemy; the result is battle.aiSwitchScore. */
export function checkPlayerMoveTypeMatchups(battle) {
  const [p, e] = battle.sides;
  let score = BASE_AI_SWITCH_SCORE;
  const decrease = () => { score = (score - 1) & 0xff; };
  const increase = () => { score = (score + 1) & 0xff; };
  if (p.usedMoves.length === 0) {                              // .unknown_moves
    if (checkTypeMatchup(battle, e.types) >= EFFECTIVE + 1) decrease();
    if (p.types[1] !== p.types[0] && checkTypeMatchup(battle, e.types) >= EFFECTIVE + 1) decrease();
  } else {
    let r = 0;                                                 // e: 1 not very effective, 2 neutral
    let done = false;
    for (const name of p.usedMoves.slice(0, 4)) {
      if (!MOVES[name].power) continue;
      const m = checkTypeMatchup(battle, e.types);
      if (m >= EFFECTIVE + 1) { decrease(); done = true; break; }
      if (m === 0) continue;
      if (m >= EFFECTIVE) { r = 2; continue; }
      if (r < 1) r = 1;
    }
    if (!done && r !== 2) { increase(); if (r === 0) increase(); }
  }
  // .CheckEnemyMoveMatchups
  let c = 0;
  for (const name of e.moves) {
    if (!name) break;
    if (!MOVES[name].power) continue;
    const m = checkTypeMatchup(battle, p.types);
    if (m === 0) continue;
    c++;
    if (m < EFFECTIVE) continue;
    c += 5;
    if (m === EFFECTIVE) continue;
    c = 100;
  }
  if (c === 0) { decrease(); decrease(); }
  else if (c < 5) decrease();
  else if (c >= 100) increase();
  battle.aiSwitchScore = score;
}

/** FindEnemyMonsImmuneToLastCounterMove: battle.aiSwitchScore = mask of the other Pokémon immune to the player's last move. */
export function findEnemyMonsImmuneToLastCounterMove(battle) {
  let score = 0;
  const last = battle.sides[0].lastCounterMove;
  battle.enemyParty.forEach((mon, i) => {
    if (i === battle.enemyIndex || battle.enemyHp(i) === 0) return;
    if (!last || !MOVES[last].power) return;
    if (checkTypeMatchup(battle, typesOf(mon.species)) !== 0) return;
    score |= bit(i);
  });
  battle.aiSwitchScore = score;
}

/**
 * FindEnemyMonsWithASuperEffectiveMove (c = candidate mask): sets battle.aiSwitchScore to the first Pokémon's slot with a super effective
 * move (or the first with a neutral one, or 0xff) and returns the registers the callers read. `e` is not reset between Pokémon, as in the ROM.
 */
export function findEnemyMonsWithASuperEffectiveMove(battle, c) {
  battle.aiSwitchScore = 0xff;
  let d = 0, e = 0;
  const player = battle.sides[0];
  let found = null;
  for (let slot = 0; slot < 6; slot++) {
    const b = bit(slot);
    if (b & c) {
      for (const name of battle.enemyParty[slot]?.moves ?? []) {
        if (!name) break;
        if (!MOVES[name].power) continue;
        const m = checkTypeMatchup(battle, player.types);
        if (m < EFFECTIVE) continue;
        e = 1;
        if (m < EFFECTIVE + 1) continue;
        e = 2;
        break;
      }
      if (e === 2) { found = b; break; }
      if (e === 1) d |= b;
    }
  }
  if (found === null) {
    if (d === 0) return { e, c };
    found = d;
  }
  battle.aiSwitchScore = slotOfMask(found);
  return { e, c, b: found };
}

/** FindAliveEnemyMonsWithASuperEffectiveMove: the above over the Pokémon with HP left (the active one included), within c. */
export function findAliveEnemyMonsWithASuperEffectiveMove(battle, c) {
  let alive = 0;
  battle.enemyParty.forEach((_, i) => { if (battle.enemyHp(i) > 0) alive |= bit(i); });
  return findEnemyMonsWithASuperEffectiveMove(battle, alive & c);
}

/** FindEnemyMonsThatResistPlayer: the Pokémon (within c) that take at most neutral damage from the loaded move type. */
export function findEnemyMonsThatResistPlayer(battle, c) {
  let mask = 0;
  battle.enemyParty.forEach((mon, i) => {
    if (checkTypeMatchup(battle, typesOf(mon.species)) < EFFECTIVE + 1) mask |= bit(i);
  });
  return mask & c;
}

/** FindEnemyMonsWithAtLeastQuarterMaxHP: the ROM's "HP * 4" is two rotations of the 16-bit HP, which only approximates it. */
export function findEnemyMonsWithAtLeastQuarterMaxHP(battle, c) {
  let mask = 0;
  const rotate = (v) => { const b = (((v >> 8) << 1) | (v & 1)) & 0xff, lo = (v & 0xff) >> 1; return (b << 8) | lo; };
  battle.enemyParty.forEach((mon, i) => {
    if (mon.stats.hp < rotate(rotate(battle.enemyHp(i)))) mask |= bit(i);
  });
  return mask & c;
}
