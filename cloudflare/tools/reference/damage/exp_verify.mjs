// node exp_verify.mjs OUT: checks the experience and stat experience the ROM gave (exp_probe.py) against src/battle/experience.js's formulas.
import { readFileSync } from 'node:fs';
import { POKEMON } from '../../../src/generated/pokemon.js';
const obs = JSON.parse(readFileSync(`${process.argv[2]}/exp_observed.json`));
const names = Object.fromEntries(Object.entries(POKEMON).map(([k, v]) => [v.id, k]));
let ok = 0, bad = 0;
for (const o of obs) {
  const e = POKEMON[names[o.enemy[0]]];
  if (o.after.exp === o.before.exp) continue;                         // the player lost or ran
  let gained = Math.floor((e.baseExp * o.enemy[1]) / 7);
  gained += gained >> 1;                                              // the planted Pokémon has another OT ID: traded boost
  const base = [e.stats.hp, e.stats.atk, e.stats.def, e.stats.spd, e.stats.sat];
  const good = o.after.exp - o.before.exp === gained && base.every((b, i) => o.after.statExp[i] - o.before.statExp[i] === b);
  good ? ok++ : bad++;
  if (!good) console.log('BAD', names[o.enemy[0]], o.enemy[1], 'gained', o.after.exp - o.before.exp, 'expected', gained, o.before.statExp, o.after.statExp);
}
console.log({ ok, bad });
