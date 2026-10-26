// Move effect commands that set flags, screens, weather, change types or damage in unusual ways (engine/battle/move_effects/*.asm and the
// matching commands of effect_commands.asm). Installed on Battle.prototype.commands by battle.js.
import { BATTLE } from '../generated/battle-data.js';
import { MOVES } from '../generated/moves.js';
import { monGender } from '../script/gender.js';

const NUM_ATTACKS = 251;
const BASE_STAGE = 7;
const moveNames = Object.keys(MOVES).sort((a, b) => MOVES[a].id - MOVES[b].id);

/** HiddenPowerDamage: the base power and type from a Pokémon's DVs. */
export function hiddenPower(dv) {
  const power = Math.floor((5 * (((dv[0] >> 4) & 8) | ((dv[0] & 8) >> 1) | (((dv[1] >> 4) & 8) >> 2) | ((dv[1] & 8) >> 3)) + (dv[1] & 3)) / 2) + 31;
  let type = ((dv[0] & 3) | (((dv[0] >> 4) & 3) << 2)) + 1;       // skip Normal
  if (type >= BATTLE.types.BIRD) type++;
  if (type >= 10) type += 10;                                         // skip the unused types
  return { power, type };
}

export function installEffects(Battle, STATUS) {
  const C = Battle.prototype.commands;
  const fail = function* (self, label = 'ButItFailedText') { yield* self.animateFailedMove(); yield self.say(label); };
  /** FailMove: "But it failed!" (or "It failed!" against a protecting target). */
  const failMove = function* (self) { yield* self.animateFailedMove(); yield self.say(self.target.sub.protect ? 'ItFailedText' : 'ButItFailedText'); };
  /** FailText_CheckOpponentProtect variant used by PrintDidntAffect2. */
  const didntAffect2 = function* (self) { yield* self.animateFailedMove(); yield self.say('DidntAffect1Text'); };
  const opponentWentFirst = (self) => (Number(self.enemyGoesFirst) ^ self.turn) !== 0;

  Object.assign(Battle.prototype, {
    /** CheckHiddenOpponent: nonzero while the target is flying or underground. */
    targetHidden() { return Boolean(this.target.sub.flying || this.target.sub.underground); },
    /** ResetTurn: run the move just chosen (Mirror Move, Metronome, Sleep Talk) as a nested DoMove. */
    *resetTurn() {
      const saved = { script: this.script, pc: this.pc };
      this.user.charging = true;
      yield* this.doMove();
      this.script = saved.script; this.pc = saved.pc;
      this.scriptEnded = true;
    },
    /** UpdateMoveData for the move now in the user's `move` name. */
    useMove(name) {
      const side = this.user;
      side.curMove = name;
      this.loadMove(this.turn);
    },
  });

  Object.assign(C, {
    *focusenergy() {
      const u = this.user;
      if (u.sub.focusEnergy) { yield* fail(this); return; }
      u.sub.focusEnergy = true;
      yield* this.animateCurrentMove();
      yield this.say('GettingPumpedText');
    },
    *mist() {
      const u = this.user;
      if (u.sub.mist) { yield* fail(this); return; }
      u.sub.mist = true;
      yield* this.animateCurrentMove();
      yield this.say('MistText');
    },
    *lockon() {
      if (this.targetHasSubstitute() || this.attackMissed) { yield* this.animateFailedMove(); yield this.say('DidntAffect1Text'); return; }
      this.target.sub.lockOn = true;                      // SUBSTATUS5 of the opponent: the user has locked on to it
      yield* this.animateCurrentMove();
      yield this.say('TookAimText');
    },
    *foresight() {
      const t = this.target;
      if (this.attackMissed || this.targetHidden() || t.sub.identified) { yield* failMove(this); return; }
      t.sub.identified = true;
      yield* this.animateCurrentMove();
      yield this.say('IdentifiedText');
    },
    *leechseed() {
      const t = this.target;
      if (this.attackMissed || this.targetHasSubstitute() || t.sub.leechSeed) { yield* this.animateFailedMove(); yield this.say('EvadedText'); return; }
      if (t.types.includes(BATTLE.types.GRASS)) { yield* this.animateFailedMove(); yield this.say('DoesntAffectText'); return; }
      t.sub.leechSeed = true;
      yield* this.animateCurrentMove();
      yield this.say('WasSeededText');
    },
    *nightmare() {
      const t = this.target;
      if (this.targetHidden() || this.targetHasSubstitute() || !(t.status & STATUS.SLP) || t.sub.nightmare) { yield* fail(this); return; }
      t.sub.nightmare = true;
      yield* this.animateCurrentMove();
      yield this.say('StartedNightmareText');
    },
    *protect() {
      if (!(yield* this.protectChance())) return;
      this.user.sub.protect = true;
      yield* this.animateCurrentMove();
      yield this.say('ProtectedItselfText');
    },
    *endure() {
      if (!(yield* this.protectChance())) return;
      this.user.sub.endure = true;
      yield* this.animateCurrentMove();
      yield this.say('BracedItselfText');
    },
    *attract() {
      const u = this.user, t = this.target;
      const gu = monGender(u.species, u.mon.dvs), gt = monGender(t.species, t.mon.dvs);
      if (this.attackMissed || !gu || !gt || gu === gt || this.targetHidden() || t.sub.inLove) { yield* failMove(this); return; }
      t.sub.inLove = true;
      yield* this.animateCurrentMove();
      yield this.say('FellInLoveText');
    },
    *destinybond() {
      this.user.sub.destinyBond = true;
      yield* this.animateCurrentMove();
      yield this.say('DestinyBondEffectText');
    },
    *splash() { yield* this.animateCurrentMove(); yield this.say('NothingHappenedText'); },
    *screen() {
      const u = this.user, light = u.move.effect === 'EFFECT_LIGHT_SCREEN';
      const key = light ? 'lightScreen' : 'reflect';
      if (u.screens[key]) { yield* fail(this); return; }
      u.screens[key] = 5;
      yield* this.animateCurrentMove();
      yield this.say(light ? 'LightScreenEffectText' : 'ReflectEffectText');
    },
    *safeguard() {
      const u = this.user;
      if (u.screens.safeguard) { yield* fail(this); return; }
      u.screens.safeguard = 5;
      yield* this.animateCurrentMove();
      yield this.say('CoveredByVeilText');
    },
    *spikes() {
      const t = this.target;                              // the spikes go on the opponent's side
      if (t.screens.spikes) { yield* failMove(this); return; }
      t.screens.spikes = true;
      yield* this.animateCurrentMove();
      yield this.say('SpikesText');
    },
    *startsandstorm() {
      if (this.weather === 3) { yield* fail(this); return; }
      this.weather = 3; this.weatherCount = 5;
      yield* this.animateCurrentMove();
      yield this.say('SandstormBrewedText');
    },
    *startrain() { this.weather = 1; this.weatherCount = 5; yield* this.animateCurrentMove(); yield this.say('DownpourText'); },
    *startsun() { this.weather = 2; this.weatherCount = 5; yield* this.animateCurrentMove(); yield this.say('SunGotBrightText'); },
    *perishsong() {
      const [p, e] = this.sides;
      if (p.sub.perish && e.sub.perish) { yield* fail(this); return; }
      for (const s of [p, e]) if (!s.sub.perish) { s.sub.perish = true; s.perishCount = 4; }
      yield* this.animateCurrentMove();
      yield this.say('StartPerishText');
    },
    *curl() { this.user.sub.curled = true; },
    *rechargenextturn() { this.user.sub.recharge = true; },
    *happinesspower() { this.power = Math.floor(((this.user.mon.happiness ?? 70) * 10) / 25); },
    *frustrationpower() { this.power = Math.floor(((255 - (this.user.mon.happiness ?? 70)) * 10) / 25); },
    *getmagnitude() {
      const r = this.random();
      const [, power, magnitude] = BATTLE.magnitudePower.find(([chance]) => chance >= r);
      this.power = power;
      yield { wait: 40 };
      yield { text: [['text', `Magnitude ${magnitude}!`], ['prompt']] };
    },
    *doubleundergrounddamage() { if (this.target.sub.underground && this.curDamage) this.curDamage = Math.min(0xffff, this.curDamage * 2); },
    *doubleflyingdamage() { if (this.target.sub.flying && this.curDamage) this.curDamage = Math.min(0xffff, this.curDamage * 2); },
    *doubleminimizedamage() { if (this.target.minimized && this.curDamage) this.curDamage = Math.min(0xffff, this.curDamage * 2); },
    *hiddenpower() {
      if (this.attackMissed) return;
      const { power, type } = hiddenPower(this.user.mon.dvs);
      this.user.move.type = type;
      yield* this.commands.damagestats.call(this);
      this.power = power;
    },
    *present() {
      yield* this.commands.stab.call(this);
      if ((this.typeModifier & 0x7f) === 0 || this.attackMissed) { yield* this.animateFailedMove(); return; }
      const r = this.random();
      const row = BATTLE.presentPower.find(([chance]) => chance >= r);
      if (row) { this.power = row[1]; yield* this.animateCurrentMove(); return; }
      yield* this.animateCurrentMove();                                   // heal instead: a quarter of the target's HP
      const t = this.target;
      if (t.hp === t.maxHp) { yield* this.animateFailedMove(); yield this.say('PresentFailedText'); }
      else {
        yield* this.setHp(1 - this.turn, t.hp + (t.maxHp >> 2));
        yield { text: [['text', this.fill('<TARGET>')], ['line', 'regained health!'], ['prompt']] };
      }
      this.endMoveEffect();
    },
    *counter() {
      this.attackMissed = true;
      const last = this.target.lastCounterMove;
      if (!last || MOVES[last].effect === 'EFFECT_COUNTER') return;
      const m = MOVES[last];
      const t = this.user;                                                // the counter targets whoever hit the user
      const matchup = this.typeMatchupOf(BATTLE.types[m.type], this.target);
      if (matchup === 0 || !opponentWentFirst(this) || !m.power || BATTLE.types[m.type] >= BATTLE.special) return;
      if (!this.curDamageTaken(this.user)) return;
      this.curDamage = Math.min(0xffff, this.curDamageTaken(this.user) * 2);
      this.attackMissed = false;
    },
    *mirrorcoat() {
      this.attackMissed = true;
      const last = this.target.lastCounterMove;
      if (!last || MOVES[last].effect === 'EFFECT_MIRROR_COAT') return;
      const m = MOVES[last];
      const matchup = this.typeMatchupOf(BATTLE.types[m.type], this.target);
      if (matchup === 0 || !opponentWentFirst(this) || !m.power || BATTLE.types[m.type] < BATTLE.special) return;
      if (!this.curDamageTaken(this.user)) return;
      this.curDamage = Math.min(0xffff, this.curDamageTaken(this.user) * 2);
      this.attackMissed = false;
    },
    *mirrormove() {
      this.user.lastCounterMove = null; this.user.lastMove = null;       // ClearLastMove
      const last = this.target.lastCounterMove;
      if (!last || this.user.moves.includes(last)) { yield* this.animateFailedMove(); yield this.say('MirrorMoveFailedText'); this.endMoveEffect(); return; }
      this.useMove(last);
      yield { wait: 40 };
      yield* this.resetTurn();
    },
    *metronome() {
      this.user.lastCounterMove = null; this.user.lastMove = null;
      let pick;
      do {
        const r = this.random();
        if (r > NUM_ATTACKS) continue;
        pick = moveNames[r - 1];
      } while (!pick || BATTLE.metronomeExcepts.includes(pick) || this.user.moves.includes(pick));
      this.useMove(pick);
      yield* this.resetTurn();
    },
    *sleeptalk() {
      const u = this.user;
      u.lastCounterMove = null; u.lastMove = null;
      const usable = u.moves.slice(1).filter(Boolean);
      const twoTurn = (m) => ['EFFECT_SKULL_BASH', 'EFFECT_RAZOR_WIND', 'EFFECT_SKY_ATTACK', 'EFFECT_SOLARBEAM', 'EFFECT_FLY', 'EFFECT_BIDE'].includes(MOVES[m].effect);
      const ok = (m) => m !== u.move.name && m !== u.disabledMove && !twoTurn(m);
      if (this.attackMissed || !(u.status & STATUS.SLP) || !u.moves[1] || !u.moves.some((m) => m && ok(m))) {
        yield* this.animateFailedMove();
        if (!this.alreadyFailed) yield this.say('ButItFailedText');
        return;
      }
      let pick;
      do pick = u.moves[this.random() & 3]; while (!pick || !ok(pick));
      this.useMove(pick);
      yield* this.resetTurn();
    },
    *snore() {
      if (this.user.status & STATUS.SLP) return;
      this.curDamage = 0; this.attackMissed = true;
      yield* failMove(this);
      this.endMoveEffect();
    },
    *spite() {
      const t = this.target;
      const last = t.lastCounterMove;
      if (this.attackMissed || !last || last === 'STRUGGLE') { yield* didntAffect2(this); return; }
      const slot = t.moves.indexOf(last);
      if (slot < 0 || t.pp[slot] === 0) { yield* didntAffect2(this); return; }
      const lose = Math.min(t.pp[slot], (this.random() & 3) + 2);
      t.pp[slot] -= lose;
      if (!t.sub.transformed) t.mon.pp[slot] = t.pp[slot];
      yield* this.animateCurrentMove();
      yield { text: [['text', `${MOVES[last].name}'s PP`], ['line', `was reduced by ${lose}!`], ['prompt']] };
    },
    *painsplit() {
      if (this.attackMissed || this.targetHasSubstitute()) { yield* didntAffect2(this); return; }
      yield* this.animateCurrentMove();
      const [p, e] = this.sides;
      const half = (p.hp + e.hp) >> 1;
      yield* this.setHp(0, Math.min(half, p.maxHp));
      yield* this.setHp(1, Math.min(half, e.maxHp));
      this.curDamage = 0;
      yield this.say('SharedPainText');
    },
    *heal() { yield* this.healUser(); },
    *healmorn() { yield* this.timeBasedHeal(0); },
    *healday() { yield* this.timeBasedHeal(1); },
    *healnite() { yield* this.timeBasedHeal(2); },
    *conversion() {
      const u = this.user;
      const types = u.moves.filter(Boolean).map((m) => BATTLE.types[MOVES[m].type]);
      const fresh = (t) => t !== BATTLE.types.CURSE_TYPE && !u.types.includes(t);
      if (!types.some(fresh)) { yield* fail(this); return; }
      let pick;
      do pick = types[this.random() & 3]; while (pick === undefined || !fresh(pick));
      u.types = [pick, pick];
      yield* this.animateCurrentMove();
      yield { text: [['text', this.fill('<USER>')], ['line', 'transformed into'], ['cont', `${typeName(pick)} type!`], ['prompt']] };
    },
    *conversion2() {
      const u = this.user, t = this.target;
      const last = t.lastCounterMove;
      if (this.attackMissed || !last || BATTLE.types[MOVES[last].type] === BATTLE.types.CURSE_TYPE) { yield* failMove(this); return; }
      const moveType = BATTLE.types[MOVES[last].type];
      yield* this.animateCurrentMove();
      let pick;
      for (;;) {
        pick = this.random() & 31;
        if (pick >= 10 && pick < 20) continue;
        if (pick >= 28) continue;
        if (this.typeMatchupOf(moveType, { types: [pick, pick], sub: {} }, u) < 10) break;
      }
      u.types = [pick, pick];
      yield { text: [['text', this.fill('<USER>')], ['line', 'transformed into'], ['cont', `${typeName(pick)} type!`], ['prompt']] };
    },
    /** BattleCommand_ForceSwitch: Roar and Whirlwind. A wild battle ends; in a trainer battle the other side's next Pokémon is picked at random. */
    *forceswitch() {
      const u = this.user, t = this.target;
      const roar = u.move.name === 'ROAR';
      const succeedWild = function* (self) {
        yield* self.animateCurrentMove();
        yield { wait: 20 };
        yield self.say(roar ? 'FledInFearText' : 'BlownAwayText');
        self.fled = true;
        self.endMoveEffect();
      };
      if (this.attackMissed) { yield* failMove(this); return; }
      const userLevel = u.level, targetLevel = t.level;
      if (this.wild) {
        const [a, b] = [userLevel, targetLevel];                              // a user at least as strong as the target always succeeds
        let ok = a >= b;
        if (!ok) {
          const c = a + b + 1;
          let r;
          do r = this.random(); while (r >= c);
          ok = r >= (b >> 2);
        }
        if (!ok) { yield* failMove(this); return; }
        yield* succeedWild(this);
        return;
      }
      if (this.turn === 0) {                                                  // the player forces the trainer's Pokémon out
        const alive = this.enemyParty.filter((_, i) => i !== this.enemyIndex && this.enemyHp(i) > 0);
        if (!alive.length || !this.enemyGoesFirst) { yield* failMove(this); return; }
        t.mon.hp = t.hp;
        yield* this.animateCurrentMove();
        yield { wait: 20 };
        yield { enemyHudClear: true };
        yield { wait: 20 };
        let r;
        for (;;) {
          r = this.random() & 7;
          if (r >= this.enemyParty.length || r === this.enemyIndex || this.enemyHp(r) === 0) continue;
          break;
        }
        yield* this.enemyEntrance({ offer: false, index: r, quiet: true });
        yield this.say('DraggedOutText');
        yield* this.spikesDamage(1);
        return;
      }
      const current = this.party.indexOf(t.mon);                              // the trainer's Pokémon forces the player's out
      if (!this.party.some((m, i) => i !== current && m.hp > 0) || this.enemyGoesFirst) { yield* failMove(this); return; }
      t.mon.hp = t.hp;
      yield* this.animateCurrentMove();
      yield { wait: 20 };
      yield { hudClear: 0 };
      yield { wait: 20 };
      let r;
      for (;;) {
        r = this.random() & 7;
        if (r >= this.party.length || r === current || this.party[r].hp === 0) continue;
        break;
      }
      yield* this.sendOut(r, { spikes: false });
      this.turn = 0;
      yield this.say('DraggedOutText');
      yield* this.spikesDamage(0);
    },
    *teleport() {
      if (!this.wild || this.turn !== 0) { yield* fail(this); return; }
      yield* this.animateCurrentMove();
      yield this.say('BattleText_GotAwaySafely');
      this.fled = true;
    },
    *movedelay() { yield { wait: 40 }; },
    *switchturn() { this.turn = 1 - this.turn; },
    *endturn() { this.endMoveEffect(); },
    *moveanimnosub() { yield* this.commands.moveanim.call(this); },
    *resettypematchup() {
      const m = this.typeMatchupOf(this.user.move.type, this.target);
      this.typeModifier = (this.typeModifier & 0x80) | 10;
      if (m === 0) this.attackMissed = true;
    },
    *resetstats() {
      for (const s of this.sides) { for (const k of Object.keys(s.stages)) s.stages[k] = BASE_STAGE; this.calcStats(s); }
      yield* this.animateCurrentMove();
      yield this.say('EliminatedStatsText');
    },
    *allstatsup() {
      for (const name of ['attackup', 'defenseup', 'speedup', 'specialattackup', 'specialdefenseup']) {
        this.attackMissed = false;
        yield* C[name].call(this);
        yield* C.statupmessage.call(this);
      }
    },
    *psychup() {
      const [p, e] = this.sides;
      const from = this.turn === 0 ? e : p, to = this.user;
      if (Object.values(from.stages).every((v) => v === BASE_STAGE)) { yield* fail(this); return; }
      Object.assign(to.stages, from.stages);
      this.calcStats(to);
      yield* this.animateCurrentMove();
      yield this.say('CopiedStatsText');
    },
    *belly_drum() {},
    *bellydrum() {
      const u = this.user;
      this.loweredStat = 0x10;
      yield* C.attackup2.call(this);
      if (this.attackMissed || u.hp < (u.maxHp >> 1)) { yield* fail(this); return; }
      yield* this.animateCurrentMove();
      yield* this.setHp(this.turn, u.hp - (u.maxHp >> 1));
      u.stages.atk = 13; this.calcStats(u);
      yield this.say('BellyDrumText');
    },
    *healbell() {
      for (const mon of this.party) mon.status = 0;
      this.setStatus(this.sides[0], 0);
      yield* this.animateCurrentMove();
      yield this.say('BellChimedText');
    },
    *defrost() {
      const u = this.user;
      if (u.status & STATUS.FRZ) { this.setStatus(u, 0); yield this.say('WasDefrostedText'); }
    },
    *defrostopponent() {
      yield* this.animateCurrentMove();
      yield* this.defrostTarget();
      this.loweredStat = 0;
      yield* C.attackup.call(this);
      yield* C.statupmessage.call(this);
    },
    *falseswipe() { this.falseSwipe(); },
    *clearhazards() {
      const u = this.user;
      if (u.sub.leechSeed) { u.sub.leechSeed = false; }
      if (u.screens.spikes) { u.screens.spikes = false; }
      yield* [];
    },
    *thunderaccuracy() {
      const m = this.user.move;
      if (this.weather === 1) m.accuracy = 255;                          // sunny: 50% (rain: never misses)
      else if (this.weather === 2) m.accuracy = 127;
    },
    *fakeout() {
      if (this.attackMissed) return;
      if (this.user.turnsTaken !== 1) { this.attackMissed = true; this.curDamage = 0; yield* failMove(this); this.endMoveEffect(); }
    },
  });

  Object.assign(Battle.prototype, {
    /** The damage the opponent's Counter/Mirror Coat answers: what the user took last (wPlayerDamageTaken). */
    curDamageTaken(side) { return side.damageTaken ?? 0; },

    /** BattleCheckTypeMatchup: the chart multiplier (10 = x1, 0 = immune) of a move type against a defender. */
    typeMatchupOf(moveType, defender, attacker = null) {
      let matchup = 10;
      const rows = [...BATTLE.matchups, ...(defender.sub?.identified ? [] : BATTLE.foresight)];
      for (const [atk, def, mul] of rows) if (atk === moveType && defender.types.includes(def)) matchup = Math.floor((matchup * mul) / 10);
      return matchup;
    },

    /** ProtectChance: each consecutive use halves the odds; fails if the user went second or has a substitute. */
    *protectChance() {
      const u = this.user;
      const failed = () => { u.protectCount = 0; return this.animateFailedMove(); };
      if (opponentWentFirst(this) || u.sub.substitute) { yield* failed(); yield this.say('ButItFailedText'); return false; }
      let b = 0xff;
      for (let c = u.protectCount ?? 0; c > 0; c--) { b >>= 1; if (b === 0) { yield* failed(); yield this.say('ButItFailedText'); return false; } }
      let r;
      do r = this.random(); while (r === 0);
      if (r - 1 >= b) { yield* failed(); yield this.say('ButItFailedText'); return false; }
      u.protectCount = (u.protectCount ?? 0) + 1;
      return true;
    },

    /** BattleCommand_Heal: Recover and friends heal half, Rest sleeps and heals everything. */
    *healUser() {
      const u = this.user, move = u.move.name;
      if (u.hp === u.maxHp) { yield* this.animateFailedMove(); yield this.say('HPIsFullText'); return; }
      let amount = u.maxHp >> 1;
      if (move === 'REST') {
        yield { wait: 40 };
        u.sub.toxic = false;
        const had = u.status !== 0;
        this.setStatus(u, 3);                                              // REST_SLEEP_TURNS + 1
        yield this.say(had ? 'RestedText' : 'WentToSleepText');
        this.calcStats(u);
        amount = u.maxHp;
      }
      yield* this.animateCurrentMove();
      yield* this.setHp(this.turn, u.hp + amount);
      yield this.say('RegainedHealthText');
    },

    /** Morning Sun / Synthesis / Moonlight: half, full or a quarter of the max HP by the time of day (and weather). */
    *timeBasedHeal(time) {
      const u = this.user;
      if (u.hp === u.maxHp) { yield* this.animateFailedMove(); yield this.say('HPIsFullText'); return; }
      const tod = this.timeOfDay ?? 1;
      let amount = tod === time ? u.maxHp : u.maxHp >> 1;
      if (this.weather === 2) amount = u.maxHp; else if (this.weather === 1 || this.weather === 3) amount = u.maxHp >> 2;
      yield* this.animateCurrentMove();
      yield* this.setHp(this.turn, u.hp + amount);
      yield this.say('RegainedHealthText');
    },
  });
}

const TYPE_NAMES = Object.fromEntries(Object.entries(BATTLE.types).map(([k, v]) => [v, k.replace('_TYPE', '').replace('PSYCHIC', 'PSYCHIC')]));
const typeName = (t) => TYPE_NAMES[t] ?? '???';
