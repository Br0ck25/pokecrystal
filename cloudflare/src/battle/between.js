// ResidualDamage and HandleBetweenTurnEffects (engine/battle/core.asm): poison, burn, Leech Seed, weather, wrapping, Perish Song,
// Leftovers, thawing, Safeguard and the screens counting down. Installed on Battle.prototype by battle.js.
import { BATTLE } from '../generated/battle-data.js';
import { MOVES } from '../generated/moves.js';
import { ITEMS } from '../generated/items.js';

const percent = (n) => Math.floor((n * 255) / 100);
const eighth = (max) => Math.max(1, (max >> 2) >> 1);
const sixteenth = (max) => Math.max(1, (max >> 2) >> 2);
const quarter = (max) => Math.max(1, max >> 2);

export function installBetween(Battle, STATUS) {
  Object.assign(Battle.prototype, {
    /** SubtractHPFromUser for `side`, with the HP bar. */
    *loseHp(side, amount) { yield* this.setHp(side, this.sides[side].hp - amount); },

    /** ResidualDamage: damage the Pokémon that just moved takes from its status. */
    *residual(t) {
      const u = this.sides[t];
      if (u.hp === 0) return;
      const savedTurn = this.turn;
      this.turn = t;
      if (u.status & (STATUS.PSN | STATUS.BRN)) {
        const burn = (u.status & STATUS.BRN) !== 0;
        yield this.say(burn ? 'HurtByBurnText' : 'HurtByPoisonText');
        yield { anim: burn ? 'BRN' : 'PSN', user: t, frames: 30 };
        let amount = eighth(u.maxHp);
        if (u.sub.toxic) { u.toxicCount = (u.toxicCount ?? 0) + 1; amount = sixteenth(u.maxHp) * u.toxicCount; }
        yield* this.loseHp(t, amount);
      }
      if (u.hp !== 0 && u.sub.leechSeed) {
        yield { anim: 'SAP', user: 1 - t, frames: 30 };
        const amount = eighth(u.maxHp);
        yield* this.loseHp(t, amount);
        const other = this.sides[1 - t];
        yield* this.setHp(1 - t, other.hp + amount);
        yield this.say('LeechSeedSapsText');
      }
      if (u.hp !== 0 && u.sub.nightmare) {
        yield { anim: 'IN_NIGHTMARE', user: t, frames: 30 };
        yield* this.loseHp(t, quarter(u.maxHp));
        yield this.say('HasANightmareText');
      }
      if (u.hp !== 0 && u.sub.curse) {
        yield { anim: 'IN_NIGHTMARE', user: t, frames: 30 };
        yield* this.loseHp(t, quarter(u.maxHp));
        yield this.say('HurtByCurseText');
      }
      if (u.hp === 0) yield { wait: 20 };
      this.turn = savedTurn;
    },

    /** The faint of either side, as HandlePlayerMonFaint / HandleEnemyMonFaint: a result when the battle is over, else null. */
    *handleFaints() {
      if (this.sides[0].hp === 0) return (yield* this.playerFainted()) ?? null;
      if (this.sides[1].hp === 0) return yield* this.enemyFainted();
      return null;
    },

    /** HandleBetweenTurnEffects. Returns a result when the battle ended during it. */
    *betweenTurns() {
      const faintCheck = function* (self) { return yield* self.handleFaints(); };
      let end = yield* faintCheck(this); if (end) return end;
      end = yield* this.handleFutureSight(); if (end) return end;
      end = yield* faintCheck(this); if (end) return end;
      yield* this.handleWeather();
      end = yield* faintCheck(this); if (end) return end;
      yield* this.handleWrap();
      end = yield* faintCheck(this); if (end) return end;
      yield* this.handlePerishSong();
      end = yield* faintCheck(this); if (end) return end;
      yield* this.handleLeftovers();
      this.handleMysteryberry();
      yield* this.handleDefrost();
      yield* this.handleSafeguard();
      yield* this.handleScreens();
      return null;
    },

    *handleFutureSight() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!s.futureSight) continue;
        s.futureSight.count--;
        if (s.futureSight.count !== 1) continue;
        const saved = { turn: this.turn };
        this.turn = t;
        yield this.say('BattleText_TargetWasHitByFutureSight');
        const stored = s.futureSight;
        s.futureSight = null;
        throw new Error('unported battle command: future sight hit');
      }
      return null;
    },

    *handleWeather() {
      if (!this.weather) return;
      if (--this.weatherCount === 0) {
        yield this.say(['BattleText_TheRainStopped', 'BattleText_TheSunlightFaded', 'BattleText_TheSandstormSubsided'][this.weather - 1]);
        this.weather = 0;
        return;
      }
      yield this.say(['BattleText_RainContinuesToFall', 'BattleText_TheSunlightIsStrong', 'BattleText_TheSandstormRages'][this.weather - 1]);
      if (this.weather !== 3) return;
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (s.sub.underground || s.types.some((ty) => [BATTLE.types.ROCK, BATTLE.types.GROUND, BATTLE.types.STEEL].includes(ty))) continue;
        const saved = this.turn; this.turn = t;
        yield { anim: 'IN_SANDSTORM', user: 1 - t, frames: 30 };
        yield* this.loseHp(t, eighth(s.maxHp));
        yield this.say('SandstormHitsText');
        this.turn = saved;
      }
    },

    *handleWrap() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!s.wrapCount || s.sub.substitute) continue;
        const saved = this.turn; this.turn = t;
        const name = MOVES[s.trappingMove].name;
        if (--s.wrapCount === 0) yield { text: [['text', this.fill('<USER>')], ['line', 'was released from'], ['cont', `${name}!`], ['prompt']] };
        else {
          if (!this.sides[1 - t].sub.flying && !this.sides[1 - t].sub.underground) yield { anim: s.trappingMove, user: 1 - t, frames: 30 };
          yield* this.loseHp(t, sixteenth(s.maxHp));
          yield { text: [['text', this.fill("<USER>'s")], ['line', 'hurt by'], ['cont', `${name}!`], ['prompt']] };
        }
        this.turn = saved;
      }
    },

    *handlePerishSong() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!s.sub.perish) continue;
        const saved = this.turn; this.turn = t;
        s.perishCount--;
        yield this.say('PerishCountText', { wTextDecimalByte: s.perishCount });
        if (s.perishCount === 0) { s.sub.perish = false; s.hp = 0; s.mon.hp = 0; }
        this.turn = saved;
      }
    },

    *handleLeftovers() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!s.item || ITEMS[s.item].hold !== 'HELD_LEFTOVERS' || s.hp === s.maxHp) continue;
        const saved = this.turn; this.turn = 1 - t;           // RestoreHP works on the other side of the turn flag
        yield* this.setHp(t, s.hp + sixteenth(s.maxHp));
        yield this.say('BattleText_TargetRecoveredWithItem', { wStringBuffer1: ITEMS[s.item].name });
        this.turn = saved;
      }
    },

    handleMysteryberry() {
      for (const s of this.sides) if (s.item && ITEMS[s.item].hold === 'HELD_RESTORE_PP') this.unported.add('held item MYSTERYBERRY');
    },

    *handleDefrost() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!(s.status & STATUS.FRZ) || s.justGotFrozen) continue;
        if (this.random() >= percent(10)) continue;
        this.setStatus(s, 0);
        const saved = this.turn; this.turn = 1 - t;
        yield this.say('DefrostedOpponentText');
        this.turn = saved;
      }
      this.sides.forEach((s) => { s.justGotFrozen = false; });
    },

    *handleSafeguard() {
      for (const t of [0, 1]) {
        const s = this.sides[t];
        if (!s.screens.safeguard) continue;
        if (--s.screens.safeguard > 0) continue;
        s.screens.safeguard = 0;
        const saved = this.turn; this.turn = t;
        yield this.say('BattleText_SafeguardFaded');
        this.turn = saved;
      }
    },

    *handleScreens() {
      for (const t of [0, 1]) {
        const s = this.sides[t], who = t === 0 ? 'Your' : 'Enemy';
        if (s.screens.lightScreen && --s.screens.lightScreen === 0) yield this.say('BattleText_MonsLightScreenFell', { wStringBuffer1: who });
        if (s.screens.reflect && --s.screens.reflect === 0) yield this.say('BattleText_MonsReflectFaded', { wStringBuffer1: who });
      }
    },
  });
}
