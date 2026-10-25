// Compact lookups into the generated data, so nobody has to open src/generated (megabytes of one-line JSON).
//   node tools/q.mjs map NEW_BARK_TOWN        size, tileset, warps, coord/bg events, objects
//   node tools/q.mjs script ElmsLab [Label]   script labels of a map, or one script's commands
//   node tools/q.mjs text _text Label         a shared text block (use _text or _std as the map)
//   node tools/q.mjs find <regex>             map ids/names, script labels and flag names matching
import { MAPS } from '../src/generated/maps.js';
import { EVENTS } from '../src/generated/events.js';

const [cmd, a, b] = process.argv.slice(2);
const row = (c) => c.join(' ');
const load = (name) => import(`../src/generated/scripts/${name}.js`);

if (cmd === 'map') {
  const m = MAPS[a] ?? Object.values(MAPS).find((x) => x.name === a);
  if (!m) throw new Error(`no map ${a}`);
  const e = EVENTS[m.name];
  console.log(`${m.name} ${m.width}x${m.height} blocks, ${m.tileset} ${m.environment}, group ${m.group}/${m.number}, border ${m.border}`);
  e.warps.forEach((w, i) => console.log(`warp ${i + 1} (${w.x},${w.y}) -> ${w.destination} #${w.destWarp}`));
  e.coordEvents.forEach((c) => console.log(`coord (${c.x},${c.y}) ${c.scene} ${c.script}`));
  e.bgEvents.forEach((c) => console.log(`bg (${c.x},${c.y}) ${c.kind} ${c.args.join(',')}`));
  e.objects.forEach((o) => console.log(`obj ${o.id} (${o.x},${o.y}) ${o.sprite} ${o.movement} pal ${o.palette} ${o.type} ${o.script} flag ${o.eventFlag} hours ${o.hours}`));
} else if (cmd === 'script' || cmd === 'text') {
  const { SCRIPTS, SCENES, CALLBACKS } = await load(a);
  if (b) for (const c of SCRIPTS[b] ?? []) console.log(row(c));
  else {
    if (SCENES) console.log('scenes', JSON.stringify(SCENES), 'callbacks', JSON.stringify(CALLBACKS));
    console.log(Object.keys(SCRIPTS).join(' '));
  }
} else if (cmd === 'find') {
  const re = new RegExp(a, 'i');
  for (const [id, m] of Object.entries(MAPS)) if (re.test(id) || re.test(m.name)) console.log(`map ${id} ${m.name}`);
  const { readdirSync } = await import('node:fs');
  for (const f of readdirSync(new URL('../src/generated/scripts/', import.meta.url))) {
    const { SCRIPTS } = await load(f.replace('.js', ''));
    for (const k of Object.keys(SCRIPTS)) if (re.test(k)) console.log(`${f.replace('.js', '')}:${k}`);
  }
} else console.log(readFileHelp());
function readFileHelp() { return 'usage: node tools/q.mjs map|script|text|find ...'; }
