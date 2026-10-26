// A battle, following engine/battle/core.asm (turn flow) and effect_commands.asm (move effect scripts).
// `run()` is a generator, like the script interpreter: it yields what the screen must show and receives the player's choices.
//   { text: [commands] }          a text box in the script text format (src/script/text.js), names already filled in
//   { wait: frames }              DelayFrames
//   { anim: move, user: 0|1 }     a move animation
//   { hp: side, from, to }        an HP bar animation (side 0 = player, 1 = enemy)
//   { ask: 'action' }             the main battle menu; answer { action: 'fight', slot } or { action: 'run' }
// It returns { result: 'win' | 'lose' | 'ran' | 'fled' }. random() is BattleRandom (a byte).
import { BATTLE } from '../generated/battle-data.js';
import { MOVES } from '../generated/moves.js';
import { POKEMON } from '../generated/pokemon.js';
import { ITEMS } from '../generated/items.js';
import { SCRIPTS as TEXT } from '../generated/scripts/_text.js';
import { damageStats, damageCalc, criticalStage, isCritical, stab, damageVariation } from './damage.js';
import { checkHit, rawAccuracy } from './accuracy.js';
import { giveExperience } from './experience.js';

export const STATUS = { SLP: 7, PSN: 1 << 3, BRN: 1 << 4, FRZ: 1 << 5, PAR: 1 << 6 };
const BASE_STAGE = 7;
const NORMAL = 10;                                   // wTypeModifier: EFFECTIVE
const typeId = (name) => BATTLE.types[name];
const percent = (n) => Math.floor((n * 255) / 100);

/** InitBattleMon / the enemy's copy: what the battle keeps of a party Pokémon. */
export function battleMon(mon, { name = mon.nickname ?? POKEMON[mon.species].name } = {}) {
  const types = POKEMON[mon.species].types.map(typeId);
  return {
    mon, name, species: mon.species, level: mon.level, types, item: mon.item ?? null,
    moves: [...mon.moves], pp: [...mon.pp], hp: mon.hp, maxHp: mon.stats.hp, status: mon.status ?? 0,
    stats: { atk: mon.stats.atk, def: mon.stats.def, spd: mon.stats.spd, sat: mon.stats.sat, sdf: mon.stats.sdf },
    base: { atk: mon.stats.atk, def: mon.stats.def, spd: mon.stats.spd, sat: mon.stats.sat, sdf: mon.stats.sdf },
    stages: { atk: BASE_STAGE, def: BASE_STAGE, spd: BASE_STAGE, sat: BASE_STAGE, sdf: BASE_STAGE, acc: BASE_STAGE, eva: BASE_STAGE },
    sub: {},                                         // flinched, charged, recharge, endure, protect, identified, ...
    screens: {}, curMove: null, curMoveNum: 0, lastMove: null, move: null, turnsTaken: 0,
  };
}

export class Battle {
  /** player/enemy: party mon objects (src/script/mon.js); badges: Johto bits 0-7, Kanto bits 8-15. */
  constructor({ player, enemy, wild = true, random, badges = 0, weather = 0, playerId = 0 }) {
    this.party = player;
    this.playerId = playerId;
    this.trainer = !wild;
    this.sides = [battleMon(player.find((m) => m.hp > 0)), battleMon(enemy)];
    this.participants = new Set([player.indexOf(this.sides[0].mon)]);      // wBattleParticipantsNotFainted
    this.wild = wild;
    this.random = random;
    this.badges = badges;
    this.weather = weather;
    this.turn = 0;                                   // hBattleTurn
    this.enemyGoesFirst = false;
    this.curDamage = 0;
    this.critical = 0;
    this.typeModifier = NORMAL;
    this.attackMissed = false;
    this.turnEnded = false;
    this.ended = null;
    this.failedMessage = 0;
    this.effectFailed = false;
    this.alreadyFailed = false;
    this.fleeAttempts = 0;
    this.skipPlayerTurn = false;
  }

  get user() { return this.sides[this.turn]; }
  get target() { return this.sides[1 - this.turn]; }
  nameOf(side) { return side === 0 ? this.sides[0].name : `Enemy ${this.sides[1].name}`; }

  // ---- text ---------------------------------------------------------------------------------------------------
  /** Resolve text_far chains and <USER>/<TARGET> of a shared text block. */
  say(label, vars = {}) {
    const out = [];
    const walk = (cmds) => {
      for (const [name, ...args] of cmds) {
        if (name === 'text_far') walk(TEXT[args[0]]);
        else if (name === 'text_end' || name === 'text_start') continue;
        else if (name === 'text_ram') out.push(['text', String(vars[args[0]])]);
        else if (name === 'text_decimal') out.push(['text', String(vars[args[0]])]);   // left-aligned, as the game prints it
        else out.push([name, ...args.map((a) => this.fill(a))]);
      }
    };
    walk(TEXT[label]);
    return { text: out };
  }
  fill(s) { return typeof s === 'string' ? s.replace(/<USER>/g, this.nameOf(this.turn)).replace(/<TARGET>/g, this.nameOf(1 - this.turn)) : s; }

  // ---- the whole battle ---------------------------------------------------------------------------------------
  *run() {
    // measured in the real game after the "appeared" text: the box clears, the enemy HUD follows 6 frames later, 40 frames of DelayFrames,
    // the trainer slides out (22 frames), "Go! X!", 30 frames, the send-out animation (62 frames), the HUD, 17 frames to the menu
    yield { wait: 6 };
    yield { enemyHud: true };
    yield { wait: 40 };
    yield { slideOut: true };
    yield { text: [['text', `Go! ${this.sides[0].name}!`], ['done']] };        // SendOutMonText: the enemy is at full health
    yield { wait: 30 };
    yield { anim: 'SEND_OUT_MON', user: 0, frames: 62 };
    yield { sendOut: 0 };
    yield { wait: 17 };
    for (;;) {
      this.sides.forEach((s) => { s.sub.flinched = false; });
      this.curDamage = 0;
      this.skipPlayerTurn = false;
      const choice = yield { ask: 'action' };
      if (choice.action === 'run') {
        const ran = yield* this.tryRun();
        if (ran === 'escaped') return { result: 'ran' };
        if (ran === 'menu') continue;
        this.skipPlayerTurn = true;
      } else { this.fleeAttempts = 0; this.pickPlayerMove(choice.slot); }
      this.pickEnemyMove();
      const order = this.skipPlayerTurn ? [0, 1] : this.playerFirst() ? [0, 1] : [1, 0];
      this.enemyGoesFirst = order[0] === 1;
      for (const t of order) {
        if (this.sides[0].hp === 0 || this.sides[1].hp === 0) break;
        if (t === 1 && (yield* this.tryEnemyFlee())) return { result: 'fled' };
        this.turn = t;
        if (!(t === 0 && this.skipPlayerTurn)) { yield* this.doTurn(); if (!this.turnEnded) yield { wait: 28 }; }   // measured: 28 frames pass after a move before the next text
        if (this.sides[1].hp === 0 || this.sides[0].hp === 0) break;
        yield* this.residual(t);
        if (this.sides[t].hp === 0) break;
      }
      if (this.sides[1].hp === 0) return yield* this.enemyFainted();
      if (this.sides[0].hp === 0) return yield* this.playerFainted();
    }
  }

  pickPlayerMove(slot) {
    const p = this.sides[0];
    p.curMoveNum = slot;
    p.curMove = p.moves[slot];
    this.loadMove(0);
  }

  /** ParseEnemyAction for a wild Pokémon: a random move with PP left, STRUGGLE when none is usable. */
  pickEnemyMove() {
    const e = this.sides[1];
    if (!e.moves.some((m, i) => m && e.pp[i] > 0)) { e.curMove = 'STRUGGLE'; e.curMoveNum = 0; }
    else {
      let c;
      do c = this.random() & 3; while (!e.moves[c] || e.pp[c] === 0);
      e.curMoveNum = c;
      e.curMove = e.moves[c];
    }
    this.loadMove(1);
  }

  /** UpdateMoveData: copy the chosen move into the user's move struct. */
  loadMove(t) {
    const side = this.sides[t], m = MOVES[side.curMove];
    side.move = { name: side.curMove, effect: m.effect, power: m.power, type: typeId(m.type), accuracy: rawAccuracy(m.accuracy), chance: percent(m.chance) };
  }

  /** DetermineMoveOrder (no link): priority, Quick Claw, speed, then a coin flip. */
  playerFirst() {
    const prio = (side) => (side.move.name === 'VITAL_THROW' ? 0 : (BATTLE.priorities.find(([e]) => e === side.move.effect)?.[1] ?? 1));
    const [p, e] = [prio(this.sides[0]), prio(this.sides[1])];
    if (p !== e) return p > e;                           // CompareMovePriority: the higher priority goes first
    const claw = (side) => (side.item && ITEMS[side.item].hold === 'HELD_QUICK_CLAW' ? Number(ITEMS[side.item].param) : null);
    const [cp, ce] = [claw(this.sides[0]), claw(this.sides[1])];
    if (cp !== null && ce === null) { if (this.random() < cp) return true; }
    else if (cp === null && ce !== null) { if (this.random() < ce) return false; }
    else if (cp !== null && ce !== null) {
      if (this.random() < ce) return false;
      if (this.random() < cp) return true;
    }
    const [sp, se] = [this.sides[0].stats.spd, this.sides[1].stats.spd];
    if (sp !== se) return sp > se;
    return this.random() <= percent(50);
  }

  /** TryToRunAwayFromBattle for a wild battle (no Smoke Ball): 'escaped', 'lostTurn' (the enemy acts) or 'menu' (back to the menu). */
  *tryRun() {
    const [p, e] = this.sides;
    if (!this.wild) { yield this.say('BattleText_TheresNoEscapeFromTrainerBattle'); return 'menu'; }
    if (e.sub.cantRun || p.wrapCount) { yield this.say('BattleText_CantEscape'); return 'menu'; }
    this.fleeAttempts++;
    let escaped = p.stats.spd >= e.stats.spd;
    if (!escaped) {
      const divisor = (e.stats.spd >> 2) & 0xff;
      const quotient = divisor ? Math.floor((p.stats.spd * 32) / divisor) : 0;
      if (!divisor || quotient > 0xff) escaped = true;
      else {
        let odds = quotient;
        for (let c = this.fleeAttempts - 1; c > 0 && !escaped; c--) { odds += 30; if (odds > 0xff) escaped = true; }
        if (!escaped) escaped = odds >= this.random();
      }
    }
    if (!escaped) { yield this.say('BattleText_CantEscape2'); return 'lostTurn'; }
    yield this.say('BattleText_GotAwaySafely');
    return 'escaped';
  }

  *tryEnemyFlee() { return false; }                  // TryEnemyFlee: only the flee lists of data/wild/flee_mons.asm; not ported

  // ---- one Pokémon's turn --------------------------------------------------------------------------------------
  *doTurn() {
    this.turnEnded = false;
    yield* this.checkTurn();
    if (this.turnEnded) return;
    yield* this.doMove();
  }

  /** BattleCommand_CheckTurn: asleep, frozen, flinched, paralysed... */
  *checkTurn() {
    const u = this.user;
    this.attackMissed = false;
    this.effectFailed = false;
    this.alreadyFailed = false;
    this.typeModifier = NORMAL;
    const cant = function* (self, label) { yield self.say(label); self.turnEnded = true; self.curDamage = 0; };
    if (u.sub.recharge) { u.sub.recharge = false; yield* cant(this, 'MustRechargeText'); return; }
    if (u.status & STATUS.SLP) {
      u.status -= 1;
      if (!(u.status & STATUS.SLP)) { yield* cant(this, 'WokeUpText'); return; }
      yield { anim: 'SLP', user: this.turn };
      yield this.say('FastAsleepText');
      if (!['SNORE', 'SLEEP_TALK'].includes(u.curMove)) { this.turnEnded = true; this.curDamage = 0; return; }
    }
    if ((u.status & STATUS.FRZ) && !['FLAME_WHEEL', 'SACRED_FIRE'].includes(u.curMove)) { yield* cant(this, 'FrozenSolidText'); return; }
    if (u.sub.flinched) { u.sub.flinched = false; yield* cant(this, 'FlinchedText'); return; }
    if (u.status & STATUS.PAR) {
      if (this.random() < percent(25)) { yield* cant(this, 'FullyParalyzedText'); }
    }
  }

  *doMove() {
    this.curMoveEffect = this.user.move.effect;
    const script = BATTLE.scripts[BATTLE.effects[this.user.move.effect]];
    this.scriptEnded = false;
    for (const [cmd, ...args] of script) {
      if (cmd === 'endmove') break;
      const fn = this.commands[cmd];
      if (!fn) throw new Error(`unported battle command: ${cmd}`);
      yield* fn.call(this, ...args);
      if (this.scriptEnded) break;
    }
  }

  /** EndMoveEffect: the rest of the script is skipped. */
  endMoveEffect() { this.scriptEnded = true; }

  // ---- ResidualDamage, faint --------------------------------------------------------------------------------------
  *residual(t) {
    const u = this.sides[t];
    if (u.hp === 0) return;
    if (u.status & (STATUS.PSN | STATUS.BRN)) throw new Error('unported: poison/burn damage');
  }

  /** HandleEnemyMonFaint for a wild battle: the faint text, experience for the Pokémon that fought, then the battle is over. */
  *enemyFainted() {
    yield this.say('BattleText_EnemyMonFainted');
    if (this.sides[0].hp === 0) { yield this.say('BattleText_MonFainted'); this.participants.delete(this.party.indexOf(this.sides[0].mon)); }
    if (this.party.some((m) => m.hp > 0)) yield* giveExperience(this, { participants: this.participants, playerId: this.playerId, trainer: this.trainer });
    yield { wait: 60 };
    return { result: this.party.some((m) => m.hp > 0) ? 'win' : 'lose' };
  }
  *playerFainted() { yield this.say('BattleText_MonFainted'); return { result: 'lose' }; }

  /** After a level up: the active Pokémon's battle stats from its new party stats. */
  refreshPlayerStats() {
    const p = this.sides[0];
    p.level = p.mon.level;
    p.maxHp = p.mon.stats.hp;
    p.hp = p.mon.hp;
    Object.assign(p.base, { atk: p.mon.stats.atk, def: p.mon.stats.def, spd: p.mon.stats.spd, sat: p.mon.stats.sat, sdf: p.mon.stats.sdf });
    this.calcStats(p);
  }
}

/** The effect commands, one per BattleCommand_* of effect_commands.asm that the NormalHit family uses. */
Battle.prototype.commands = {
  *checkobedience() { /* only Pokémon from another trainer can disobey */ },
  *usedmovetext() {
    const u = this.user;
    u.lastMove = u.curMove;
    yield { text: [['text', this.fill('<USER>')], ['line', `used ${MOVES[u.move.name].name}!`], ['done']] };
  },
  *doturn() {
    const u = this.user;
    if (u.sub.charged) return;
    u.turnsTaken++;
    if (u.move.name === 'STRUGGLE') return;
    if (u.sub.inLoop || u.sub.rampage || u.sub.bide) return;
    if (u.pp[u.curMoveNum] === 0) throw new Error('unported: out of PP');
    u.pp[u.curMoveNum]--;
    u.mon.pp[u.curMoveNum] = u.pp[u.curMoveNum];
  },
  *critical() {
    this.critical = 0;
    const u = this.user;
    if (u.move.power === 0) return;
    const stage = criticalStage({ species: u.species, item: u.item, focusEnergy: u.sub.focusEnergy, move: u.move.name });
    if (isCritical(stage, this.random)) this.critical = 1;
  },
  *damagestats() {
    const u = this.user, t = this.target;
    this.curDamage = 0;
    if (u.move.power === 0) return;
    this.damageInput = damageStats(
      { species: u.species, item: u.item, level: u.level, stats: u.stats, base: u.base, stages: u.stages },
      { species: t.species, item: t.item, stats: t.stats, base: t.base, stages: t.stages, screens: t.screens },
      { special: u.move.type >= BATTLE.special, critical: !!this.critical });
  },
  *damagecalc() {
    const u = this.user;
    if (!this.damageInput) { this.curDamage = 0; return; }
    this.curDamage = damageCalc({
      power: u.move.power, level: this.damageInput.level, attack: this.damageInput.attack, defense: this.damageInput.defense,
      effect: u.move.effect, moveType: u.move.type, userItem: u.item, critical: !!this.critical,
    });
    this.damageInput = null;
  },
  *stab() {
    const u = this.user, t = this.target;
    if (u.move.name === 'STRUGGLE') return;
    const r = stab({
      damage: this.curDamage, moveType: u.move.type, moveEffect: u.move.effect,
      user: { types: u.types }, target: { types: t.types, identified: t.sub.identified },
      weather: this.weather, isPlayer: this.turn === 0, badges: this.badges,
    });
    this.curDamage = r.damage;
    if (r.missed) this.attackMissed = true;
    this.typeModifier = (r.stab ? 0x80 : 0) | r.matchup;
  },
  *damagevariation() { this.curDamage = damageVariation(this.curDamage, this.random); },
  *checkhit() {
    const u = this.user, t = this.target;
    const r = checkHit({
      user: { accLevel: u.stages.acc, xAccuracy: u.sub.xAccuracy },
      target: { evaLevel: t.stages.eva, identified: t.sub.identified, flying: t.sub.flying, underground: t.sub.underground, protect: t.sub.protect, substitute: !!t.sub.substitute, asleep: !!(t.status & STATUS.SLP), item: t.item },
      move: u.move, weather: this.weather, lockedOn: !!u.sub.lockOn, random: this.random,
    });
    if (r.lockOnUsed) u.sub.lockOn = false;
    if (!r.hit) {
      if (u.move.effect !== 'EFFECT_JUMP_KICK') this.curDamage = 0;
      this.attackMissed = true;
    }
  },
  *moveanim() {
    if (this.attackMissed) { yield { wait: 40 }; return; }
    yield { wait: 21 };                                        // measured: the animation starts 21 frames after the move's name is typed
    yield { anim: this.user.move.name, user: this.turn, frames: 110 };
  },
  *failuretext() {
    if (!this.attackMissed) return;
    // GetFailureResultText + FailText_CheckOpponentProtect
    let label;
    if ((this.typeModifier & 0x7f) === 0) label = 'DoesntAffectText';
    else if (this.user.move.effect === 'EFFECT_FUTURE_SIGHT') label = this.target.sub.protect ? 'ItFailedText' : 'ButItFailedText';
    else if (this.critical === 0xff) label = 'UnaffectedText';
    else label = this.target.sub.protect ? 'AttackMissed2Text' : 'AttackMissedText';
    yield this.say(label);
    this.critical = 0;
    this.endMoveEffect();
  },
  *applydamage() {
    const t = this.target;
    let hung = 0;
    if (t.sub.endure) hung = this.falseSwipe() ? 1 : 0;
    else if (t.item && ITEMS[t.item].hold === 'HELD_FOCUS_BAND' && this.random() < Number(ITEMS[t.item].param)) hung = this.falseSwipe() ? 2 : 0;
    yield* this.damageTarget();
    if (hung === 1) yield this.say('EnduredText');
    if (hung === 2) yield this.say('HungOnText');
  },
  *criticaltext() {
    if (this.critical) { yield this.say('CriticalHitText'); this.critical = 0; }
    yield { wait: 20 };
  },
  *supereffectivetext() {
    const m = this.typeModifier & 0x7f;
    if (m === NORMAL) return;
    yield this.say(m > NORMAL ? 'SuperEffectiveText' : 'NotVeryEffectiveText');
  },
  *checkfaint() {
    if (this.target.hp !== 0) return;
    this.endMoveEffect();
  },
  *buildopponentrage() { if (!this.attackMissed && this.target.sub.rage) throw new Error('unported: rage'); },
  *kingsrock() {
    if (this.attackMissed) return;
    const u = this.user;
    if (!u.item || ITEMS[u.item].hold !== 'HELD_FLINCH') return;
    if (this.target.sub.substitute) return;
    if (this.random() < Number(ITEMS[u.item].param)) { this.target.sub.recharge = false; this.target.sub.flinched = true; }
  },
};

/** BattleCommand_FalseSwipe: keep the target alive at 1 HP. Returns true when damage was reduced. */
Battle.prototype.falseSwipe = function falseSwipe() {
  const t = this.target;
  if (this.curDamage < t.hp) return false;
  this.curDamage = t.hp - 1;
  if (this.critical === 2) this.critical = 0;
  return true;
};

/** DoEnemyDamage / DoPlayerDamage: subtract wCurDamage from the target (a substitute takes it first). */
Battle.prototype.damageTarget = function* damageTarget({ ignoreSubstitute = false } = {}) {
  const t = this.target;
  if (this.curDamage === 0) return;
  if (!ignoreSubstitute && t.sub.substitute) throw new Error('unported: substitute');
  const from = t.hp;
  if (this.curDamage > from) this.curDamage = from;       // the ROM leaves HP in wCurDamage when the hit would overkill
  t.hp = from - this.curDamage;
  t.mon.hp = t.hp;
  yield { hp: 1 - this.turn, from, to: t.hp };
};

// ---- stat stages: RaiseStat, BattleCommand_StatDown, CalcBattleStats --------------------------------------------------
const STAT_KEYS = ['atk', 'def', 'spd', 'sat', 'sdf', 'acc', 'eva'];
const STAT_NAMES = ['ATTACK', 'DEFENSE', 'SPEED', 'SPCL.ATK', 'SPCL.DEF', 'ACCURACY', 'EVASION'];
const MAX_STAT_LEVEL = 13, MAX_STAT_VALUE = 999;
// CheckMist: the plain and 2-stage drops (not the *_HIT effects with a side effect... it covers those too, as the ROM does)
const MIST_BLOCKED = new Set(['', '_2', '_HIT'].flatMap((suffix) => ['ATTACK', 'DEFENSE', 'SPEED', 'SP_ATK', 'SP_DEF', 'ACCURACY', 'EVASION'].map((n) => `EFFECT_${n}_DOWN${suffix}`)));

/** CalcPlayerStats / CalcEnemyStats: the stage multiplier on the unmodified stats, then paralysis and burn. Badge boosts: not ported. */
Battle.prototype.calcStats = function calcStats(side) {
  for (const k of ['atk', 'def', 'spd', 'sat', 'sdf']) {
    const [mul, div] = BATTLE.statMultipliers[side.stages[k] - 1];
    const v = Math.floor((side.base[k] * mul) / div);
    side.stats[k] = v === 0 ? 1 : Math.min(v, MAX_STAT_VALUE);
  }
  if (side.status & STATUS.PAR) side.stats.spd = Math.max(1, side.stats.spd >> 2);
  if (side.status & STATUS.BRN) side.stats.atk = Math.max(1, side.stats.atk >> 1);
};

function statChange(index, amount, sharp) {
  return function* () {
    this.loweredStat = index | (sharp ? 0x10 : 0);
    if (amount > 0) this.raiseStat(); else this.lowerStatCommand();
  };
}
Battle.prototype.raiseStat = function raiseStat() {
  const u = this.user, index = this.loweredStat & 0xf, key = STAT_KEYS[index];
  if (this.attackMissed || this.effectFailed) { this.failedMessage = 1; return; }
  let level = u.stages[key] + 1;
  if (level > MAX_STAT_LEVEL) { this.failedMessage = 2; this.attackMissed = true; return; }
  if (this.loweredStat & 0xf0) level = Math.min(MAX_STAT_LEVEL, level + 1);
  const before = u.stages[key];
  u.stages[key] = level;
  if (index < 5) {
    if (u.stats[key] === MAX_STAT_VALUE) { u.stages[key] = before; this.failedMessage = 2; this.attackMissed = true; return; }
    this.calcStats(u);
  }
  this.failedMessage = 0;
};
Battle.prototype.lowerStatCommand = function lowerStatCommand() {
  const u = this.user, t = this.target, index = this.loweredStat & 0xf, key = STAT_KEYS[index];
  const fail = (n) => { this.failedMessage = n; this.attackMissed = true; };
  const effect = u.move.effect;
  if (MIST_BLOCKED.has(effect) && t.sub.mist) return fail(2);
  let level = t.stages[key] - 1;
  if (level === 0) return fail(3);
  if (this.loweredStat & 0xf0) { level -= 1; if (level === 0) level = 1; }
  if (this.turn !== 0 && !u.sub.lockOn && effect !== 'EFFECT_ACCURACY_DOWN_HIT' && this.random() < percent(25) + 1) return fail(1);
  if (t.sub.substitute || this.attackMissed || this.effectFailed || t.sub.flying || t.sub.underground) return fail(1);
  const before = t.stages[key];
  t.stages[key] = level;
  if (index < 5) {
    if (t.stats[key] === 1) { t.stages[key] = before; return fail(3); }
    this.calcStats(t);
  }
  this.failedMessage = 0;
};

const statCommands = {};
[['attackup', 0], ['defenseup', 1], ['speedup', 2], ['specialattackup', 3], ['specialdefenseup', 4], ['accuracyup', 5], ['evasionup', 6]].forEach(([name, i]) => {
  statCommands[name] = statChange(i, 1, false);
  statCommands[`${name}2`] = statChange(i, 1, true);
});
[['attackdown', 0], ['defensedown', 1], ['speeddown', 2], ['specialattackdown', 3], ['specialdefensedown', 4], ['accuracydown', 5], ['evasiondown', 6]].forEach(([name, i]) => {
  statCommands[name] = statChange(i, -1, false);
  statCommands[`${name}2`] = statChange(i, -1, true);
});
Object.assign(Battle.prototype.commands, statCommands, {
  *statupanim() { yield this.attackMissed ? { wait: 40 } : { anim: this.user.move.name, user: this.turn, kind: 'statup' }; },
  *statdownanim() { yield this.attackMissed ? { wait: 40 } : { anim: this.user.move.name, user: this.turn, kind: 'statdown' }; },
  *lowersub() {}, *raisesub() {}, *lowersubnoanim() {}, *raisesubnoanim() {},
  *statupmessage() {
    if (this.failedMessage) return;
    const sharp = this.loweredStat & 0xf0;
    yield { text: [['text', this.fill("<USER>'s")], ['line', STAT_NAMES[this.loweredStat & 0xf]], sharp ? ['cont', 'went way up!'] : ['text', ' went up!'], ['prompt']] };
  },
  *statdownmessage() {
    if (this.failedMessage) return;
    const sharp = this.loweredStat & 0xf0;
    yield { text: [['text', this.fill("<TARGET>'s")], ['line', STAT_NAMES[this.loweredStat & 0xf]], sharp ? ['cont', 'sharply fell!'] : ['text', ' fell!'], ['prompt']] };
  },
  *statupfailtext() {
    if (!this.failedMessage) return;
    yield { wait: 40 };
    if (this.failedMessage === 1) { if (!this.alreadyFailed) yield this.say('ButItFailedText'); return; }
    yield { text: [['text', this.fill("<USER>'s")], ['line', STAT_NAMES[this.loweredStat & 0xf]], ['text', " won't"], ['cont', 'rise anymore!'], ['prompt']] };
  },
  *statdownfailtext() {
    if (!this.failedMessage) return;
    yield { wait: 40 };
    if (this.failedMessage === 1) { if (!this.alreadyFailed) yield this.say('ButItFailedText'); return; }
    if (this.failedMessage === 2) { yield this.say('ProtectedByMistText'); return; }
    yield { text: [['text', this.fill("<TARGET>'s")], ['line', STAT_NAMES[this.loweredStat & 0xf]], ['text', " won't"], ['cont', 'drop anymore!'], ['prompt']] };
  },
});
