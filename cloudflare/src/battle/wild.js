// TryWildEncounter and ChooseWildEncounter (engine/overworld/wildmons.asm): the encounter roll for one step on grass or water.
import { BATTLE } from '../generated/battle-data.js';

const percent = (n) => Math.floor((n * 255) / 100);
const GRASS_PROB = [[30, 0], [60, 1], [80, 2], [90, 3], [95, 4], [99, 5], [100, 6]];     // data/wild/probabilities.asm
const WATER_PROB = [[60, 0], [90, 1], [100, 2]];

/**
 * Returns { species, level } or null. timeOfDay 0 morning, 1 day, 2 night; party mons for Cleanse Tag and Repel.
 * repelSteps: wRepelEffect; the encounter is skipped when the first healthy mon outlevels the wild one.
 */
export function wildEncounter({ map, timeOfDay, onWater = false, party, repelSteps = 0, random, unownsUnlocked = false }) {
  const area = BATTLE.wild[map]?.[onWater ? 'water' : 'grass'];
  if (!area) return null;
  let rate = onWater ? area.rates[0] : area.rates[timeOfDay];
  if (party.some((m) => m.item === 'CLEANSE_TAG')) rate >>= 1;
  if (!(random() < rate)) return null;
  const table = onWater ? WATER_PROB : GRASS_PROB;
  let roll;
  do roll = random(); while (roll >= 100);
  roll += 1;
  const slot = table.find(([p]) => p >= roll)[1];
  const [baseLevel, species] = area.slots[onWater ? slot : timeOfDay * 7 + slot];
  let level = baseLevel;
  if (!onWater) {                                      // wild levels vary upward
    const r = random();
    if (r >= percent(35)) { level++; if (r >= percent(65)) { level++; if (r >= percent(85)) { level++; if (r >= percent(95)) level++; } } }
  }
  if (species === 'UNOWN' && !unownsUnlocked) return null;
  if (repelSteps > 0) {
    const lead = party.find((m) => m.hp > 0);
    if (lead && level < lead.level) return null;
  }
  return { species, level };
}
