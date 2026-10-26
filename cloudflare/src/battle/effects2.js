// More move effects (engine/battle/move_effects/*.asm): trapping, rampage, Bide, Rage, Substitute, Curse, Encore, Disable, Sketch, Mimic,
// Thief, Pursuit, Rollout, Fury Cutter, Pay Day, Triple Kick, Future Sight. Installed by battle.js.
import { BATTLE } from '../generated/battle-data.js';
import { MOVES } from '../generated/moves.js';
import { ITEMS } from '../generated/items.js';
import { POKEMON } from '../generated/pokemon.js';

const double = (v) => Math.min(0xffff, v * 2);

export function installEffects2(Battle, STATUS) {
  const C = Battle.prototype.commands;
  const failMove = function* (self) { yield* self.animateFailedMove(); yield self.say(self.target.sub.protect ? 'ItFailedText' : 'ButItFailedText'); };
  const didntAffect2 = function* (self) { yield* self.animateFailedMove(); yield self.say('DidntAffect1Text'); };
  const opponentWentFirst = (self) => (Number(self.enemyGoesFirst) ^ self.turn) !== 0;
  const TRAPS = { BIND: 'UsedBindText', WRAP: 'WrappedByText', FIRE_SPIN: 'FireSpinTrapText', CLAMP: 'ClampedByText', WHIRLPOOL: 'WhirlpoolTrapText' };

  Object.assign(C, {
    *traptarget() {
      const t = this.target, u = this.user;
      if (this.attackMissed || t.wrapCount || t.sub.substitute) return;
      t.wrapCount = (this.random() & 3) + 3;                              // trapped for 2-5 turns
      t.trappingMove = u.move.name;
      yield this.say(TRAPS[u.move.name]);
    },
    *arenatrap() {
      const t = this.target;
      const u = this.user;
      if (this.targetHidden() || u.sub.cantRun) { yield* this.animateFailedMove(); yield this.say('ButItFailedText'); return; }
      u.sub.cantRun = true;                                              // SUBSTATUS5 of the user: the opponent cannot flee
      yield* this.animateCurrentMove();
      yield this.say('CantEscapeNowText');
    },

    *checkrampage() {
      const u = this.user;
      if (!u.sub.rampage) return;
      if (--u.rolloutCount === 0) {
        u.sub.rampage = false;
        if (!this.sides[1 - this.turn].screens.safeguard) { u.sub.confused = true; u.confuseCount = (this.random() & 1) + 2; }
      }
      this.skipTo('rampage');
    },
    *rampage() {
      const u = this.user;
      if (u.status & STATUS.SLP) return;
      u.sub.rampage = true;
      u.rolloutCount = (this.random() & 1) + 1;
      this.someoneIsRampaging = true;
    },

    *storeenergy() {
      const u = this.user;
      if (!u.sub.bide) return;
      if (--u.rolloutCount !== 0) { yield this.say('StoringEnergyText'); this.endMoveEffect(); return; }
      u.sub.bide = false;
      yield this.say('UnleashedEnergyText');
      u.move.power = 1;
      const taken = u.damageTaken ?? 0;
      this.curDamage = Math.min(0xffff, taken * 2);
      if (this.curDamage === 0) this.attackMissed = true;
      u.damageTaken = 0;
      u.charging = false;
      u.move.name = 'BIDE';
      this.skipTo('unleashenergy');
    },
    *unleashenergy() {
      const u = this.user;
      u.sub.bide = true;
      u.damageTaken = 0;
      u.move.effect = 'EFFECT_NORMAL_HIT';
      u.rolloutCount = (this.random() & 1) + 2;
      yield* this.animateCurrentMove();
      this.endMoveEffect();
    },
    *bidefailtext() {
      if (!this.attackMissed) return;
      if ((this.typeModifier & 0x7f) === 0) yield this.say('DoesntAffectText'); else yield this.say('ButItFailedText');
    },

    *rage() { this.user.sub.rage = true; },
    *ragedamage() {
      const u = this.user;
      let d = this.curDamage;
      for (let i = u.rageCounter ?? 0; i > 0; i--) { d += this.curDamage; if (d > 0xffff) { d = 0xffff; break; } }
      this.curDamage = d;
    },
    *buildopponentrage() {
      const t = this.target;
      if (this.attackMissed || !t.sub.rage) return;
      if ((t.rageCounter ?? 0) >= 255) return;
      t.rageCounter = (t.rageCounter ?? 0) + 1;
      const saved = this.turn; this.turn = 1 - this.turn;
      yield this.say('RageBuildingText');
      this.turn = saved;
    },

    *substitute() {
      const u = this.user;
      yield { wait: 40 };
      if (u.sub.substitute) { yield this.say('HasSubstituteText'); return; }
      const cost = Math.floor(u.maxHp / 4);
      if (u.hp <= cost || cost === 0 && u.hp <= 0) { yield this.say('TooWeakSubText'); return; }
      u.sub.substitute = cost;                                          // wSubstituteHP
      yield* this.setHp(this.turn, u.hp - cost);
      u.wrapCount = 0;
      yield this.say('MadeSubstituteText');
    },
    *lowersubnoanim() {}, *raisesubnoanim() {},

    *curse() {
      const u = this.user, t = this.target;
      if (u.types.includes(BATTLE.types.GHOST)) {
        if (this.targetHidden() || this.targetHasSubstitute() || t.sub.curse) { yield* this.animateFailedMove(); yield this.say('ButItFailedText'); return; }
        t.sub.curse = true;
        yield* this.animateCurrentMove();
        yield* this.setHp(this.turn, u.hp - Math.max(1, u.maxHp >> 1));
        yield this.say('PutACurseText');
        return;
      }
      if (u.stages.atk >= 13 && u.stages.def >= 13) {
        yield* this.animateFailedMove();
        yield { text: [['text', this.fill("<USER>'s")], ['line', 'ABILITY'], ['text', " won't"], ['cont', 'rise anymore!'], ['prompt']] };
        return;
      }
      yield* this.animateCurrentMove();
      this.loweredStat = 2;                                              // SPEED down
      this.attackMissed = false;
      this.lowerStatNoChecks(u, 'spd');
      this.failedMessage = 0;
      yield* C.statdownmessage.call(this);
      this.attackMissed = false; this.loweredStat = 0;
      yield* C.attackup.call(this);
      yield* C.statupmessage.call(this);
      this.attackMissed = false;
      this.loweredStat = 1;
      yield* C.defenseup.call(this);
      yield* C.statupmessage.call(this);
    },

    *encore() {
      const t = this.target, last = t.lastMove;
      if (!last || ['STRUGGLE', 'ENCORE', 'MIRROR_MOVE'].includes(last) || this.attackMissed || t.sub.encored) { yield* didntAffect2(this); return; }
      const slot = t.moves.indexOf(last);
      if (slot < 0 || t.pp[slot] === 0) { yield* didntAffect2(this); return; }
      t.sub.encored = true;
      t.encoreCount = (this.random() & 3) + 3;
      if (!opponentWentFirst(this)) {                                    // the target has not moved yet: its move is replaced now
        t.curMove = last; t.curMoveNum = slot;
        this.loadMove(1 - this.turn);
      }
      yield* this.animateCurrentMove();
      yield this.say('GotAnEncoreText');
    },
    *disable() {
      const t = this.target, last = t.lastCounterMove;
      if (this.attackMissed || t.disableCount || !last || last === 'STRUGGLE') { yield* failMove(this); return; }
      const slot = t.moves.indexOf(last);
      if (slot < 0 || t.pp[slot] === 0) { yield* failMove(this); return; }
      let n;
      do n = this.random() & 7; while (n === 0);
      t.disableCount = ((slot + 1) << 4) + n + 1;
      t.disabledMove = last;
      yield* this.animateCurrentMove();
      yield { text: [['text', this.fill('<TARGET>'), ''], ['line', `${MOVES[last].name}`], ['text', ' was'], ['cont', 'disabled!'], ['prompt']].map((c) => c.filter((x) => x !== '')) };
    },
    *mimic() {
      const u = this.user, t = this.target;
      u.lastCounterMove = null; u.lastMove = null;
      yield { wait: 40 };
      const last = t.lastCounterMove;
      if (this.attackMissed || this.targetHidden() || !last || last === 'STRUGGLE' || u.moves.includes(last)) { yield* failMove(this); return; }
      const slot = u.moves.indexOf('MIMIC');
      u.moves[slot] = last; u.pp[slot] = 5;
      yield* this.animateCurrentMove();
      yield { text: [['text', this.fill('<USER>')], ['line', 'learned'], ['cont', `${MOVES[last].name}!`], ['prompt']] };
    },
    *sketch() {
      const u = this.user, t = this.target;
      u.lastCounterMove = null; u.lastMove = null;
      const last = t.lastCounterMove;
      if (this.targetHasSubstitute() || t.sub.transformed || !last || last === 'STRUGGLE' || u.moves.includes(last)) { yield* this.animateFailedMove(); yield this.say('DidntAffect1Text'); return; }
      const slot = u.moves.indexOf('SKETCH');
      u.moves[slot] = last; u.pp[slot] = MOVES[last].pp;
      u.mon.moves[slot] = last; u.mon.pp[slot] = MOVES[last].pp;          // the replacement is permanent
      yield* this.animateCurrentMove();
      yield { text: [['text', this.fill('<USER>')], ['line', 'SKETCHED'], ['cont', `${MOVES[last].name}!`], ['prompt']] };
    },
    *thief() {
      const u = this.user, t = this.target;
      if (u.item || !t.item || t.item.endsWith('MAIL') || this.effectFailed) return;
      if (this.turn === 0 && !this.wild) { /* trainer Pokémon items are stolen too */ }
      const item = t.item;
      t.item = null; if (this.turn === 0 && this.wild) { /* a wild Pokémon's held item is not removed from its party data */ } else t.mon.item = null;
      u.item = item; u.mon.item = item;
      yield { text: [['text', this.fill('<USER>')], ['line', 'stole'], ['cont', `${ITEMS[item].name}!`], ['prompt']] };
    },
    *pursuit() { if (this.target.isSwitching) this.curDamage = double(this.curDamage); },
    *clearhazards() {
      const u = this.user;
      if (u.sub.leechSeed) { u.sub.leechSeed = false; yield this.say('ShedLeechSeedText'); }
      if (u.screens.spikes) { u.screens.spikes = false; yield this.say('BlewSpikesText'); }
      if (u.wrapCount) { u.wrapCount = 0; yield this.say('ReleasedByText'); }
    },

    *checkrollout() {
      const u = this.user;
      if (u.sub.rollout) this.skipTo('doturn'); else u.rolloutCount = 0;
    },
    *rolloutpower() {
      const u = this.user;
      if (u.status & STATUS.SLP) return;
      if (!u.rolloutCount) this.someoneIsRampaging = true;
      if (this.attackMissed) { u.sub.rollout = false; return; }
      u.rolloutCount++;
      let b = u.rolloutCount;
      u.sub.rollout = b < 5;
      if (u.sub.curled) b++;
      for (b--; b > 0; b--) this.curDamage = double(this.curDamage);
    },
    *furycutter() {
      const u = this.user;
      if (this.attackMissed) { u.furyCutterCount = 0; return; }
      u.furyCutterCount = (u.furyCutterCount ?? 0) + 1;
      let b = Math.min(u.furyCutterCount, 5);
      for (b--; b > 0; b--) this.curDamage = double(this.curDamage);
    },
    *payday() {
      const u = this.user;
      this.payDayMoney = (this.payDayMoney ?? 0) + u.level * 2;
      yield this.say('CoinsScatteredText');
    },
    *triplekick() {
      const u = this.user;
      this.curDamage = this.curDamage * (this.kickCount ?? 1);            // the power grows with each kick (the loop counts them)
    },
    *kickcounter() {},
    *beatup() {
      this.curDamage = 0;
      const u = this.user, t = this.target;
      if (this.turn !== 0) {                                              // a wild Pokémon beats up alone: a plain attack
        yield { text: [['text', `${u.name}'s`], ['line', 'attack!'], ['prompt']] };
        yield* C.damagestats.call(this);
        return;
      }
      if (!u.sub.inLoop) { u.rolloutCount = 0; this.beatUpIndex = 0; this.beatUpHit = false; yield { wait: 20 }; }
      else this.beatUpIndex = this.party.length - u.rolloutCount;
      const mon = this.party[this.beatUpIndex];
      const status = mon === u.mon ? u.status : mon.status;
      if (!mon.hp || status) { this.skipTo('buildopponentrage'); return; }
      this.beatUpHit = true;
      yield { text: [['text', `${mon.nickname ?? POKEMON[mon.species].name}'s`], ['line', 'attack!'], ['prompt']] };
      this.power = u.move.power;
      this.damageInput = { attack: POKEMON[mon.species].stats.atk, defense: POKEMON[t.species].stats.def, level: mon.level };
    },
    *beatupfailtext() { if (!this.beatUpHit) yield this.say('ButItFailedText'); },
    *batonpass() {
      const u = this.user;
      if (this.turn !== 0 || !this.party.some((m) => m.hp > 0 && m !== u.mon)) { yield* this.animateFailedMove(); yield this.say('ButItFailedText'); return; }   // wild and trainer Pokémon cannot (yet) pass
      yield* this.animateCurrentMove();
      yield { wait: 50 };
      const pick = yield { ask: 'party', forced: true };
      const old = this.sides[0];
      yield* this.sendOut(pick);
      const next = this.sides[0];
      Object.assign(next.stages, old.stages);
      for (const [k, v] of Object.entries(old.sub)) if (v && !['nightmare', 'inLove', 'transformed', 'encored'].includes(k)) next.sub[k] = v;
      if (!(old.status & STATUS.SLP)) next.sub.nightmare = false;
      next.disableCount = 0; next.disabledMove = null;
      next.lastMove = null;
      this.sides.forEach((s) => { s.wrapCount = 0; });
      this.calcStats(next);
      this.endMoveEffect();
    },
    *transform() {
      const u = this.user, t = this.target;
      u.lastCounterMove = null; u.lastMove = null;
      if (t.sub.transformed || this.targetHidden()) { yield* this.animateFailedMove(); yield this.say('ButItFailedText'); return; }
      u.sub.transformed = true;
      u.disableCount = 0; u.disabledMove = null;
      if (this.turn === 0) u.curMoveNum = 0;
      u.transformedSpecies = t.species;
      u.species = t.species;
      u.types = [...t.types];
      u.moves = [...t.moves];
      u.pp = t.moves.map((m) => (!m ? 0 : m === 'SKETCH' ? 1 : 5));
      u.dvs = t.dvs ?? t.mon.dvs;
      u.base = { ...t.base };
      Object.assign(u.stages, t.stages);
      this.calcStats(u);
      yield { wait: 40 };
      yield { text: [['text', this.fill('<USER>')], ['line', 'TRANSFORMED into'], ['cont', `${t.name}!`], ['prompt']] };
    },
    *checkfuturesight() {
      const u = this.user;
      if (u.futureSightCount !== 1) return;
      u.futureSightCount = 0;
      this.curDamage = u.futureSightDamage;
      this.skipTo('futuresight');
    },
    *futuresight() {
      const u = this.user;
      if (u.futureSightCount) { this.curDamage = 0; yield* this.animateFailedMove(); yield this.say('ButItFailedText'); this.endMoveEffect(); return; }
      if (!u.charging) { u.lastCounterMove = u.move.name; u.lastMove = u.move.name; }
      u.futureSightCount = 4;
      yield { wait: 40 };
      yield this.say('ForesawAttackText');
      u.futureSightDamage = this.curDamage;
      this.curDamage = 0;
      this.endMoveEffect();
    },
  });

  Battle.prototype.lowerStatNoChecks = function lowerStatNoChecks(side, key) {
    side.stages[key] = Math.max(1, side.stages[key] - 1);
    this.calcStats(side);
  };

  /** CheckPlayerLockedIn / CheckEnemyLockedIn: a recharge, charge, rampage, bide or rollout repeats the move without asking. */
  Battle.prototype.isLockedIn = function isLockedIn(t) {
    const s = this.sides[t];
    return Boolean(s.sub.recharge || s.sub.charged || s.sub.rampage || s.sub.bide || s.sub.rollout);
  };
}
