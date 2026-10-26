// BattleCommand_CheckHit (engine/battle/effect_commands.asm). Pure: returns what happened and the state the ROM would change.
// user: { accLevel, xAccuracy }; target: { evaLevel, identified, flying, underground, protect, substitute, asleep, item };
// move: { name, effect, accuracy } with accuracy as the raw byte (percent * 255 / 100, see `rawAccuracy`).
import { BATTLE } from '../generated/battle-data.js';
import { ITEMS } from '../generated/items.js';

const MAX_STAT_LEVEL = 13;
export const rawAccuracy = (percent) => Math.floor((percent * 255) / 100);

const HITS_FLYING = ['GUST', 'WHIRLWIND', 'THUNDER', 'TWISTER'];
const HITS_UNDERGROUND = ['EARTHQUAKE', 'FISSURE', 'MAGNITUDE'];

/** .StatModifiers: the move's accuracy after the user's accuracy stage and the target's evasion stage (two table passes). */
export function modifiedAccuracy(accuracy, accLevel, evaLevel, identified) {
  if (evaLevel >= accLevel && identified) return accuracy;                  // Foresight/Odor Sleuth ignore evasion
  let n = accuracy;
  for (const stage of [accLevel, MAX_STAT_LEVEL + 1 - evaLevel]) {
    const [mul, div] = BATTLE.accuracyMultipliers[stage - 1];
    n = Math.max(1, Math.floor((n * mul) / div) & 0xffff);
  }
  return n > 0xff ? 0xff : n;
}

/** Returns { hit, lockOnUsed }. `random()` is BattleRandom; it is only called when the roll is needed. */
export function checkHit({ user, target, move, weather = 0, lockedOn = false, random }) {
  const res = (hit) => ({ hit, lockOnUsed: lockedOn });
  if (move.effect === 'EFFECT_DREAM_EATER' && !target.asleep) return res(false);
  if (target.protect) return res(false);
  if (target.substitute && (move.effect === 'EFFECT_LEECH_HIT' || move.effect === 'EFFECT_DREAM_EATER')) return res(false);
  if (lockedOn && !(target.flying && HITS_UNDERGROUND.includes(move.name))) return res(true);
  if (target.flying ? !HITS_FLYING.includes(move.name) : target.underground && !HITS_UNDERGROUND.includes(move.name)) return res(false);
  if (move.effect === 'EFFECT_THUNDER' && weather === 1) return res(true);
  if (user.xAccuracy || move.effect === 'EFFECT_ALWAYS_HIT') return res(true);
  let b = modifiedAccuracy(move.accuracy, user.accLevel, target.evaLevel, target.identified);
  const held = target.item ? ITEMS[target.item] : null;
  if (held?.hold === 'HELD_BRIGHTPOWDER') b = Math.max(0, b - Number(held.param));
  return res(b === 0xff || random() < b);
}
