// The damage pipeline of engine/battle/effect_commands.asm: BattleCommand_DamageStats, DamageCalc, Critical, Stab and DamageVariation,
// with the 8/16-bit arithmetic of the Game Boy. `random()` returns a byte (BattleRandom); every function is pure otherwise.
// A side is { species, level, types: [t1, t2], item, stats: {atk, def, sat, sdf} (in-battle values),
//   base: {...} (without stat stages), stages: {...} (1..13, 7 = normal), screens: {reflect, lightScreen}, identified }.
import { BATTLE } from '../generated/battle-data.js';
import { ITEMS } from '../generated/items.js';

const word = (n) => n & 0xffff;
const heldEffect = (item) => (item ? ITEMS[item].hold : 'HELD_NONE');

/** TruncateHL_BC: shrink attack and defense by 4 until both fit a byte. */
export function truncateStats(attack, defense) {
  let h = attack, bc = defense;
  while ((h | bc) > 0xff) {
    bc >>= 2; if (bc === 0) bc = 1;
    h >>= 2; if (h === 0) h = 1;
  }
  return { attack: h, defense: bc };
}

/** Attack/defense bytes for the damage formula (PlayerAttackDamage/EnemyAttackDamage), `special` for moves of a special type. */
export function damageStats(user, target, { special, critical }) {
  const [atkKey, defKey] = special ? ['sat', 'sdf'] : ['atk', 'def'];
  let defense = target.stats[defKey];
  if (target.screens?.[special ? 'lightScreen' : 'reflect']) defense = word(defense * 2);
  // A critical hit ignores stat stages when the target's defense stage is not lower than the user's attack stage.
  const boosted = !critical || target.stages[defKey] < user.stages[atkKey];
  if (!boosted) defense = target.base[defKey];
  let attack = (boosted ? user.stats : user.base)[atkKey];
  if (special && user.species === 'PIKACHU' && user.item === 'LIGHT_BALL') attack = word(attack * 2);
  if (!special && ['CUBONE', 'MAROWAK'].includes(user.species) && user.item === 'THICK_CLUB') attack = word(attack * 2);
  let { attack: b, defense: c } = truncateStats(attack, defense);
  if (target.species === 'DITTO' && target.item === 'METAL_POWDER') {          // DittoMetalPowder, including its wraparound
    const sum = c + (c >> 1);
    c = sum & 0xff;
    if (sum > 0xff) { b = Math.max(1, b >> 1); c = 0x80 | (c >> 1); }
  }
  return { attack: b, defense: c, level: user.level };
}

/** BattleCommand_DamageCalc: the base damage before STAB, type and variation. */
export function damageCalc({ power, level, attack, defense, effect, moveType, userItem, critical }) {
  if (effect === 'EFFECT_SELFDESTRUCT') defense = Math.max(1, defense >> 1);
  if (power === 0 && effect !== 'EFFECT_MULTI_HIT' && effect !== 'EFFECT_CONVERSION') return 0;
  if (defense === 0) defense = 1;
  let n = Math.floor((level * 2) / 5) + 2;
  n = Math.floor((n * power * attack) / defense);
  n = Math.floor(n / 50);
  const boostType = BATTLE.typeBoostItems[heldEffect(userItem)];
  if (boostType !== undefined && boostType === moveType) n = Math.floor((n * (100 + Number(ITEMS[userItem].param))) / 100);
  n = word(n);
  if (critical) n = Math.min(n * 2, 0xffff);
  return Math.min(n, 997) + 2;
}

/** BattleCommand_Critical: the critical-hit stage from the user's item, Focus Energy and the move. */
export function criticalStage({ species, item, focusEnergy, move }) {
  let c = 0;
  if (species === 'CHANSEY' && item === 'LUCKY_PUNCH') c = 2;
  else if (species === 'FARFETCH_D' && item === 'STICK') c = 2;
  else if (focusEnergy) c = 1;
  if (BATTLE.critMoves.includes(move)) c += 2;
  if (heldEffect(item) === 'HELD_CRITICAL_UP') c += 1;
  return c;
}
export const isCritical = (stage, random) => random() < BATTLE.critChances[stage];

// Multiply, divide by ten and clamp (weather modifiers); `mul` is a data/types value (10 = x1).
function scale(damage, mul) {
  const q = Math.floor((damage * mul) / 10);
  return q > 0xffff ? 0xffff : q === 0 ? 1 : q;
}

/** BattleCommand_Stab: weather, badge boost, STAB, then the type chart. Returns { damage, stab, matchup, missed }. */
export function stab({ damage, moveType, moveEffect, user, target, weather = 0, isPlayer = false, badges = 0 }) {
  for (const [w, type, mul] of BATTLE.weatherTypes) {
    if (w === weather && (type === moveType || type === moveEffect)) { damage = scale(damage, mul); break; }
  }
  if (isPlayer) {                                       // DoBadgeTypeBoosts: badges is Johto bits 0-7, Kanto bits 8-15
    const i = BATTLE.badgeBoosts.findIndex((type, bit) => (badges >> bit) & 1 && type === moveType);
    if (i >= 0) damage = Math.min(0xffff, damage + Math.max(1, damage >> 3));
  }
  const stab = user.types.includes(moveType);
  if (stab) damage = word(damage + (damage >> 1));
  const [d, e] = target.types;
  let missed = false;
  const rows = [...BATTLE.matchups, ...(target.identified ? [] : BATTLE.foresight)];
  let matchup = 10;
  for (const [atk, def, mul] of rows) {
    if (atk !== moveType || (def !== d && def !== e)) continue;
    if (mul === 0) missed = true;
    const product = damage * mul;
    damage = product === 0 ? 0 : (Math.floor(product / 10) & 0xffff) || 1;
    matchup = Math.floor((matchup * mul) / 10);
  }
  return { damage, stab, matchup, missed };
}

/** BattleCommand_DamageVariation: 85-100%. */
export function damageVariation(damage, random) {
  if (damage < 2) return damage;
  let r;
  do { const b = random(); r = ((b >> 1) | ((b & 1) << 7)) & 0xff; } while (r < 217);
  return Math.floor((damage * r) / 255) & 0xffff;
}
