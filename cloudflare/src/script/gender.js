// Gender of a Pokémon from its species' ratio and its Attack/Speed DVs (engine/pokemon/mon_stats.asm GetGender).
import { POKEMON } from '../generated/pokemon.js';

const percent = (n) => Math.floor((n * 0xff) / 100);                     // macros/data.asm
// constants/pokemon_data_constants.asm
const RATIOS = { GENDER_F0: 0, GENDER_F12_5: percent(12) + 1, GENDER_F25: percent(25), GENDER_F50: percent(50), GENDER_F75: percent(75), GENDER_F100: percent(100) - 1 };

/** dvs: [attack/defense byte, speed/special byte]. Returns 'MALE', 'FEMALE' or null (genderless). */
export function monGender(species, dvs) {
  const ratio = POKEMON[species].gender;
  if (ratio === 'GENDER_UNKNOWN') return null;
  if (ratio === 'GENDER_F0') return 'MALE';
  if (ratio === 'GENDER_F100') return 'FEMALE';
  const combined = (dvs[0] & 0xf0) | (dvs[1] >> 4);
  return RATIOS[ratio] < combined ? 'MALE' : 'FEMALE';
}
