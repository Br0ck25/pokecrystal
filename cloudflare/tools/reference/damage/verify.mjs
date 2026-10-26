import { readFileSync } from 'node:fs';
import { POKEMON } from '../../../src/generated/pokemon.js';
import { ITEMS } from '../../../src/generated/items.js';
import { BATTLE } from '../../../src/generated/battle-data.js';
import { damageStats, damageCalc, stab, damageVariation } from '../../../src/battle/damage.js';
const S = process.argv[2];                                // the --out directory of probe.py
const obs = JSON.parse(readFileSync(`${S}/observed.json`)), cases = JSON.parse(readFileSync(`${S}/cases.json`));
const speciesName = Object.fromEntries(Object.entries(POKEMON).map(([k, v]) => [v.id, k]));
const itemName = Object.fromEntries(Object.entries(ITEMS).map(([k, v]) => [v.id, k]));
const effectName = Object.keys(BATTLE.effects);
const sideOf = (s) => ({ species: speciesName[s.species], level: s.level, types: s.types, item: s.item ? itemName[s.item] : null, stats: s.stats, base: s.base, stages: s.stages, screens: { reflect: s.screens & 4, lightScreen: s.screens & 2 } });
let ok = 0, bad = 0;
for (const o of obs) {
  const user = sideOf(o.attacker), target = sideOf(o.target);
  const special = o.move.type >= BATTLE.special, critical = !!o.crit;
  const st = damageStats(user, target, { special, critical });
  const type = Object.entries(BATTLE.types).find(([, v]) => v === o.move.type)[0];
  const base = damageCalc({ power: o.move.power, level: user.level, attack: st.attack, defense: st.defense, effect: effectName[o.move.effect], moveType: o.move.type, userItem: user.item, critical });
  const badges = o.attackerIsPlayer ? cases[o.case].badges[0] | (cases[o.case].badges[1] << 8) : 0;
  const r = stab({ damage: base, moveType: o.move.type, moveEffect: effectName[o.move.effect], user, target, isPlayer: o.attackerIsPlayer, badges });
  const reach = new Set();
  for (let v = 217; v < 256; v++) reach.add(damageVariation(r.damage, () => ((v << 1) | (v >> 7)) & 255));
  const overkill = o.target.hp === 0 && o.curDamage > 0 && o.curDamage <= Math.max(...reach);
  const good = (reach.has(o.curDamage) || overkill) && (r.matchup | (r.stab ? 0x80 : 0)) === o.typeModifier;
  good ? ok++ : bad++;
  if (!good || process.env.ALL) console.log(good ? 'ok ' : 'BAD', cases[o.case].moves[0], o.attackerIsPlayer ? 'player' : 'enemy', speciesName[o.attacker.species], '->', speciesName[o.target.species], 'power', o.move.power, 'crit', o.crit, 'mod', o.typeModifier, '/', r.matchup | (r.stab ? 0x80 : 0), 'observed', o.curDamage, 'range', Math.min(...reach), Math.max(...reach), 'pre', base, r.damage, JSON.stringify(st));
}
console.log({ ok, bad });
