// GiveExperiencePoints (engine/battle/core.asm) with LearnLevelMoves/LearnMove (engine/pokemon/evolve.asm, learn.asm).
// A generator for Battle.run: yields texts and { exp, partyIndex, from, to } for the bar; { ask: 'forget', ... } answers a slot or null.
import { POKEMON } from '../generated/pokemon.js';
import { EVOS_ATTACKS } from '../generated/learnsets.js';
import { MOVES } from '../generated/moves.js';
import { expAtLevel, levelForExp, recalcStats } from '../script/mon.js';

const MAX_LEVEL = 100;
const FANFARE_FRAMES = 65;                                   // the level-up jingle after "grew to level ##!" (measured)
const BAR_TO_HUD_FRAMES = 23;                                 // from the bar's last pixel to UpdatePlayerHUD (the stats are worked out in between; measured)
const HIT_END_FRAMES = 22;                                   // SFX_HIT_END_OF_EXP_BAR, waited for by a Pokémon that is not in the field (measured)

/** CalcExpBar: the pixels (0-64) of the experience bar at `exp` for a Pokémon of this species and level. */
export function expPixels(species, level, exp) {
  const base = expAtLevel(species, level), next = expAtLevel(species, level + 1);
  return Math.max(0, Math.min(64, 64 - Math.floor(((next - exp) * 64) / (next - base))));
}
const STAT_EXP_KEYS = ['hp', 'atk', 'def', 'spd', 'spc'];

/**
 * battle: the Battle (for say/sides); participants: party indexes that fought and have not fainted; enemy: the defeated battle mon.
 * Returns nothing; the party mons are updated in place.
 */
export function* giveExperience(battle, { participants, playerId, trainer = false }) {
  const enemy = battle.sides[1];
  const data = POKEMON[enemy.species];
  // EvenlyDivideExpAmongParticipants: base stats, catch rate and base experience are shared out
  const n = participants.size;
  const share = (v) => (n >= 2 ? Math.floor(v / n) : v);
  const base = [data.stats.hp, data.stats.atk, data.stats.def, data.stats.spd, data.stats.sat].map(share);
  const baseExp = share(data.baseExp);

  for (const [index, mon] of battle.party.entries()) {
    if (mon.hp === 0 || !participants.has(index)) continue;
    STAT_EXP_KEYS.forEach((key, i) => { mon.statExp[key] = Math.min(0xffff, mon.statExp[key] + base[i]); });
    let gained = Math.floor((baseExp * enemy.level) / 7);
    const boost = (v) => v + (v >> 1);
    const traded = mon.id !== playerId;
    if (traded) gained = boost(gained);
    if (trainer) gained = boost(gained);
    if (mon.item === 'LUCKY_EGG') gained = boost(gained);
    const name = mon.nickname ?? POKEMON[mon.species].name;
    yield { text: [['text', `${name} gained`], ...(traded ? [['line', 'a boosted'], ['cont', `${gained} EXP. Points!`]] : [['line', `${gained} EXP. Points!`]]), ['prompt']] };
    const before = mon.exp, oldLevel = mon.level;
    mon.exp = Math.min(mon.exp + gained, 0xffffff);
    const cap = expAtLevel(mon.species, MAX_LEVEL);
    if (mon.exp > cap) mon.exp = cap;
    const newLevel = oldLevel >= MAX_LEVEL ? oldLevel : levelForExp(mon.species, mon.exp);
    const active = battle.sides[0].mon === mon;
    if (active && oldLevel < MAX_LEVEL) {                    // AnimateExpBar: the bar fills to the end for every level gained, then to where the experience leaves it
      for (let level = oldLevel; level < newLevel; level++) {
        yield { expBar: { from: expPixels(mon.species, level, level === oldLevel ? before : expAtLevel(mon.species, level)), to: 64, first: level === oldLevel } };
        yield { hudLevel: level + 1 };
        yield battle.say('BattleText_StringBuffer1GrewToLevel', { wStringBuffer1: name, wCurPartyLevel: level + 1 });
        yield { wait: FANFARE_FRAMES };
      }
      yield { expBar: { from: newLevel === oldLevel ? expPixels(mon.species, oldLevel, before) : 0, to: expPixels(mon.species, newLevel, mon.exp), first: newLevel === oldLevel, final: true } };
    }
    if (newLevel === oldLevel) continue;
    mon.level = newLevel;
    recalcStats(mon);
    if (active) { yield { wait: BAR_TO_HUD_FRAMES }; battle.refreshPlayerStats(); yield { hudRefresh: true }; }
    else {
      yield battle.say('BattleText_StringBuffer1GrewToLevel', { wStringBuffer1: name, wCurPartyLevel: newLevel });
      yield { wait: HIT_END_FRAMES };
    }
    yield { statBox: mon };
    for (let level = oldLevel + 1; level <= newLevel; level++) yield* learnLevelMoves(battle, mon, name, level);
  }
}

/** LearnLevelMoves: the moves the species learns exactly at `level`. */
function* learnLevelMoves(battle, mon, name, level) {
  for (const [at, move] of EVOS_ATTACKS[mon.species].learnset) {
    if (at !== level || mon.moves.includes(move)) continue;
    yield* learnMove(battle, mon, name, move);
  }
}

/** LearnMove: take an empty slot, or ask which move to forget. */
export function* learnMove(battle, mon, name, move) {
  const vars = { wMonOrItemNameBuffer: name, wStringBuffer2: MOVES[move].name };
  for (;;) {
    let slot = mon.moves.findIndex((m) => !m);
    if (slot < 0 && mon.moves.length < 4) slot = mon.moves.length;
    if (slot < 0) {
      yield battle.say('_AskForgetMoveText', vars);
      const forget = yield { ask: 'forget', mon, move };          // a slot 0-3, or null to give up
      if (forget === null || forget === undefined) {
        yield battle.say('_StopLearningMoveText', vars);
        const stop = yield { ask: 'yesno' };
        if (!stop) continue;
        yield battle.say('_DidNotLearnMoveText', vars);
        return false;
      }
      const old = mon.moves[forget];
      yield battle.say('Text_MoveForgetCount');
      yield battle.say('_MoveForgotText', { ...vars, wStringBuffer1: MOVES[old].name });
      slot = forget;
    }
    mon.moves[slot] = move;
    mon.pp[slot] = MOVES[move].pp;
    if (battle.sides[0].mon === mon) { battle.sides[0].moves[slot] = move; battle.sides[0].pp[slot] = mon.pp[slot]; }
    yield battle.say('_LearnedMoveText', vars);
    return true;
  }
}
