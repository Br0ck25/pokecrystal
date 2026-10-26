// Throwing a ball (engine/items/item_effects.asm PokeBallEffect and engine/battle_anims/pokeball_wobble.asm) and what follows a capture.
import { BATTLE } from '../generated/battle-data.js';
import { POKEMON } from '../generated/pokemon.js';
import { ITEMS } from '../generated/items.js';
import { expAtLevel, calcStat } from '../script/mon.js';
import { MOVES } from '../generated/moves.js';

const WOBBLE = [[1, 63], [2, 75], [3, 84], [4, 90], [5, 95], [7, 103], [10, 113], [15, 126], [20, 134], [30, 149], [40, 160], [50, 169],
  [60, 177], [80, 191], [100, 201], [120, 211], [140, 220], [160, 227], [180, 234], [200, 240], [220, 246], [240, 251], [254, 253], [255, 255]];
const PARTY_LENGTH = 6, BOX_LENGTH = 20;
const FRZ_SLP = 0x07 | 0x20;

/** The catch rate byte after the ball and the enemy's HP and status (the code before `.skip_hp_calc`). */
export function finalCatchRate(ball, enemy) {
  let b = POKEMON[enemy.species].catchRate;
  if (ball === 'ULTRA_BALL') b = Math.min(255, b * 2);
  else if (ball === 'GREAT_BALL') b = Math.min(255, b + (b >> 1));
  else if (ball !== 'POKE_BALL') throw new Error(`unported ball ${ball}`);
  let max3 = enemy.maxHp * 3, hp2 = enemy.hp * 2;
  if (max3 > 255) { max3 >>= 2; hp2 >>= 2; if (hp2 === 0) hp2 = 1; }
  let rate = Math.floor((b * ((max3 & 0xff) - hp2)) / (max3 & 0xff));
  if (rate === 0) rate = 1;
  if (enemy.status & FRZ_SLP) rate += 10;                            // BRN/PSN/PAR add nothing (a bug of the original)
  return Math.min(255, rate);
}

/** Random decides capture; then each of up to 3 shakes survives with the table's chance. Returns { caught, shakes, rate }. */
export function throwBall(ball, enemy, random) {
  if (ball === 'MASTER_BALL') return { caught: true, shakes: 3, rate: 255 };
  const rate = finalCatchRate(ball, enemy);
  const caught = random() <= rate;
  if (caught) return { caught: true, shakes: 3, rate };
  const prob = WOBBLE.find(([r]) => r >= rate)[1];
  let shakes = 0;
  while (shakes < 3 && random() < prob) shakes++;
  return { caught: false, shakes, rate };
}

/** The party Pokémon a captured wild one becomes: it keeps its HP, status and held item. */
export function capturedMon(enemy, { playerId, ball }) {
  const species = enemy.species;
  const dvs = enemy.mon.dvs;
  const stats = Object.fromEntries(['hp', 'atk', 'def', 'spd', 'sat', 'sdf'].map((s) => [s, calcStat(species, s, enemy.level, dvs)]));
  const moves = [...enemy.mon.moves];
  return {
    species, level: enemy.level, item: enemy.mon.item ?? null, dvs, id: playerId, moves, pp: moves.map((m) => MOVES[m].pp), exp: expAtLevel(species, enemy.level),
    statExp: { hp: 0, atk: 0, def: 0, spd: 0, spc: 0 }, happiness: ball === 'FRIEND_BALL' ? 200 : 70, status: enemy.status, hp: Math.min(enemy.hp, stats.hp), stats,
    caught: { ball },
  };
}

/** The whole throw as a generator for Battle.run: texts, the throw, then the capture steps. Returns { caught, mon?, boxed? }. */
export function* useBall(battle, ball, { state }) {
  const enemy = battle.sides[1];
  if (!battle.wild) {                                                 // UseBallInTrainerBattle: the ball is spent and bounces off
    yield { text: [['text', `${state.playerName} used the`], ['line', ITEMS[ball].name], ['text', '.'], ['done']] };
    yield { wait: 20 };
    yield { anim: 'THROW_POKE_BALL', user: 0, frames: 70, ball, shakes: 0 };
    yield battle.say('_BallBlockedText');
    yield battle.say('_BallDontBeAThiefText');
    return { caught: false, used: true };
  }
  if (battle.party.length >= PARTY_LENGTH && (state.box?.length ?? 0) >= BOX_LENGTH) { yield battle.say('_BallBoxFullText'); return { caught: false, used: false }; }
  yield { text: [['text', `${state.playerName} used the`], ['line', ITEMS[ball].name], ['text', '.'], ['done']] };
  yield { wait: 20 };
  const result = throwBall(ball, enemy, battle.random);
  const shakes = result.shakes;
  yield { anim: 'THROW_POKE_BALL', user: 0, frames: 70 + 30 * shakes, ball, shakes };
  if (!result.caught) {
    const label = ['_BallBrokeFreeText', '_BallAppearedCaughtText', '_BallAlmostHadItText', '_BallSoCloseText'][shakes];
    yield battle.say(label);
    return { caught: false, used: true };
  }
  yield battle.say('Text_BallCaught');
  const mon = capturedMon(enemy, { playerId: battle.playerId, ball });
  state.dexCaught.add(enemy.species);
  state.dexSeen.add(enemy.species);
  const boxed = battle.party.length >= PARTY_LENGTH;
  if (boxed) (state.box ??= []).push(mon); else battle.party.push(mon);
  yield battle.say('_CaughtAskNicknameText', { wStringBuffer1: POKEMON[enemy.species].name });
  const yes = yield { ask: 'yesno' };
  if (yes) {
    const name = yield { ask: 'nickname', species: enemy.species, boxed };
    if (name) mon.nickname = name;
  }
  if (boxed) yield battle.say('_BallSentToPCText', { wMonOrItemNameBuffer: mon.nickname ?? POKEMON[enemy.species].name });
  return { caught: true, used: true, mon, boxed };
}
