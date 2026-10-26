// Player Pokémon planted for the trainer-AI probe (ai_probe.py): the same format as cases.mjs.
import { createMon } from '../../../src/script/mon.js';
import { POKEMON } from '../../../src/generated/pokemon.js';
import { MOVES } from '../../../src/generated/moves.js';
const cases = [
  { species: 'GEODUDE', level: 12, moves: ['ROCK_THROW', 'TACKLE', 'DEFENSE_CURL'] },
  { species: 'PIKACHU', level: 12, moves: ['THUNDERBOLT', 'THUNDER_WAVE', 'QUICK_ATTACK'] },
  { species: 'CHIKORITA', level: 12, moves: ['TACKLE', 'RAZOR_LEAF', 'POISONPOWDER'] },
];
const out = cases.map((c) => {
  const mon = createMon({ species: c.species, level: c.level, dvs: [0xab, 0xcd] });
  const moves = [...c.moves, 'NO_MOVE', 'NO_MOVE', 'NO_MOVE'].slice(0, 4);
  return { ...c, speciesId: POKEMON[c.species].id, itemId: 0, badges: [0, 0], moveIds: moves.map((m) => (m === 'NO_MOVE' ? 0 : MOVES[m].id)), stats: mon.stats, exp: mon.exp, dvs: mon.dvs };
});
console.log(JSON.stringify(out));
