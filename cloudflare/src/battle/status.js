// Status and side-effect commands of engine/battle/effect_commands.asm: EffectChance, the status inflicting commands, draining, recoil,
// multi-hit loops, charging, OHKO and fixed damage. They extend Battle.prototype.commands (see battle.js).
import { BATTLE } from '../generated/battle-data.js';
import { MOVES } from '../generated/moves.js';
import { ITEMS } from '../generated/items.js';

export function installStatus(Battle, STATUS) {
const percent = (n) => Math.floor((n * 255) / 100);
const heldEffect = (side) => (side.item ? ITEMS[side.item].hold : 'HELD_NONE');

Object.assign(Battle.prototype, {
  /** Status changes also go to the party Pokémon (UpdateOpponentInParty / UpdateUserInParty). */
  setStatus(side, value) { side.status = value; side.mon.status = value; },

  /** CheckSubstituteOpp */
  targetHasSubstitute() { return Boolean(this.target.sub.substitute); },

  /** AI-controlled users fail a status move 25% of the time unless the player is locked on. */
  aiRandomFail() {
    return this.turn !== 0 && !this.sides[0].sub.lockOn && this.random() < percent(25) + 1;
  },

  *animateFailedMove() { yield { wait: 40 }; },
  *animateCurrentMove() { yield { anim: this.user.move.name, user: this.turn, frames: 60 }; },
  *playOpponentAnim(name) { yield { anim: name, user: 1 - this.turn, frames: 30 }; },

  /** UseHeldStatusHealingItem: berries that cure the status just inflicted are not ported yet. */
  *useHeldStatusHealingItem(side) {
    if (/^HELD_HEAL_/.test(heldEffect(side))) this.unported.add(`held status-healing item ${side.item}`);
  },

  /** An HP change of `side` (0 player, 1 enemy) with its bar animation. */
  *setHp(side, hp) {
    const s = this.sides[side], from = s.hp;
    s.hp = Math.max(0, Math.min(s.maxHp, hp));
    s.mon.hp = s.hp;
    yield { hp: side, from, to: s.hp };
  },
});

const missPrint = function* (self, label) { yield* self.animateFailedMove(); yield self.say(label); };

Object.assign(Battle.prototype.commands, {
  /** The secondary effect happens when a roll is below the move's chance (and the target has no substitute). */
  *effectchance() {
    this.effectFailed = false;
    if (this.targetHasSubstitute() || !(this.random() < this.user.move.chance)) this.effectFailed = true;
  },

  *checksafeguard() {
    if (!this.target.screens.safeguard) return;
    this.attackMissed = true;
    yield { wait: 40 };
    yield this.say('SafeguardProtectText');
    this.endMoveEffect();
  },

  *sleeptarget() {
    const t = this.target;
    if (heldEffect(t) === 'HELD_PREVENT_SLEEP') { yield* missPrint(this, 'ProtectedByText'); return; }
    if (t.status & STATUS.SLP) { yield* missPrint(this, 'AlreadyAsleepText'); return; }
    if (this.attackMissed) { yield* missPrint(this, 'DidntAffect1Text'); return; }
    if (this.aiRandomFail()) { yield* missPrint(this, 'DidntAffect1Text'); return; }
    if (t.status !== 0 || this.targetHasSubstitute()) { yield* missPrint(this, 'DidntAffect1Text'); return; }
    yield* this.animateCurrentMove();
    let turns;
    do turns = this.random() & 7; while (turns === 0 || turns === 7);
    this.setStatus(t, turns + 1);
    yield this.say('FellAsleepText');
    yield* this.useHeldStatusHealingItem(t);
    if (!(t.status & STATUS.SLP)) this.endMoveEffect();            // a berry woke it up at once: OpponentCantMove
  },

  *poisontarget() {
    const t = this.target;
    if (this.targetHasSubstitute() || t.status !== 0 || (this.typeModifier & 0x7f) === 0) return;
    if (t.types.includes(BATTLE.types.POISON) || heldEffect(t) === 'HELD_PREVENT_POISON' || this.effectFailed || t.screens.safeguard) return;
    this.setStatus(t, t.status | STATUS.PSN);
    yield* this.playOpponentAnim('PSN');
    yield this.say('WasPoisonedText');
    yield* this.useHeldStatusHealingItem(t);
  },

  *poison() {
    const t = this.target;
    let label;
    if ((this.typeModifier & 0x7f) === 0) label = 'DoesntAffectText';
    else if (t.types.includes(BATTLE.types.POISON)) label = 'DoesntAffectText';
    else if (t.status & STATUS.PSN) label = 'AlreadyPoisonedText';
    else if (heldEffect(t) === 'HELD_PREVENT_POISON') label = 'ProtectedByText';
    else if (t.status !== 0) label = 'DidntAffect1Text';
    else if (this.aiRandomFail() || this.targetHasSubstitute() || this.attackMissed) label = 'DidntAffect1Text';
    if (label) { yield* missPrint(this, label); return; }
    const toxic = this.user.move.effect === 'EFFECT_TOXIC';
    yield* this.animateCurrentMove();
    this.setStatus(t, t.status | STATUS.PSN);
    if (toxic) { t.sub.toxic = true; t.toxicCount = 0; }
    yield this.say(toxic ? 'BadlyPoisonedText' : 'WasPoisonedText');
    yield* this.useHeldStatusHealingItem(t);
  },

  *burntarget() {
    const t = this.target;
    if (this.targetHasSubstitute()) return;
    if (t.status !== 0) { if (t.status & STATUS.FRZ) yield* this.defrostTarget(); return; }
    if ((this.typeModifier & 0x7f) === 0 || this.matchesTargetType() || heldEffect(t) === 'HELD_PREVENT_BURN' || this.effectFailed || t.screens.safeguard) return;
    this.setStatus(t, STATUS.BRN);
    this.calcStats(t);
    yield* this.playOpponentAnim('BRN');
    yield this.say('WasBurnedText');
    yield* this.useHeldStatusHealingItem(t);
  },

  *freezetarget() {
    const t = this.target;
    if (this.targetHasSubstitute() || t.status !== 0 || (this.typeModifier & 0x7f) === 0 || this.weather === 2 || this.matchesTargetType()) return;
    if (heldEffect(t) === 'HELD_PREVENT_FREEZE' || this.effectFailed || t.screens.safeguard) return;
    this.setStatus(t, STATUS.FRZ);
    yield* this.playOpponentAnim('FRZ');
    yield this.say('WasFrozenText');
    yield* this.useHeldStatusHealingItem(t);
    if (t.status & STATUS.FRZ) { t.sub.recharge = false; t.justGotFrozen = true; }
  },

  *paralyzetarget() {
    const t = this.target;
    if (this.targetHasSubstitute() || t.status !== 0 || (this.typeModifier & 0x7f) === 0) return;
    if (heldEffect(t) === 'HELD_PREVENT_PARALYZE' || this.effectFailed || t.screens.safeguard) return;
    this.setStatus(t, STATUS.PAR);
    this.calcStats(t);
    yield* this.playOpponentAnim('PAR');
    yield this.say('ParalyzedText');
    yield* this.useHeldStatusHealingItem(t);
  },

  *paralyze() {
    const t = this.target;
    if (t.status & STATUS.PAR) { yield* missPrint(this, 'AlreadyParalyzedText'); return; }
    if ((this.typeModifier & 0x7f) === 0) { yield* missPrint(this, 'DoesntAffectText'); return; }
    if (heldEffect(t) === 'HELD_PREVENT_PARALYZE') { yield* missPrint(this, 'ProtectedByText'); return; }
    if (this.aiRandomFail() || t.status !== 0 || this.attackMissed || this.targetHasSubstitute()) { yield { wait: 40 }; yield this.say('DidntAffect1Text'); return; }
    yield { wait: 30 };
    yield* this.animateCurrentMove();
    this.setStatus(t, t.status | STATUS.PAR);
    this.calcStats(t);
    yield this.say('ParalyzedText');
    yield* this.useHeldStatusHealingItem(t);
  },

  *confusetarget() {
    const t = this.target;
    if (heldEffect(t) === 'HELD_PREVENT_CONFUSE' || this.effectFailed || t.screens.safeguard || this.targetHasSubstitute() || t.sub.confused) return;
    yield* this.finishConfusing();
  },

  *confuse() {
    const t = this.target;
    if (heldEffect(t) === 'HELD_PREVENT_CONFUSE') { yield* this.animateFailedMove(); yield this.say('ProtectedByText'); return; }
    if (t.sub.confused) { yield* this.animateFailedMove(); yield this.say('AlreadyConfusedText'); return; }
    if (this.targetHasSubstitute() || this.attackMissed) {
      if (!['EFFECT_CONFUSE_HIT', 'EFFECT_SNORE', 'EFFECT_SWAGGER'].includes(this.user.move.effect)) { yield* this.animateFailedMove(); yield this.say('DidntAffect1Text'); }
      return;
    }
    yield* this.finishConfusing();
  },

  *flinchtarget() {
    const t = this.target;
    if (this.targetHasSubstitute() || (t.status & (STATUS.FRZ | STATUS.SLP))) return;
    if (this.enemyGoesFirst === (this.turn === 0)) return;          // CheckOpponentWentFirst
    if (this.effectFailed) return;
    t.sub.flinched = true;
    t.sub.recharge = false;
  },

  *draintarget() { yield* this.sapHealth(); yield this.say('SuckedHealthText'); },
  *eatdream() { yield* this.sapHealth(); yield this.say('DreamEatenText'); },

  *recoil() {
    const u = this.user;
    const recoil = Math.max(1, this.curDamage >> 2);
    yield* this.setHp(this.turn, u.hp - recoil);
    yield this.say('RecoilText');
  },

  *clearmissdamage() { if (this.attackMissed) this.curDamage = 0; },

  *startloop() { this.user.rolloutCount = 0; },
  *supereffectivelooptext() { if (!this.user.sub.inLoop) yield* this.commands.supereffectivetext.call(this); },
  *cleartext() {},
  *endloop() {
    const u = this.user, move = u.move.effect;
    if (!u.sub.inLoop) {
      u.sub.inLoop = true;
      if (move === 'EFFECT_POISON_MULTI_HIT' || move === 'EFFECT_DOUBLE_HIT') { u.rolloutCount = 1; this.hitCount = 2; this.loopBackToCritical(); return; }
      if (move === 'EFFECT_BEAT_UP') {
        if (this.turn !== 0 || this.party.length === 1) { u.sub.inLoop = false; yield* this.commands.beatupfailtext.call(this); this.endMoveEffect(); return; }
        u.rolloutCount = this.party.length - 1; this.hitCount = this.party.length; this.loopBackToCritical(); return;
      }
      if (move === 'EFFECT_TRIPLE_KICK') {
        let r;
        do r = this.random() & 3; while (r === 0);
        r -= 1;
        if (r === 0) { this.hitCount = 1; u.sub.inLoop = false; yield* this.hitTimesText(); return; }
        u.rolloutCount = r; this.hitCount = r + 1; this.loopBackToCritical(); return;
      }
      let n = this.random() & 3;                                     // 2, 3, 4 or 5 hits, 3 and 4 half as likely
      if (n >= 2) n = this.random() & 3;
      n += 1;
      u.rolloutCount = n; this.hitCount = n + 1; this.loopBackToCritical(); return;
    }
    if (--u.rolloutCount !== 0) { this.loopBackToCritical(); return; }
    u.sub.inLoop = false;
    yield* this.hitTimesText();
  },

  *selfdestruct() {
    const u = this.user;
    this.setStatus(u, 0);
    u.sub.leechSeed = false;
    this.target.sub.destinyBond = false;
    yield { anim: u.move.name, user: this.turn, frames: 60 };
    yield* this.setHp(this.turn, 0);                                  // the move's own HP loss: the user faints
  },

  *ohko() {
    this.curDamage = 0;
    const u = this.user, t = this.target;
    if ((this.typeModifier & 0x7f) === 0) { this.critical = 0xff; this.attackMissed = true; return; }
    const diff = u.level - t.level;
    if (diff < 0) { this.critical = 0xff; this.attackMissed = true; return; }
    u.move.accuracy = Math.min(0xff, u.move.accuracy + diff * 2);
    yield* this.commands.checkhit.call(this);
    this.curDamage = 0xffff;
    this.critical = 2;
  },

  *constantdamage() {
    const u = this.user, t = this.target, move = u.move.effect;
    let damage;
    if (move === 'EFFECT_LEVEL_DAMAGE') damage = u.level;
    else if (move === 'EFFECT_PSYWAVE') {
      const max = u.level + (u.level >> 1);
      do damage = this.random(); while (damage === 0 || damage >= max);
    } else if (move === 'EFFECT_SUPER_FANG') damage = Math.max(1, t.hp >> 1);
    else if (move === 'EFFECT_REVERSAL') {                              // Flail/Reversal: the power by the user's HP bar pixels
      let px = Math.floor((u.hp * 48) / u.maxHp);
      if (u.maxHp > 255) px = Math.floor(((u.hp * 48) >> 2) / ((u.maxHp >> 2) & 0xff || 1));
      u.move.power = BATTLE.flailPower.find(([limit]) => limit >= px)[1];
      yield* this.commands.damagestats.call(this);
      yield* this.commands.damagecalc.call(this);
      u.move.power = 1;
      return;
    }
    else damage = u.move.power;                                       // Sonicboom, Dragon Rage: the power is the damage
    this.curDamage = damage;
  },

  *checkcharge() {
    const u = this.user;
    if (!u.sub.charged) return;
    u.sub.charged = false; u.sub.underground = false; u.sub.flying = false;
    this.skipTo('charge');
  },
  *charge() {
    const u = this.user;
    if (u.status & STATUS.SLP) { yield { wait: 40 }; yield this.say('ButItFailedText'); this.endMoveEffect(); return; }
    u.sub.charged = true;
    const anim = u.move.name;
    yield { anim, user: this.turn, frames: 60 };
    if (anim === 'FLY') u.sub.flying = true;
    if (anim === 'DIG') u.sub.underground = true;
    this.curDamage = 0;
    const text = { RAZOR_WIND: '_BattleMadeWhirlwindText', SOLARBEAM: '_BattleTookSunlightText', SKULL_BASH: '_BattleLoweredHeadText', SKY_ATTACK: '_BattleGlowingText', FLY: '_BattleFlewText', DIG: '_BattleDugText' }[anim];
    yield { text: [['text', this.fill('<USER>')], ...this.say(text).text] };
    if (u.move.effect === 'EFFECT_SKULL_BASH') this.skipTo('endturn'); else this.endMoveEffect();
  },
  *skipsuncharge() { if (this.weather === 2) { this.user.sub.charged = true; } },

  *rechargenextturn() { this.user.sub.recharge = true; },
  *tristatuschance() {
    yield* this.commands.effectchance.call(this);
    let r;
    do r = (this.random() >> 4) & 3; while (r === 0);
    yield* [this.commands.paralyzetarget, this.commands.freezetarget, this.commands.burntarget][r - 1].call(this);
  },
});

Object.assign(Battle.prototype, {
  /** CheckMoveTypeMatchesTarget: a Normal move never matches (Tri Attack). */
  matchesTargetType() {
    const type = this.user.move.type;
    return type !== BATTLE.types.NORMAL && this.target.types.includes(type);
  },

  *defrostTarget() {
    const t = this.target;
    if (!(t.status & STATUS.FRZ)) return;
    this.setStatus(t, 0);
    yield this.say('DefrostedOpponentText');
  },

  *finishConfusing() {
    const t = this.target;
    t.sub.confused = true;
    t.confuseCount = (this.random() & 3) + 2;
    if (!['EFFECT_CONFUSE_HIT', 'EFFECT_SNORE', 'EFFECT_SWAGGER'].includes(this.user.move.effect)) yield* this.animateCurrentMove();
    yield* this.playOpponentAnim('CONFUSED');
    yield this.say('BecameConfusedText');
    if (['HELD_HEAL_STATUS', 'HELD_HEAL_CONFUSION'].includes(heldEffect(t))) this.unported.add(`held confusion-healing item ${t.item}`);
  },

  *hitTimesText() {
    if (this.user.move.effect === 'EFFECT_BEAT_UP') return;
    yield { text: [['text', `Hit ${this.hitCount} times!`], ['prompt']] };
  },

  /** SapHealth: the user regains half the damage done (at least 1 HP). */
  *sapHealth() {
    const u = this.user;
    yield* this.setHp(this.turn, u.hp + Math.max(1, this.curDamage >> 1));
  },
});
}
