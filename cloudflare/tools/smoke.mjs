// Enter every map (at its first warp) headlessly and print distinct errors: node tools/smoke.mjs
import { Game } from '../src/game/engine.js';
import { MAPS } from '../src/generated/maps.js';
import { EVENTS } from '../src/generated/events.js';
const errors = {};
const notes = new Set();
const g = new Game({ mapId: 'PLAYERS_HOUSE_2F', x: 3, y: 3 });
await g.ready;
for (const [id, m] of Object.entries(MAPS)) {
  const w = EVENTS[m.name]?.warps[0] ?? { x: 0, y: 0 };
  try { await g.enterMap(id, w.x, w.y, 'down'); for (let i = 0; i < 40; i++) g.update({}); g.visibleObjects(); for (const u of g.unported) notes.add(u); g.unported.clear(); }
  catch (e) { (errors[e.message.split('\n')[0].slice(0, 110)] ??= []).push(id); }
}
const groups = Object.entries(errors).sort((a, b) => b[1].length - a[1].length);
for (const [msg, ids] of groups.slice(0, 15)) console.log(`${ids.length}x ${msg} (${ids.slice(0, 3).join(' ')})`);
if (groups.length > 15) console.log(`... ${groups.length - 15} more kinds`);
console.log(`unported notes: ${notes.size}`);
if (process.argv[2] === '--notes') for (const n of [...notes].slice(0, 40)) console.log(' ', n.slice(0, 140));
console.log(`${Object.keys(MAPS).length} maps, ${Object.values(errors).flat().length} failed`);
