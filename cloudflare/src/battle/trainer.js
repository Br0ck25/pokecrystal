// The trainer half of a battle: engine/battle/core.asm HandleEnemyMonFaint/WinTrainerBattle/HandleEnemySwitch/EnemySwitch,
// FindMonInOTPartyToSwitchIntoBattle/ScoreMonTypeMatchups and the money of UpdateBattleStateAndExperienceAfterEnemyFaint.
import { BATTLE } from '../generated/battle-data.js';
import { POKEMON } from '../generated/pokemon.js';
import { MOVES } from '../generated/moves.js';
import { battleMon } from './battle.js';
import { healParty } from '../script/mon.js';

const MAX_MONEY = 999999;

export function installTrainer(Battle) {
  Object.assign(Battle.prototype, {
    /** The enemy party Pokémon with its current HP (the active one lives in sides[1]). */
    enemyHp(i) { return i === this.enemyIndex ? this.sides[1].hp : this.enemyParty[i].hp; },
    enemyDefeated() { return this.enemyParty.every((_, i) => this.enemyHp(i) === 0); },

    /** The "effectiveness" scoring that picks the enemy's next Pokémon; returns its party index. */
    chooseEnemyMon() {
      const n = this.enemyParty.length, player = this.sides[0];
      let enemyEff = 1, playerEff = 1;                                   // wEnemyEffectivenessVsPlayerMons / wPlayerEffectivenessVsEnemyMons
      for (let b = 0; b < n; b++) {
        enemyEff = (enemyEff << 1) & 0xff;
        playerEff = (playerEff << 1) & 0xff;
        if (b === this.enemyIndex || this.enemyHp(b) === 0) { playerEff |= 1; continue; }
        const mon = this.enemyParty[b];
        for (const move of mon.moves) {                                  // LookUpTheEffectivenessOfEveryMove
          if (!move) break;
          if (this.typeMatchupOf(BATTLE.types[MOVES[move].type], player) > 10) { enemyEff |= 1; break; }
        }
        const target = { types: POKEMON[mon.species].types.map((t) => BATTLE.types[t]), sub: {} };
        if (player.types.some((t) => this.typeMatchupOf(t, target) > 10)) {   // IsThePlayerMonTypesEffectiveAgainstOTMon
          if (enemyEff & 1) enemyEff &= ~1; else playerEff |= 1;
        }
      }
      return this.scoreMonTypeMatchups(enemyEff, playerEff);
    },
    scoreMonTypeMatchups(enemyEff, playerEff) {
      const n = this.enemyParty.length;
      let carry;
      do { enemyEff = (enemyEff << 1) & 0xff; carry = playerEff & 0x80; playerEff = (playerEff << 1) & 0xff; } while (!carry);
      let b = n, c = playerEff, random = false;
      for (;;) {
        carry = c & 0x80; c = (c << 1) & 0xff;
        if (!carry) break;
        if (--b === 0) { random = true; break; }
      }
      if (random) {
        for (;;) {
          const pick = this.random() & 7;
          if (pick >= n || pick === this.enemyIndex || this.enemyHp(pick) === 0) continue;
          return pick;
        }
      }
      if (enemyEff) { let i = -1, v = enemyEff; do { i++; carry = v & 0x80; v = (v << 1) & 0xff; } while (!carry); return i; }
      let i = -1, v = playerEff;
      do { i++; carry = v & 0x80; v = (v << 1) & 0xff; } while (carry);
      return i;
    },

    /** EnemySwitch/EnemySwitch_SetMode + ShowSetEnemyMonAndSendOutAnimation: the next Pokémon comes out; offer = the player may switch first (Shift style). */
    *enemyEntrance({ offer, index: forced, quiet = false }) {
      this.sides[1].mon.hp = this.sides[1].hp;
      const index = forced ?? this.chooseEnemyMon();
      const mon = this.enemyParty[index];
      const previous = this.enemyIndex;
      this.enemyIndex = index;
      const side = this.sides[1] = battleMon(mon);
      Object.assign(side, { lastCounterMove: null, lastMove: null });
      this.enemyHpAtSwitch = side.hp;
      this.enemyDamageTaken = 0;
      this.sides[0].wrapCount = 0;
      this.sides[0].lastCounterMove = null;
      let playerSwitched = false;
      if (offer && this.party.length > 1 && !this.shiftStyle && this.party[this.party.indexOf(this.sides[0].mon)]?.hp > 0) {
        yield { enemyHudClear: true };
        yield this.say('BattleText_EnemyIsAboutToUseWillPlayerChangeMon');
        const yes = yield { ask: 'yesno' };
        if (yes) {
          const picked = yield { ask: 'party', offerSwitch: true };
          if (picked !== null && picked !== undefined) { playerSwitched = true; yield* this.tryPlayerSwitchFree(picked); }
        }
      }
      yield { enemySendOut: true, species: side.species, previous };
      if (!quiet) { yield this.say('BattleText_EnemySentOut'); yield { wait: 30 }; }
      yield { enemyHud: true };
      this.participants = new Set([this.party.indexOf(this.sides[0].mon)]);
      yield* this.spikesDamage(1);
      return playerSwitched;
    },

    /** LostBattle: a battle that can be lost (BATTLETYPE_CANLOSE) shows the trainer and its loss text instead of a whiteout. */
    *lostBattle() {
      if (this.trainerInfo?.canLose) {
        yield { trainerSlideIn: true };
        yield { wait: 40 };
        yield { trainerLossText: true };
      }
      return { result: 'lose' };
    },

    /** WinTrainerBattle: the defeat text, the trainer's own win text (the script's), then the money. */
    *winTrainer() {
      yield this.say('BattleText_EnemyWasDefeated');
      yield { trainerSlideIn: true };
      yield { wait: 40 };
      if (this.trainerInfo.canLose) healParty(this.party);
      yield { trainerWinText: true };
      let reward = this.trainerInfo.reward;
      if (this.state?.amuletCoin) reward = Math.min(reward * 2, 0xffffff);
      const total = Math.min(reward * 4, 0xffffff);
      const wallet = this.state ?? {};
      wallet.money = Math.min((wallet.money ?? 0) + total, MAX_MONEY);
      yield this.say('GotMoneyForWinningText', { wBattleReward: total, ['<PLAYER>']: '' });
      return { result: 'win', trainerDefeated: true };
    },
  });
}
