// engine/battle/ai/items.asm (AI_SwitchOrTryItem, AI_TryItem and the items' effects) and switch.asm's CheckAbleToSwitch.
// A generator for Battle: it yields what the screen shows and returns true when the enemy switched or used an item (its move is skipped).
import { ITEMS } from '../../generated/items.js';
import {
  BASE_AI_SWITCH_SCORE, checkPlayerMoveTypeMatchups, findAliveEnemyMons, findAliveEnemyMonsWithASuperEffectiveMove,
  findEnemyMonsImmuneToLastCounterMove, findEnemyMonsThatResistPlayer, findEnemyMonsWithASuperEffectiveMove, findEnemyMonsWithAtLeastQuarterMaxHP,
} from './switch.js';
import { AIContext } from './index.js';

const percent = (n) => Math.floor((n * 255) / 100);
const SLEEP = 7, FRZ = 1 << 5, PAR = 1 << 6;
const slotOfMask = (mask) => { let i = 0; while (!(mask & (0x20 >> i))) i++; return i; };

/** CheckAbleToSwitch: wEnemySwitchMonParam — the high nibble says how keen the AI is, the low nibble which Pokémon (0-based slot). */
export function checkAbleToSwitch(battle) {
  const e = battle.sides[1];
  const alive = findAliveEnemyMons(battle);
  if (alive.carry) return 0;
  if (e.sub.perish && e.perishCount === 1) {
    let c = findEnemyMonsWithAtLeastQuarterMaxHP(battle, alive.c);
    c = findEnemyMonsThatResistPlayer(battle, c);
    const r = findAliveEnemyMonsWithASuperEffectiveMove(battle, c);
    if (r.e === 2) return (battle.aiSwitchScore + 0x30) & 0xff;
    return slotOfMask(findAliveEnemyMons(battle).c) + 0x30;
  }
  checkPlayerMoveTypeMatchups(battle);
  if (battle.aiSwitchScore >= 11) return 0;
  if (battle.sides[0].lastCounterMove) {
    findEnemyMonsImmuneToLastCounterMove(battle);
    if (battle.aiSwitchScore !== 0) {
      const r = findEnemyMonsWithASuperEffectiveMove(battle, battle.aiSwitchScore);
      if (battle.aiSwitchScore === 0xff) return 0;
      const b = battle.aiSwitchScore;
      if (r.e === 2) {
        let c = 0x10;
        checkPlayerMoveTypeMatchups(battle);
        if (battle.aiSwitchScore < BASE_AI_SWITCH_SCORE) c = 0x20;
        return (b + c) & 0xff;
      }
      checkPlayerMoveTypeMatchups(battle);
      if (battle.aiSwitchScore >= BASE_AI_SWITCH_SCORE) return 0;
      return (b + 0x10) & 0xff;
    }
  }
  checkPlayerMoveTypeMatchups(battle);
  if (battle.aiSwitchScore >= BASE_AI_SWITCH_SCORE) return 0;
  let c = findEnemyMonsWithAtLeastQuarterMaxHP(battle, findAliveEnemyMons(battle).c);
  c = findEnemyMonsThatResistPlayer(battle, c);
  const r = findAliveEnemyMonsWithASuperEffectiveMove(battle, c);
  if (r.e !== 2) return 0;
  return (battle.aiSwitchScore + 0x10) & 0xff;
}

// How keen each SWITCH_* flag is for the three levels of the switch parameter: [0x10, 0x20, 0x30] as [roll threshold, switch when below?]
const SWITCH_RULES = {
  SWITCH_OFTEN: [[percent(50) + 1, true], [percent(79) - 1, true], [percent(4), false]],
  SWITCH_RARELY: [[percent(8), true], [percent(12), true], [percent(79) - 1, false]],
  SWITCH_SOMETIMES: [[percent(20) - 1, true], [percent(50) + 1, true], [percent(20) - 1, false]],
};

const ITEM_ORDER = ['FULL_RESTORE', 'MAX_POTION', 'HYPER_POTION', 'SUPER_POTION', 'POTION', 'X_ACCURACY', 'FULL_HEAL', 'GUARD_SPEC', 'DIRE_HIT', 'X_ATTACK', 'X_DEFEND', 'X_SPEED', 'X_SPECIAL'];

/** The decision half of an item's callback: true = use it (the ROM's nc), false = DontUse. */
function wantsItem(battle, ai, item, flags) {
  const e = battle.sides[1];
  const context = flags.includes('CONTEXT_USE'), always = flags.includes('ALWAYS_USE'), unknown = flags.includes('UNKNOWN_USE');
  const random = () => battle.random();
  const healItem = () => {
    if (context) {
      if (ai.enemyHalfHp()) return false;
      if (!ai.enemyQuarterHp()) return true;
      return random() < percent(20) - 1;
    }
    if (ai.enemyHalfHp()) return false;
    if (unknown) { if (ai.enemyQuarterHp()) return false; if (random() < percent(20) - 1) return false; return true; }
    if (!ai.enemyQuarterHp()) return true;
    return random() < percent(50) + 1;
  };
  const status = () => {
    if (e.status === 0) return false;
    if (!context) return always || random() < percent(20) - 1;
    if (e.sub.toxic && (e.toxicCount ?? 0) >= 4 && random() < percent(50) + 1) return true;
    return (e.status & (FRZ | SLEEP)) !== 0;
  };
  const xItem = () => {
    if (e.turnsTaken === 0) {
      if (always) return true;
      if (random() < percent(50) + 1) return false;
      if (context) return true;
      return !(random() < percent(50) + 1);
    }
    if (!always) return false;
    return random() < percent(20) - 1;
  };
  switch (item) {
    case 'FULL_RESTORE': if (healItem()) return true; if (!context) return false; return status();
    case 'MAX_POTION': case 'HYPER_POTION': case 'SUPER_POTION': case 'POTION': return healItem();
    case 'FULL_HEAL': return status();
    default: return xItem();
  }
}

export function installAIItems(Battle) {
  Object.assign(Battle.prototype, {
    /** AI_SwitchOrTryItem: before either side moves, the trainer may switch or use an item. */
    *aiSwitchOrTryItem() {
      if (this.wild || this.isLockedIn(1)) return false;
      const [p, e] = this.sides;
      const flags = this.trainerInfo.flags ?? [];
      const dontSwitch = p.sub.cantRun || e.wrapCount;
      const rule = flags.find((f) => SWITCH_RULES[f]);
      if (dontSwitch || !rule) return yield* this.aiTryItem();
      this.turn = 1;
      const param = checkAbleToSwitch(this);
      const level = param & 0xf0;
      if (!level) return yield* this.aiTryItem();
      const [[a, aBelow], [b, bBelow], [c, cBelow]] = SWITCH_RULES[rule];
      const [threshold, below] = level === 0x10 ? [a, aBelow] : level === 0x20 ? [b, bBelow] : [c, cBelow];
      const roll = this.random();
      if (below ? !(roll < threshold) : roll < threshold) return yield* this.aiTryItem();
      return yield* this.aiTrySwitch((param & 0xf));
    },

    /** AI_TrySwitch / AI_Switch. */
    *aiTrySwitch(slot) {
      const alive = this.enemyParty.filter((_, i) => this.enemyHp(i) > 0).length;
      if (alive < 2) return false;
      const e = this.sides[1];
      e.sub.rage = false;
      this.enemyGoesFirst = true;
      this.turn = 0;
      if (this.sides[0].move?.effect === 'EFFECT_PURSUIT') this.unported.add('Pursuit against an AI switch');
      e.mon.status = e.status; e.mon.hp = e.hp;
      yield this.say('_EnemyWithdrewText');
      this.sides[0].sub.inLove = false;
      yield* this.enemyEntrance({ offer: false, index: slot });
      return true;
    },

    /** AI_TryItem. */
    *aiTryItem() {
      const items = this.trainerItems;
      if (!items.some(Boolean)) return false;
      const level = this.enemyParty[this.enemyIndex].level;
      if (level < Math.max(...this.enemyParty.map((m) => m.level))) return false;       // only the highest-level Pokémon uses items
      const ai = new AIContext(this);
      const flags = this.trainerInfo.flags ?? [];
      for (const item of ITEM_ORDER) {
        const slot = items.findIndex((x) => x === item);
        if (slot < 0) continue;
        if (!wantsItem(this, ai, item, flags)) continue;
        items[slot] = null;
        this.enemyGoesFirst = true;
        this.turn = 1;
        yield* this.enemyUsesItem(item);
        const e = this.sides[1];
        e.sub.bide = false; e.furyCutterCount = 0; e.protectCount = 0; e.rageCounter = 0; e.sub.rage = false; e.lastCounterMove = null;
        return true;
      }
      return false;
    },

    /** The Enemy used... effects: the text, then the change. */
    *enemyUsesItem(item) {
      const e = this.sides[1];
      const usedText = () => this.say('_EnemyUsedOnText', { wMonOrItemNameBuffer: ITEMS[item].name });
      const heal = function* (self, amount) { yield usedText(); yield* self.setHp(1, Math.min(e.maxHp, e.hp + amount)); };
      const cureStatus = () => { e.status = 0; e.mon.status = 0; e.sub.toxic = false; };
      switch (item) {
        case 'FULL_HEAL': cureStatus(); yield usedText(); break;
        case 'FULL_RESTORE': cureStatus(); e.sub.confused = false; yield* heal(this, e.maxHp); break;
        case 'MAX_POTION': yield* heal(this, e.maxHp); break;
        case 'HYPER_POTION': yield* heal(this, 200); break;
        case 'SUPER_POTION': yield* heal(this, 50); break;
        case 'POTION': yield* heal(this, 20); break;
        case 'X_ACCURACY': e.sub.xAccuracy = true; yield usedText(); break;
        case 'GUARD_SPEC': e.sub.mist = true; yield usedText(); break;
        case 'DIRE_HIT': e.sub.focusEnergy = true; yield usedText(); break;
        default: {
          const index = { X_ATTACK: 0, X_DEFEND: 1, X_SPEED: 2, X_SPECIAL: 3 }[item];
          yield usedText();
          this.attackMissed = false; this.effectFailed = false;
          this.loweredStat = index;
          this.raiseStat();
        }
      }
    },
  });
}
