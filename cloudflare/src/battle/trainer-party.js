// ReadTrainerParty (engine/battle/read_trainer_party.asm): the party of a trainer class entry, built with the class's DVs.
import { TRAINER_CLASSES } from '../generated/trainer-data.js';
import { MOVES } from '../generated/moves.js';
import { createMon } from '../script/mon.js';

/** `id` is the trainer id constant of the class (FALKNER1, MIKEY). Returns { name, party, reward, ai, items, classData }. */
export function trainerParty(cls, id) {
  const data = TRAINER_CLASSES[cls];
  const entry = data?.trainers[data.ids.indexOf(id)];
  if (!entry) throw new Error(`no trainer ${cls} ${id}`);
  const party = entry.mons.map((m) => {
    const mon = createMon({ species: m.species, level: m.level, dvs: [...data.dvs], id: 0, item: m.item && m.item !== 'NO_ITEM' ? m.item : null });
    if (m.moves) {                       // TRAINERTYPE_MOVES: the listed moves, PP only for the slots up to the first empty one
      mon.moves = m.moves.filter((x) => x && x !== 'NO_MOVE');
      mon.pp = mon.moves.map((x) => MOVES[x].pp);
    }
    return mon;
  });
  const last = party[party.length - 1];
  return { name: entry.name, class: cls, className: data.name, party, reward: data.reward * last.level, ai: data.ai, items: data.items, flags: data.flags };
}
