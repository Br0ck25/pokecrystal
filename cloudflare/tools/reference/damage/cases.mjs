import { createMon } from '../../../src/script/mon.js';
import { POKEMON } from '../../../src/generated/pokemon.js';
import { MOVES } from '../../../src/generated/moves.js';
import { ITEMS } from '../../../src/generated/items.js';
const cases = [
  { species: 'CHIKORITA', level: 12, moves: ['TACKLE'], item: null, badges: [0, 0] },
  { species: 'CHIKORITA', level: 30, moves: ['RAZOR_LEAF'], item: 'MIRACLE_SEED', badges: [255, 255] },
  { species: 'CYNDAQUIL', level: 20, moves: ['EMBER'], item: 'CHARCOAL', badges: [0, 0] },
  { species: 'TOTODILE', level: 40, moves: ['SURF'], item: 'MYSTIC_WATER', badges: [255, 0] },
  { species: 'CHIKORITA', level: 30, moves: ['EXPLOSION'], item: null, badges: [0, 255] },
  { species: 'PIKACHU', level: 25, moves: ['THUNDERBOLT'], item: 'LIGHT_BALL', badges: [0, 0] },
  { species: 'MAROWAK', level: 30, moves: ['BONEMERANG'], item: 'THICK_CLUB', badges: [0, 0] },
  { species: 'FARFETCH_D', level: 20, moves: ['SLASH'], item: 'STICK', badges: [0, 0] },
];
const out = cases.map((c) => {
  const mon = createMon({ species: c.species, level: c.level, dvs: [0xab, 0xcd] });
  const moves = [...c.moves, 'NO_MOVE', 'NO_MOVE', 'NO_MOVE'].slice(0, 4);
  return { ...c, speciesId: POKEMON[c.species].id, itemId: c.item ? ITEMS[c.item].id : 0, moveIds: moves.map((m) => (m === 'NO_MOVE' ? 0 : MOVES[m].id)), stats: mon.stats, exp: mon.exp, dvs: mon.dvs };
});
console.log(JSON.stringify(out));
