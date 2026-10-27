// EvolveAfterBattle (engine/pokemon/evolve.asm): the Pokémon that gained a level evolve once the battle is won. A generator for Battle.run:
// yields the texts and { evolve: { from, to, name, index } }, which the screen answers with true when the player stopped the evolution.
import { POKEMON } from '../generated/pokemon.js';
import { EVOS_ATTACKS } from '../generated/learnsets.js';
import { recalcStats } from '../script/mon.js';
import { learnLevelMoves } from './experience.js';

const HAPPINESS_TO_EVOLVE = 220;

/** The species `mon` evolves into on its own now (level, happiness, Tyrogue's stats), or null. Not by a stone, a trade or in a link battle. */
export function evolutionTarget(mon, timeOfDay) {
  if (mon.item === 'EVERSTONE') return null;
  for (const [kind, ...rest] of EVOS_ATTACKS[mon.species].evolutions) {
    if (kind === 'EVOLVE_LEVEL') { if (mon.level >= Number(rest[0])) return rest[1]; }
    else if (kind === 'EVOLVE_HAPPINESS') {
      if ((mon.happiness ?? 0) < HAPPINESS_TO_EVOLVE) continue;
      const [when, target] = rest;
      if (when === 'TR_ANYTIME' || (when === 'TR_MORNDAY') === (timeOfDay !== 'NITE')) return target;
    } else if (kind === 'EVOLVE_STAT') {
      const [level, relation, target] = rest;
      const { atk, def } = mon.stats;
      if (mon.level >= Number(level) && relation === (atk < def ? 'ATK_LT_DEF' : atk > def ? 'ATK_GT_DEF' : 'ATK_EQ_DEF')) return target;
    }
  }
  return null;
}

/** The party's Pokémon that gained a level this battle (wEvolvableFlags), in party order. */
export function* evolveAfterBattle(battle) {
  for (const index of [...battle.evolvable].sort((a, b) => a - b)) {
    const mon = battle.party[index];
    const target = evolutionTarget(mon, battle.state?.timeOfDay);
    if (!target) continue;
    const name = mon.nickname ?? POKEMON[mon.species].name;
    const newName = POKEMON[target].name;
    yield battle.say('_EvolvingText', { wStringBuffer2: name });
    const stopped = yield { evolve: { from: mon.species, to: target, name, index } };
    if (stopped) { yield battle.say('_StoppedEvolvingText', { wStringBuffer2: name }); yield { evolutionEnd: true }; continue; }
    yield battle.say('_CongratulationsYourPokemonText', { wStringBuffer2: name });
    yield battle.say('_EvolvedIntoText', { wStringBuffer1: newName });
    yield { evolved: true };
    yield { evolutionEnd: true };
    if (!mon.nickname || mon.nickname === POKEMON[mon.species].name) mon.nickname = undefined;       // UpdateSpeciesNameIfNotNicknamed
    mon.species = target;
    recalcStats(mon);
    const state = battle.state;
    if (state) { (state.dexSeen ??= new Set()).add(target); (state.dexCaught ??= new Set()).add(target); }
    yield* learnLevelMoves(battle, mon, mon.nickname ?? newName, mon.level);
  }
}
