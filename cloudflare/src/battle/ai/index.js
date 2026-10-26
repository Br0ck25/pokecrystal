// The trainer AI's move choice: engine/battle/ai/move.asm (AIChooseMove) and the scoring layers of scoring.asm.
// Scores are bytes in wEnemyAIMoveScores (lower is better); every layer nudges them with the same inc/dec the ROM does.
import { BATTLE } from '../../generated/battle-data.js';
import { MOVES } from '../../generated/moves.js';
import { rawAccuracy } from '../accuracy.js';
import { damageStats, damageCalc, stab } from '../damage.js';
import { monGender } from '../../script/gender.js';
import { smartHandlers } from './smart.js';

const percent = (n) => Math.floor((n * 255) / 100);
const EFFECT = Object.fromEntries(BATTLE.effectOrder.map((name, i) => [name, i]));
export const effectNumber = (name) => EFFECT[name];
const LAYERS = ['AI_BASIC', 'AI_SETUP', 'AI_TYPES', 'AI_OFFENSIVE', 'AI_SMART', 'AI_OPPORTUNIST', 'AI_AGGRESSIVE', 'AI_CAUTIOUS', 'AI_STATUS', 'AI_RISKY'];

/** What the AI reads: the enemy side e, the player side p, and the move being scored. */
export class AIContext {
  constructor(battle) {
    this.battle = battle;
    this.e = battle.sides[1];
    this.p = battle.sides[0];
    this.scores = [20, 20, 20, 20];
  }
  random() { return this.battle.random(); }
  /** AIGetEnemyMove: the move struct of move `name`. */
  move(name) {
    const m = MOVES[name];
    const struct = { name, effect: m.effect, power: m.power, type: BATTLE.types[m.type], accuracy: rawAccuracy(m.accuracy), chance: percent(m.chance), pp: m.pp };
    this.e.move = struct;                                // wEnemyMoveStruct is the scratch the AI loads each move into
    return struct;
  }
  effectIs(m, name) { return m.effect === name; }
  /** AI_50_50 / AI_80_20: true is the carry, i.e. "skip". */
  fiftyFifty() { return this.random() < percent(50) + 1; }
  eightyTwenty() { return this.random() < percent(20) - 1; }
  discourage(i) { this.scores[i] = (this.scores[i] + 10) & 0xff; }
  inc(i, n = 1) { this.scores[i] = (this.scores[i] + n) & 0xff; }
  dec(i, n = 1) { this.scores[i] = (this.scores[i] - n) & 0xff; }
  /** BattleCheckTypeMatchup with the enemy as the user: the chart multiplier of `m` against the player. */
  matchup(m) { return this.battle.typeMatchupOf(m.type, this.p); }
  /** AIDamageCalc: the damage the enemy's move would do now (constant-damage moves by their own rule). */
  damage(m) {
    const b = this.battle, e = this.e, p = this.p;
    if (BATTLE.ai.constantDamageEffects.includes(m.effect)) {            // BattleCommand_ConstantDamage with the enemy as the user
      if (m.effect === 'EFFECT_LEVEL_DAMAGE') return e.level;
      if (m.effect === 'EFFECT_SUPER_FANG') return Math.max(1, p.hp >> 1);
      if (m.effect === 'EFFECT_PSYWAVE') { const max = e.level + (e.level >> 1); let d; do d = this.random(); while (d === 0 || d >= max); return d; }
      return m.power;
    }
    const special = m.type >= BATTLE.special;
    const stats = damageStats(
      { species: e.species, item: e.item, level: e.level, stats: e.stats, base: e.base, stages: e.stages },
      { species: p.species, item: p.item, stats: p.stats, base: p.base, stages: p.stages, screens: p.screens },
      { special, critical: false });
    let damage = damageCalc({ power: m.power, level: stats.level, attack: stats.attack, defense: stats.defense, effect: m.effect, moveType: m.type, userItem: e.item, critical: false });
    damage = stab({ damage, moveType: m.type, moveEffect: m.effect, user: { types: e.types }, target: { types: p.types, identified: p.sub.identified }, weather: b.weather, isPlayer: false, badges: b.badges }).damage;
    return damage;
  }
  // HP checks (AICheck*HP: carry when the condition holds)
  enemyMaxHp() { return this.e.hp === this.e.maxHp; }
  playerMaxHp() { return this.p.hp === this.p.maxHp; }
  /** AICompareSpeed: carry if the enemy is faster than the player. */
  enemyFaster() { return this.e.stats.spd > this.p.stats.spd; }
  hasMoveEffect(name) { return this.e.moves.some((mv) => mv && MOVES[mv].effect === name); }
  hasMoveIn(list) { return list.some((mv) => this.e.moves.includes(mv)); }
}

// AICheckEnemyHalfHP and friends: the ROM computes max - HP*2 (or *4) and returns its borrow, so "carry" means HP is above half (quarter).
AIContext.prototype.enemyHalfHp = function enemyHalfHp() { return this.e.maxHp < this.e.hp * 2; };
AIContext.prototype.enemyQuarterHp = function enemyQuarterHp() { return this.e.maxHp < this.e.hp * 4; };
AIContext.prototype.playerHalfHp = function playerHalfHp() { return this.p.maxHp < this.p.hp * 2; };
AIContext.prototype.playerQuarterHp = function playerQuarterHp() { return this.p.maxHp < this.p.hp * 4; };

const slots = (ai) => ai.e.moves.map((m, i) => [m, i]).filter(([m]) => m);

const LAYER_FUNCS = {
  /** AI_Basic: nothing redundant — status-only moves the player can't take, moves that fail when already in effect. */
  AI_BASIC(ai) {
    for (const [name, i] of slots(ai)) {
      const m = ai.move(name);
      if (redundant(ai, m)) { ai.discourage(i); continue; }
      if (!BATTLE.ai.statusOnlyEffects.includes(m.effect)) continue;
      if (ai.p.status !== 0 || ai.p.screens.safeguard) ai.discourage(i);
    }
  },
  /** AI_Setup: stat-modifying moves on the first turn only. */
  AI_SETUP(ai) {
    for (const [name, i] of slots(ai)) {
      const n = effectNumber(ai.move(name).effect);
      const up = (n >= EFFECT.EFFECT_ATTACK_UP && n <= EFFECT.EFFECT_EVASION_UP) || (n >= EFFECT.EFFECT_ATTACK_UP_2 && n <= EFFECT.EFFECT_EVASION_UP_2);
      const down = (n >= EFFECT.EFFECT_ATTACK_DOWN && n <= EFFECT.EFFECT_EVASION_DOWN) || (n >= EFFECT.EFFECT_ATTACK_DOWN_2 && n <= EFFECT.EFFECT_EVASION_DOWN_2);
      if (!up && !down) continue;
      const first = up ? ai.e.turnsTaken === 0 : ai.p.turnsTaken === 0;
      if (first) { if (!ai.fiftyFifty()) ai.dec(i, 2); }
      else if (!(ai.random() < percent(12))) ai.inc(i, 2);
    }
  },
  /** AI_Types: dismiss immune moves, encourage super effective ones, discourage resisted ones unless all damaging moves share the type. */
  AI_TYPES(ai) {
    for (const [name, i] of slots(ai)) {
      const m = ai.move(name);
      const matchup = ai.matchup(m);
      if (matchup === 0) { ai.discourage(i); continue; }
      if (matchup === 10) continue;
      if (matchup > 10) { if (m.power) ai.dec(i); continue; }
      let other = false;                                // any damaging move of a different type?
      for (const [n2] of slots(ai)) {
        const m2 = ai.move(n2);
        if (m2.type === m.type) continue;
        if (m2.power) { other = true; break; }
      }
      if (other) ai.inc(i);
    }
  },
  /** AI_Offensive: greatly discourage non-damaging moves. */
  AI_OFFENSIVE(ai) {
    for (const [name, i] of slots(ai)) if (!ai.move(name).power) ai.inc(i, 2);
  },
  AI_SMART(ai) {
    for (const [name, i] of slots(ai)) {
      const m = ai.move(name);
      const handler = smartHandlers[m.effect];
      if (handler) handler(ai, i, m);
    }
  },
  /** AI_Opportunist: discourage stall moves when the enemy's HP is low. */
  AI_OPPORTUNIST(ai) {
    if (ai.enemyHalfHp()) return;
    if (ai.enemyQuarterHp() && ai.fiftyFifty()) return;
    for (const [name, i] of slots(ai)) if (BATTLE.ai.stallMoves.includes(name)) ai.inc(i);
  },
  /** AI_Aggressive: discourage every damaging move but the strongest (reckless ones excepted). */
  AI_AGGRESSIVE(ai) {
    let best = -1, bestDamage = 0;
    ai.e.moves.forEach((name, idx) => {
      if (!name || idx > 3) return;
      const m = ai.move(name);
      if (!m.power) return;
      const damage = ai.damage(m);
      if (damage >= bestDamage) { bestDamage = damage; best = idx + 1; }              // ties go to the later move
    });
    if (best <= 0) return;
    for (const [name, i] of slots(ai)) {
      if (i + 1 === best) continue;
      const m = ai.move(name);
      if (m.power < 2) continue;
      if (BATTLE.ai.recklessMoves.includes(m.effect)) continue;
      ai.inc(i);
    }
  },
  /** AI_Cautious: 90% chance to discourage residual-effect moves after the first turn. */
  AI_CAUTIOUS(ai) {
    if (ai.e.turnsTaken === 0) return;
    for (const [name, i] of slots(ai)) {
      if (!BATTLE.ai.residualMoves.includes(name)) continue;
      if (ai.random() >= percent(90) + 1) return;           // BUG kept: a miss ends the whole layer
      ai.inc(i);
    }
  },
  /** AI_Status: dismiss status moves that can't affect the player. */
  AI_STATUS(ai) {
    for (const [name, i] of slots(ai)) {
      const m = ai.move(name);
      let immune = false;
      if (m.effect === 'EFFECT_TOXIC' || m.effect === 'EFFECT_POISON') immune = ai.p.types.includes(BATTLE.types.POISON);
      else if (!(m.effect === 'EFFECT_SLEEP' || m.effect === 'EFFECT_PARALYZE') && !m.power) continue;
      if (!immune && ai.matchup(m) !== 0) continue;
      ai.discourage(i);
    }
  },
  /** AI_Risky: take a KO when there is one; risky effects are mostly held back. */
  AI_RISKY(ai) {
    for (const [name, i] of slots(ai)) {
      const m = ai.move(name);
      if (!m.power) continue;
      if (BATTLE.ai.riskyEffects.includes(m.effect)) {
        if (ai.enemyMaxHp()) continue;
        if (ai.random() < percent(79) - 1) continue;
      }
      if (ai.damage(m) > ai.p.hp) ai.dec(i, 5);              // the ROM keeps the move unless it does strictly more than the player's HP
    }
  },
};

/** AI_Redundant: the move's effect would fail or do nothing now. */
function redundant(ai, m) {
  const { e, p } = ai;
  const sleeping = (s) => (s.status & 7) !== 0;
  switch (m.effect) {
    case 'EFFECT_DREAM_EATER': return !sleeping(p);
    case 'EFFECT_HEAL': case 'EFFECT_MORNING_SUN': case 'EFFECT_SYNTHESIS': case 'EFFECT_MOONLIGHT': return ai.enemyMaxHp();
    case 'EFFECT_TELEPORT': return true;
    case 'EFFECT_LIGHT_SCREEN': return !!e.screens.lightScreen;
    case 'EFFECT_MIST': return !!e.sub.mist;
    case 'EFFECT_FOCUS_ENERGY': return !!e.sub.focusEnergy;
    case 'EFFECT_CONFUSE': return !!p.sub.confused || !!p.screens.safeguard;
    case 'EFFECT_TRANSFORM': return !!e.sub.transformed;
    case 'EFFECT_REFLECT': return !!e.screens.reflect;
    case 'EFFECT_SUBSTITUTE': return !!e.sub.substitute;
    case 'EFFECT_LEECH_SEED': return !!p.sub.leechSeed;
    case 'EFFECT_DISABLE': return !!p.disableCount;
    case 'EFFECT_ENCORE': return !!p.sub.encored;
    case 'EFFECT_SNORE': case 'EFFECT_SLEEP_TALK': return !sleeping(e);
    case 'EFFECT_MEAN_LOOK': return !!p.sub.cantRun;
    case 'EFFECT_NIGHTMARE': return p.status === 0 ? true : !!p.sub.nightmare;     // BUG kept: any status counts as sleeping
    case 'EFFECT_SPIKES': return !!p.screens.spikes;
    case 'EFFECT_FORESIGHT': return !!p.sub.identified;
    case 'EFFECT_PERISH_SONG': return !!p.sub.perish;
    case 'EFFECT_SANDSTORM': return ai.battle.weather === 3;
    case 'EFFECT_ATTRACT': return oppositeGenderBlocks(ai) || !!p.sub.inLove;
    case 'EFFECT_SAFEGUARD': return !!e.screens.safeguard;
    case 'EFFECT_RAIN_DANCE': return ai.battle.weather === 1;
    case 'EFFECT_SUNNY_DAY': return ai.battle.weather === 2;
    case 'EFFECT_SWAGGER': return !!p.sub.confused;
    case 'EFFECT_FUTURE_SIGHT': return !!e.screens.unused;                          // BUG kept: reads an unused screens bit
    default: return false;
  }
}

/** CheckOppositeGender: carry (redundant) unless the two have opposite, known genders. */
function oppositeGenderBlocks(ai) {
  const a = monGender(ai.p.species, ai.p.mon.dvs), b = monGender(ai.e.species, ai.e.mon.dvs);
  return !a || !b || a === b;
}

export function installAI(Battle) {
  Object.assign(Battle.prototype, {
    /** AIChooseMove: score the enemy's moves, pick one of the best at random (trainer battles only). */
    aiChooseMove() {
      const e = this.sides[1];
      if (this.wild || this.isLockedIn(1) || e.sub.bide) return;
      const ai = new AIContext(this);
      ai.scores = [20, 20, 20, 20];
      if (e.disabledMove) { const i = e.moves.indexOf(e.disabledMove); if (i >= 0) ai.scores[i] = 80; }
      for (let i = 0; i < 4; i++) if ((e.pp[i] ?? 0) === 0) ai.scores[i] = 80;
      for (const layer of LAYERS) if (this.trainerInfo.ai.includes(layer)) LAYER_FUNCS[layer](ai);
      // decrement every score in turn until one reaches 0, then give back what was taken (a tie goes to the first)
      const scores = ai.scores;
      let hit = -1;
      while (hit < 0) {
        for (let i = 0; i < 4; i++) {
          if (!e.moves[i]) break;
          scores[i] = (scores[i] - 1) & 0xff;
          if (scores[i] === 0) { hit = i; break; }
        }
      }
      for (let i = hit; i >= 0; i--) scores[i] = (scores[i] + 1) & 0xff;
      const keep = scores.map((s, i) => (e.moves[i] && s === 1 ? e.moves[i] : null));
      for (;;) {
        const c = this.random() & 3;
        if (keep[c]) { e.curMove = keep[c]; e.curMoveNum = c; return; }
      }
    },
  });
}
