// AI_Smart (engine/battle/ai/scoring.asm): one handler per move effect, each nudging the score of move slot `i`.
// Handlers are written branch for branch from the asm; `carry`/`nc` conditions are noted where the ROM's flag logic is not obvious.
import { BATTLE } from '../../generated/battle-data.js';
import { hiddenPower } from '../effects.js';
import { checkPlayerMoveTypeMatchups, checkTypeMatchup, findAliveEnemyMons, BASE_AI_SWITCH_SCORE } from './switch.js';

const percent = (n) => Math.floor((n * 255) / 100);
const BASE = 7;
const T = BATTLE.types;
const useful = () => BATTLE.ai.usefulMoves;
const hasType = (side, ...types) => side.types.some((t) => types.includes(t));

/** AICheckLastPlayerMon: true when no other player Pokémon has HP left (the ROM returns z). */
const playerIsLast = (ai) => !ai.battle.party.some((m, i) => i !== ai.battle.party.indexOf(ai.p.mon) && m.hp > 0);


// ---- the shared body of AI_Smart_EvasionUp / AI_Smart_AccuracyDown (they differ in whose HP they read) ------------------------------
function statPressure(ai, i, { hpFull, quarter, half }) {
  const { e, p } = ai;
  const greatly = () => ai.dec(i, 2);
  const notEncouraged = () => {
    if (p.sub.toxic) { if (ai.random() >= percent(31) + 1) ai.dec(i, 2); return; }     // maybe_greatly_encourage: ret c if r < 31% + 1
    if (p.sub.leechSeed) { if (!ai.fiftyFifty()) ai.dec(i); return; }
    if (p.stages.acc < e.stages.eva) { ai.inc(i); return; }
    if (p.furyCutterCount || p.sub.rollout) { greatly(); return; }
    ai.inc(i);
  };
  const mismatch2 = () => { ai.inc(i, 2); notEncouraged(); };
  if (hpFull()) {
    if (p.sub.toxic) { greatly(); return; }
    if (ai.random() >= percent(70)) { notEncouraged(); return; }
    greatly(); return;
  }
  // hp_mismatch_1
  if (!quarter()) { mismatch2(); return; }                                  // nc: HP at or below 25%
  if (ai.random() < percent(4)) { greatly(); return; }
  if (!half()) {                                                            // hp_mismatch_3: HP between 25% and 50%
    if (ai.fiftyFifty()) { notEncouraged(); return; }
    mismatch2(); return;
  }
  if (ai.eightyTwenty()) { greatly(); return; }
  notEncouraged();
}

/** The Counter / Mirror Coat counting: how many of the player's used moves are damaging physical (or special) moves. */
function countUsed(ai, special) {
  let b = 0;
  for (const name of ai.p.usedMoves.slice(0, 4)) {
    const m = ai.move(name);
    if (!m.power) continue;
    if ((m.type >= BATTLE.special) !== special) continue;
    b++;
  }
  return b;
}
function counterLike(ai, i, special) {
  const b = countUsed(ai, special);
  if (b === 0) { ai.inc(i); return; }
  if (b < 3) {
    const last = ai.p.lastCounterMove;
    if (!last) return;
    const m = ai.move(last);
    if (!m.power) return;
    if ((m.type >= BATTLE.special) !== special) return;
  }
  if (!(ai.random() < percent(39) + 1)) ai.dec(i);
}

function weatherMove(ai, i, list) {
  if (!ai.hasMoveIn(list)) { ai.inc(i, 3); return; }
  if (!ai.playerHalfHp()) { ai.inc(i, 3); return; }
  if (!ai.fiftyFifty()) ai.dec(i);
}
function goodWeather(ai, i) {
  if (!ai.playerHalfHp()) return;                                          // ret nc: player at or below 50%
  if (ai.p.turnsTaken === 0 || ai.e.turnsTaken === 0) ai.dec(i, 2);
}

function rollout(ai, i) {
  const { e } = ai;
  const maybeDiscourage = () => { if (!ai.eightyTwenty()) ai.inc(i); };
  if (e.sub.inLove || e.sub.confused || (e.status & (1 << 6))) { maybeDiscourage(); return; }
  if (!ai.enemyQuarterHp()) { maybeDiscourage(); return; }
  if (e.stages.acc < BASE) { maybeDiscourage(); return; }
  if (ai.p.stages.eva >= BASE + 1) { maybeDiscourage(); return; }
  if (!(ai.random() >= percent(79) - 1)) ai.dec(i, 2);
}

export const smartHandlers = {
  EFFECT_SLEEP(ai, i) {
    if (!ai.hasMoveEffect('EFFECT_DREAM_EATER') && !ai.hasMoveEffect('EFFECT_NIGHTMARE')) return;
    if (!ai.fiftyFifty()) ai.dec(i, 2);
  },
  EFFECT_LEECH_HIT(ai, i, m) {
    ai.battle.turn = 1;
    const matchup = ai.matchup(m);
    if (matchup < 10) { if (!(ai.random() < percent(39) + 1)) ai.inc(i); return; }
    if (matchup === 10) return;
    if (ai.enemyMaxHp()) return;
    if (ai.eightyTwenty()) return;
    ai.dec(i);
  },
  EFFECT_LOCK_ON(ai, i) {
    const { e, p } = ai;
    const lowAccuracy = (name) => ai.move(name).accuracy < percent(71) - 1;
    if (p.sub.lockOn) {                                                     // already locked on: discourage, and ease off the inaccurate moves
      for (const [name, j] of e.moves.map((n, j) => [n, j])) { if (!name) break; if (lowAccuracy(name)) ai.dec(j, 2); }
      ai.discourage(i); return;
    }
    const maybeEncourage = () => { if (!ai.fiftyFifty()) ai.dec(i, 2); };
    if (!ai.enemyQuarterHp()) { ai.inc(i); return; }
    if (!ai.enemyHalfHp() && !ai.enemyFaster()) { ai.inc(i); return; }
    if (p.stages.eva >= BASE + 3) { maybeEncourage(); return; }
    if (p.stages.eva >= BASE + 1) return;
    if (e.stages.acc < BASE - 2) { maybeEncourage(); return; }
    if (e.stages.acc < BASE) return;
    for (const name of e.moves) {
      if (!name) break;
      const m = ai.move(name);
      if (m.accuracy >= percent(71) - 1) continue;
      ai.battle.turn = 1;
      if (ai.matchup(m) < 10) continue;
      return;
    }
    ai.inc(i);
  },
  EFFECT_SELFDESTRUCT(ai, i) {
    const discourage = () => ai.inc(i, 3);
    if (findAliveEnemyMons(ai.battle).carry && !playerIsLast(ai)) { discourage(); return; }
    if (ai.enemyHalfHp()) { discourage(); return; }
    if (!ai.enemyQuarterHp()) return;
    if (ai.random() < percent(8)) return;
    discourage();
  },
  EFFECT_DREAM_EATER(ai, i) { if (!(ai.random() < percent(10))) ai.dec(i, 3); },
  EFFECT_EVASION_UP(ai, i) {
    if (ai.e.stages.eva >= 13) { ai.discourage(i); return; }
    statPressure(ai, i, { hpFull: () => ai.enemyMaxHp(), quarter: () => ai.enemyQuarterHp(), half: () => ai.enemyHalfHp() });
  },
  EFFECT_ALWAYS_HIT(ai, i) {
    if (!(ai.e.stages.acc < BASE - 2) && ai.p.stages.eva < BASE + 3) return;
    if (!ai.eightyTwenty()) ai.dec(i, 2);
  },
  EFFECT_MIRROR_MOVE(ai, i) {
    const last = ai.p.lastCounterMove;
    if (!last) { if (ai.enemyFaster()) ai.discourage(i); return; }
    if (!useful().includes(last)) return;
    if (ai.fiftyFifty()) return;
    ai.dec(i);
    if (!ai.enemyFaster()) return;
    if (ai.random() < percent(10)) return;
    ai.dec(i);
  },
  EFFECT_ACCURACY_DOWN(ai, i) {
    // The ROM tests the player's HP being full *and* the enemy's HP above half before the 70% roll.
    const fullAndHealthy = () => ai.playerMaxHp() && ai.enemyHalfHp();
    statPressure(ai, i, { hpFull: fullAndHealthy, quarter: () => ai.playerQuarterHp(), half: () => ai.playerHalfHp() });
  },
  EFFECT_RESET_STATS(ai, i) {
    const { e, p } = ai;
    const keys = ['atk', 'def', 'spd', 'sat', 'sdf', 'acc', 'eva'];
    const encourage = keys.some((k) => e.stages[k] < BASE - 2) || keys.some((k) => p.stages[k] >= BASE + 3);
    if (!encourage) { ai.inc(i); return; }
    if (!(ai.random() < percent(16))) ai.dec(i);
  },
  EFFECT_BIDE(ai, i) {
    if (ai.enemyMaxHp()) return;
    if (ai.random() < percent(10)) return;
    ai.inc(i);
  },
  EFFECT_FORCE_SWITCH(ai, i) {
    checkPlayerMoveTypeMatchups(ai.battle);
    if (ai.battle.aiSwitchScore < BASE_AI_SWITCH_SCORE) return;
    ai.inc(i);
  },
  EFFECT_HEAL: heal, EFFECT_MORNING_SUN: heal, EFFECT_SYNTHESIS: heal, EFFECT_MOONLIGHT: heal,
  EFFECT_TOXIC: playerHealthy, EFFECT_LEECH_SEED: playerHealthy,
  EFFECT_LIGHT_SCREEN: screen, EFFECT_REFLECT: screen,
  EFFECT_OHKO(ai, i) {
    if (ai.e.level < ai.p.level) { ai.discourage(i); return; }
    if (ai.playerHalfHp()) return;
    ai.inc(i);
  },
  EFFECT_TRAP_TARGET(ai, i) {
    const { p } = ai;
    const discourage = () => { if (!ai.fiftyFifty()) ai.inc(i); };
    const encourage = () => { if (!ai.enemyQuarterHp()) return; if (!ai.fiftyFifty()) ai.dec(i, 2); };
    if (p.wrapCount) { discourage(); return; }
    if (p.sub.toxic) { encourage(); return; }
    if (p.sub.inLove || p.sub.rollout || p.sub.identified || p.sub.nightmare) { encourage(); return; }
    if (p.turnsTaken === 0) { encourage(); return; }
    discourage();
  },
  EFFECT_RAZOR_WIND: razorWind, EFFECT_UNUSED_2B: razorWind,
  EFFECT_CONFUSE(ai, i) {
    if (ai.playerHalfHp()) return;
    if (!(ai.random() < percent(10))) ai.inc(i);
    if (ai.playerQuarterHp()) return;
    ai.inc(i);
  },
  EFFECT_SP_DEF_UP_2(ai, i) {
    const { e, p } = ai;
    if (!ai.enemyHalfHp()) { ai.inc(i); return; }
    if (e.stages.sdf >= BASE + 4) { ai.inc(i); return; }
    if (e.stages.sdf >= BASE + 2) return;
    if (!(p.types[0] >= BATTLE.special) && !(p.types[1] >= BATTLE.special)) return;
    if (ai.eightyTwenty()) return;
    ai.dec(i, 2);
  },
  EFFECT_FLY(ai, i) {
    if (!(ai.p.sub.flying || ai.p.sub.underground)) return;
    if (!ai.enemyFaster()) return;
    ai.dec(i, 3);
  },
  EFFECT_SUPER_FANG(ai, i) { if (!ai.playerQuarterHp()) ai.inc(i); },
  EFFECT_PARALYZE(ai, i) {
    if (!ai.playerQuarterHp()) { if (!ai.fiftyFifty()) ai.inc(i); return; }
    if (ai.enemyFaster()) return;
    if (!ai.enemyQuarterHp()) return;
    if (ai.eightyTwenty()) return;
    ai.dec(i, 2);
  },
  EFFECT_SPEED_DOWN_HIT(ai, i, m) {
    if (m.name !== 'ICY_WIND') return;
    if (!ai.enemyQuarterHp()) return;
    if (ai.p.turnsTaken !== 0) return;
    if (ai.enemyFaster()) return;
    if (ai.random() < percent(12)) return;
    ai.dec(i, 2);
  },
  EFFECT_SUBSTITUTE(ai, i) { if (!ai.enemyHalfHp()) ai.discourage(i); },
  EFFECT_HYPER_BEAM(ai, i) {
    if (ai.enemyHalfHp()) {
      if (ai.random() < percent(16)) return;
      ai.inc(i);
      if (!ai.fiftyFifty()) ai.inc(i);
      return;
    }
    if (ai.enemyQuarterHp()) return;
    if (!ai.fiftyFifty()) ai.dec(i);
  },
  EFFECT_RAGE(ai, i) {
    const { e } = ai;
    if (e.sub.rage) {
      if (!ai.fiftyFifty()) ai.dec(i);
      if ((e.rageCounter ?? 0) < 2) return;
      ai.dec(i);
      if ((e.rageCounter ?? 0) < 3) return;
      ai.dec(i);
      return;
    }
    if (!ai.enemyHalfHp()) { ai.inc(i); return; }
    if (ai.eightyTwenty()) ai.dec(i);
  },
  EFFECT_MIMIC(ai, i) {
    const last = ai.p.lastCounterMove;
    if (!last) { if (ai.enemyFaster()) ai.discourage(i); else ai.inc(i); return; }
    if (!ai.enemyHalfHp()) { ai.inc(i); return; }
    const m = ai.move(last);
    ai.battle.turn = 1;
    const matchup = ai.matchup(m);
    if (matchup < 10) { ai.inc(i); return; }
    if (matchup > 10 && !ai.fiftyFifty()) ai.dec(i);
    if (!useful().includes(last)) return;
    if (ai.fiftyFifty()) return;
    ai.dec(i);
  },
  EFFECT_COUNTER(ai, i) { counterLike(ai, i, false); },
  EFFECT_MIRROR_COAT(ai, i) { counterLike(ai, i, true); },
  EFFECT_ENCORE(ai, i) {
    const { e, p } = ai;
    const encourage = () => { if (ai.random() < percent(28) - 1) return; ai.dec(i, 2); };
    if (!ai.enemyFaster()) { ai.inc(i, 3); return; }
    if (!p.lastMove) { ai.discourage(i); return; }
    const m = ai.move(p.lastMove);
    if (m.power) {
      const matchup = checkTypeMatchup(ai.battle, e.types);                   // the move type read is the loaded one of hBattleTurn
      if (matchup < 10) { if (matchup !== 0) return; encourage(); return; }
    }
    if (!BATTLE.ai.encoreMoves.includes(p.lastCounterMove)) { ai.inc(i, 3); return; }
    encourage();
  },
  EFFECT_PAIN_SPLIT(ai, i) { if (ai.p.hp < ai.e.hp * 2) ai.inc(i); },
  EFFECT_SNORE: snore, EFFECT_SLEEP_TALK: snore,
  EFFECT_DEFROST_OPPONENT(ai, i) { if (ai.e.status & (1 << 5)) ai.dec(i, 3); },
  EFFECT_SPITE(ai, i) {
    const { p } = ai;
    const last = p.lastCounterMove;
    if (!last) {
      if (ai.enemyFaster()) { ai.discourage(i); return; }
      if (!ai.fiftyFifty()) ai.inc(i);
      return;
    }
    const slot = p.moves.indexOf(last);
    if (slot < 0) return;
    const pp = p.pp[slot];
    if (pp < 6) { if (!(ai.random() < percent(39) + 1)) ai.dec(i, 2); return; }
    if (pp >= 15) { ai.inc(i); return; }
    if (ai.random() < percent(39) + 1) ai.inc(i);
  },
  EFFECT_DESTINY_BOND: lowHpOnly, EFFECT_REVERSAL: lowHpOnly, EFFECT_SKULL_BASH: lowHpOnly,
  EFFECT_HEAL_BELL(ai, i) {
    const { battle, e } = ai;
    let status = 0;
    battle.enemyParty.forEach((mon, j) => { if (battle.enemyHp(j) > 0) status |= (j === battle.enemyIndex ? e.status : mon.status) ?? 0; });
    if (!status) { if (e.status === 0) ai.discourage(i); return; }
    if (e.status !== 0) ai.dec(i);
    if (!(e.status & ((1 << 5) | 7))) return;
    if (!ai.fiftyFifty()) ai.dec(i, 2);
  },
  EFFECT_PRIORITY_HIT(ai, i, m) {
    if (ai.enemyFaster()) return;
    if (ai.p.sub.flying || ai.p.sub.underground) { ai.discourage(i); return; }
    ai.battle.turn = 1;
    if (ai.damage(m) > ai.p.hp) ai.dec(i, 3);
  },
  EFFECT_THIEF(ai, i) { ai.inc(i, 0x1e); },
  EFFECT_CONVERSION2(ai, i) {
    if (ai.p.lastMove) { if (!(ai.random() < percent(10))) ai.inc(i); return; }
    ai.battle.unported.add('AI_Smart_Conversion2 on the first turn (reads past the move table)');
  },
  EFFECT_DISABLE(ai, i, m) {
    const discourage = () => { if (!(ai.random() < percent(8))) ai.inc(i); };
    if (!ai.enemyFaster()) { discourage(); return; }
    if (useful().includes(ai.p.lastCounterMove)) { if (!(ai.random() < percent(39) + 1)) ai.dec(i); return; }
    if (m.power) return;
    discourage();
  },
  EFFECT_MEAN_LOOK(ai, i) {
    const { e, p } = ai;
    const encourage = () => { if (!ai.eightyTwenty()) ai.dec(i, 3); };
    if (!ai.enemyHalfHp()) { ai.inc(i); return; }
    if (playerIsLast(ai)) { ai.discourage(i); return; }
    if (e.sub.toxic) { encourage(); return; }                                // BUG kept: it reads the enemy's own badly poisoned flag
    if (p.sub.inLove || p.sub.rollout || p.sub.identified || p.sub.nightmare) { encourage(); return; }
    checkPlayerMoveTypeMatchups(ai.battle);
    if (ai.battle.aiSwitchScore >= BASE_AI_SWITCH_SCORE + 1) return;
    ai.inc(i);
  },
  EFFECT_NIGHTMARE(ai, i) { if (!ai.fiftyFifty()) ai.dec(i); },
  EFFECT_FLAME_WHEEL(ai, i) { if (ai.e.status & (1 << 5)) ai.dec(i, 5); },
  EFFECT_CURSE(ai, i) {
    const { e, p } = ai;
    const highly = () => ai.inc(i, 4);
    const greatly = () => ai.inc(i, 2);
    if (!hasType(e, T.GHOST)) {
      if (!ai.enemyHalfHp()) { ai.inc(i); return; }
      if (e.stages.atk >= BASE + 4) { ai.inc(i); return; }
      if (e.stages.atk >= BASE + 2) return;
      if (p.types[0] === T.GHOST) { greatly(); return; }
      if (p.types[0] >= BATTLE.special) return;
      if (p.types[1] >= BATTLE.special) return;
      if (ai.eightyTwenty()) return;
      ai.dec(i, 2);
      return;
    }
    if (p.sub.curse) { ai.discourage(i); return; }
    const maybeGreatlyEncourage = () => { if (!ai.fiftyFifty()) ai.dec(i, 2); };
    if (findAliveEnemyMons(ai.battle).carry) { if (!playerIsLast(ai)) { highly(); return; } }
    else if (playerIsLast(ai)) { maybeGreatlyEncourage(); return; }
    if (!ai.enemyQuarterHp()) { highly(); return; }
    if (!ai.enemyHalfHp()) { greatly(); return; }
    if (!ai.enemyMaxHp()) return;
    if (p.turnsTaken !== 0) return;
    maybeGreatlyEncourage();
  },
  EFFECT_PROTECT(ai, i) {
    const { e, p } = ai;
    const discourage = () => { if (!(ai.random() < percent(8))) ai.inc(i, 2); };
    const encourage = () => { if (!ai.eightyTwenty()) ai.dec(i); };
    if (e.protectCount) { ai.inc(i); discourage(); return; }
    if (p.sub.lockOn) { discourage(); return; }
    if ((p.furyCutterCount ?? 0) >= 3) { encourage(); return; }
    if (p.sub.charged || p.sub.toxic || p.sub.leechSeed || p.sub.curse) { encourage(); return; }
    if (!p.sub.rollout) { discourage(); return; }
    if ((p.rolloutCount ?? 0) < 3) { discourage(); return; }
    encourage();
  },
  EFFECT_FORESIGHT(ai, i) {
    const { e, p } = ai;
    if (e.stages.acc < BASE - 2 || p.stages.eva >= BASE + 3 || hasType(p, T.GHOST)) { if (!(ai.random() < percent(39) + 1)) ai.dec(i, 2); return; }
    if (!(ai.random() < percent(8))) ai.inc(i);
  },
  EFFECT_PERISH_SONG(ai, i) {
    if (findAliveEnemyMons(ai.battle).carry) { ai.inc(i, 5); return; }
    if (ai.p.sub.cantRun) { if (!ai.fiftyFifty()) ai.dec(i); return; }
    checkPlayerMoveTypeMatchups(ai.battle);
    if (ai.battle.aiSwitchScore < BASE_AI_SWITCH_SCORE) return;
    if (!ai.fiftyFifty()) ai.inc(i);
  },
  EFFECT_SANDSTORM(ai, i) {
    if (hasType(ai.p, T.ROCK, T.GROUND, T.STEEL)) { ai.inc(i, 2); return; }
    if (!ai.playerHalfHp()) { ai.inc(i); return; }
    if (!ai.fiftyFifty()) ai.dec(i);
  },
  EFFECT_ENDURE(ai, i) {
    const { e } = ai;
    if (e.protectCount) { ai.inc(i, 2); return; }
    if (ai.enemyMaxHp()) { ai.inc(i, 2); return; }
    if (ai.enemyQuarterHp()) { ai.inc(i); return; }
    if (ai.hasMoveEffect('EFFECT_REVERSAL')) { if (!ai.eightyTwenty()) ai.dec(i, 3); return; }
    if (!e.sub.lockOn) return;
    if (!ai.fiftyFifty()) ai.dec(i, 2);
  },
  EFFECT_ROLLOUT: rollout,
  EFFECT_FURY_CUTTER(ai, i) {
    const n = ai.e.furyCutterCount ?? 0;
    if (n) {
      ai.dec(i);
      if (n >= 2) { ai.dec(i, 2); if (n >= 3) ai.dec(i, 3); }
    }
    rollout(ai, i);
  },
  EFFECT_SWAGGER: swagger, EFFECT_ATTRACT: swagger,
  EFFECT_SAFEGUARD(ai, i) {
    if (ai.playerHalfHp()) return;
    if (ai.eightyTwenty()) return;
    ai.inc(i);
  },
  EFFECT_MAGNITUDE: earthquake, EFFECT_EARTHQUAKE: earthquake,
  EFFECT_BATON_PASS(ai, i) {
    checkPlayerMoveTypeMatchups(ai.battle);
    if (ai.battle.aiSwitchScore < BASE_AI_SWITCH_SCORE) return;
    ai.inc(i);
  },
  EFFECT_PURSUIT(ai, i) {
    if (!ai.playerQuarterHp()) { if (!ai.fiftyFifty()) ai.dec(i, 2); return; }
    if (!ai.eightyTwenty()) ai.inc(i);
  },
  EFFECT_RAPID_SPIN(ai, i) {
    const { e } = ai;
    if (!e.wrapCount && !e.sub.leechSeed && !e.screens.spikes) return;
    if (!ai.eightyTwenty()) ai.dec(i, 2);
  },
  EFFECT_HIDDEN_POWER(ai, i) {
    ai.battle.turn = 1;
    const { power, type } = hiddenPower(ai.e.mon.dvs);
    const matchup = ai.matchup({ type });
    if (matchup < 10 || power < 50) { ai.inc(i); return; }
    if (matchup < 11 && power < 70) return;
    ai.dec(i);
  },
  EFFECT_RAIN_DANCE(ai, i) {
    const { p } = ai;
    for (const t of p.types) {
      if (t === T.WATER) { ai.inc(i, 3); return; }
      if (t === T.FIRE) { goodWeather(ai, i); return; }
    }
    weatherMove(ai, i, BATTLE.ai.rainDanceMoves);
  },
  EFFECT_SUNNY_DAY(ai, i) {
    const { p } = ai;
    for (const t of p.types) {
      if (t === T.FIRE) { ai.inc(i, 3); return; }
      if (t === T.WATER) { goodWeather(ai, i); return; }
    }
    weatherMove(ai, i, BATTLE.ai.sunnyDayMoves);
  },
  EFFECT_BELLY_DRUM(ai, i) {
    if (ai.e.stages.atk < BASE + 3) {
      if (ai.enemyMaxHp()) return;
      ai.inc(i);
      if (ai.enemyHalfHp()) return;
    }
    ai.inc(i, 5);
  },
  EFFECT_PSYCH_UP(ai, i) {
    const { e, p } = ai;
    const total = (s) => ['atk', 'def', 'spd', 'sat', 'sdf', 'acc', 'eva'].reduce((n, k) => (n + (s.stages[k] - BASE) + 256) & 0xff, 100);
    if (total(e) >= total(p)) { ai.inc(i, 2); return; }
    if (p.stages.acc < BASE - 1) return;
    if (e.stages.eva >= BASE + 1) return;
    if (!ai.eightyTwenty()) ai.dec(i);
  },
  EFFECT_TWISTER: gust, EFFECT_GUST: gust,
  EFFECT_FUTURE_SIGHT(ai, i) {
    if (!ai.enemyFaster()) return;
    if (!(ai.p.sub.flying || ai.p.sub.underground)) return;
    ai.dec(i, 2);
  },
  EFFECT_STOMP(ai, i) {
    if (!ai.p.minimized) return;
    if (!ai.eightyTwenty()) ai.dec(i);
  },
  EFFECT_SOLARBEAM(ai, i) {
    if (ai.battle.weather === 2) { if (!ai.eightyTwenty()) ai.dec(i, 2); return; }
    if (ai.battle.weather !== 1) return;
    if (ai.random() < percent(10)) return;
    ai.inc(i, 2);
  },
  EFFECT_THUNDER(ai, i) {
    if (ai.battle.weather !== 2) return;
    if (ai.random() < percent(10)) return;
    ai.inc(i);
  },
};

function heal(ai, i) {
  if (!ai.enemyQuarterHp()) { if (!(ai.random() < percent(10))) ai.dec(i, 2); return; }
  if (!ai.enemyHalfHp()) return;
  ai.inc(i);
}
function playerHealthy(ai, i) { if (!ai.playerHalfHp()) ai.inc(i); }
function screen(ai, i) {
  if (ai.enemyMaxHp()) return;
  if (ai.random() < percent(8)) return;
  ai.inc(i);
}
function razorWind(ai, i) {
  const { e, p } = ai;
  if (e.sub.perish && (e.perishCount ?? 0) < 3) { ai.inc(i); return; }
  for (const name of p.usedMoves.slice(0, 4)) {
    if (ai.move(name).effect === 'EFFECT_PROTECT') { ai.inc(i, 6); return; }
  }
  if (!e.sub.confused && ai.enemyHalfHp()) return;
  if (ai.random() < percent(79) - 1) return;
  ai.inc(i);
}
function snore(ai, i) { if ((ai.e.status & 7) === 1) ai.inc(i, 3); else ai.dec(i, 3); }
function lowHpOnly(ai, i) { if (ai.enemyQuarterHp()) ai.inc(i); }
function swagger(ai, i) {
  if (ai.p.turnsTaken === 0) { if (ai.random() < percent(79) - 1) ai.dec(i); return; }
  if (!ai.eightyTwenty()) ai.inc(i);
}
function earthquake(ai, i) {
  if (ai.p.lastCounterMove !== 'DIG') return;
  if (ai.p.sub.underground) { if (ai.enemyFaster()) ai.dec(i, 2); return; }
  if (ai.enemyFaster()) return;
  if (!ai.fiftyFifty()) ai.dec(i);
}
function gust(ai, i) {
  if (ai.p.lastCounterMove !== 'FLY') return;
  if (ai.p.sub.flying) { if (ai.enemyFaster()) ai.dec(i, 2); return; }
  if (ai.enemyFaster()) return;
  if (!ai.fiftyFifty()) ai.dec(i);
}
