// Generates cloudflare/src/generated/*.js from the disassembly's own data files.
// Run: node tools/extract-browser-data.mjs   (from cloudflare/). Dev-time only; the
// deployed app just serves the generated modules, so Pages stays no-build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'cloudflare', 'src', 'generated');
const text = (p) => readFileSync(join(ROOT, p), 'utf8');
const bin = (p) => readFileSync(join(ROOT, p));
const norm = (s) => s.replace(/_/g, '').toUpperCase();

// Source files whose labels stack on a single INCBIN/INCLUDE: label -> file.
function labelFiles(path, directive) {
  const files = new Map();
  let pending = [];
  for (const line of text(path).split('\n')) {
    const label = line.match(/^(\w+)::?\s*$/);
    if (label) { pending.push(label[1]); continue; }
    const inc = line.match(new RegExp(`^\\s*${directive}\\s+"([^"]+)"`));
    if (inc) { for (const l of pending) files.set(l, inc[1]); pending = []; }
    else if (line.trim() && !line.startsWith(';')) pending = [];
  }
  return files;
}

function tilesets() {
  const names = [...text('constants/tileset_constants.asm').matchAll(/^\s*const TILESET_(\w+)/gm)].map((m) => m[1]);
  const tilesetFiles = new Map([...labelFiles('gfx/tilesets.asm', 'INCBIN'), ...labelFiles('gfx/tilesets.asm', 'INCLUDE')]);
  const out = {};
  for (const name of names) {
    const camel = `Tileset${[...tilesetFiles.keys()].map((k) => k.match(/^Tileset(\w+?)(Meta|Coll)$/)).filter(Boolean)
      .map((m) => m[1]).find((c) => norm(c) === norm(name))}`;
    const meta = bin(tilesetFiles.get(`${camel}Meta`));
    const metatiles = [];
    for (let i = 0; i < meta.length; i += 16) metatiles.push([...meta.subarray(i, i + 16)]);
    const collision = [...text(tilesetFiles.get(`${camel}Coll`)).matchAll(/^\s*tilecoll\s+([^;\n]+)/gm)]
      .map((m) => m[1].split(',').map((s) => s.trim()));
    out[name] = { metatiles, collision };
  }
  return out;
}

function maps() {
  const sizes = new Map([...text('constants/map_constants.asm').matchAll(/^\s*map_const (\w+),\s*(\d+),\s*(\d+)/gm)]
    .map((m) => [norm(m[1]), { id: m[1], width: +m[2], height: +m[3] }]));
  const blockFiles = labelFiles('data/maps/blocks.asm', 'INCBIN');
  const borders = new Map([...text('data/maps/attributes.asm').matchAll(/^\tmap_attributes (\w+), \w+, \$([0-9a-fA-F]{2})/gm)]
    .map((m) => [m[1], parseInt(m[2], 16)]));
  const out = {};
  for (const m of text('data/maps/maps.asm').matchAll(/^\tmap (\w+), TILESET_(\w+),/gm)) {
    const [, name, tileset] = m;
    const size = sizes.get(norm(name));
    if (!size) throw new Error(`no map_const for ${name}`);
    const file = blockFiles.get(`${name}_Blocks`);
    if (!file) throw new Error(`no block file for ${name}`);
    if (!borders.has(name)) throw new Error(`no border block for ${name}`);
    const blocks = bin(file);
    if (blocks.length !== size.width * size.height) throw new Error(`${name}: ${blocks.length} bytes, expected ${size.width}x${size.height}`);
    out[size.id] = { name, tileset, width: size.width, height: size.height, border: borders.get(name), source: file, blocks: [...blocks] };
  }
  return out;
}


// Argument list of an event macro line: "warp_event  6,  3, ELMS_LAB, 1" -> ['6','3','ELMS_LAB','1'].
const args = (line) => line.replace(/;.*$/, '').trim().replace(/^\w+\s+/, '').split(',').map((a) => a.trim());
const num = (a) => (/^-?\d+$/.test(a) ? Number(a) : a);

function events() {
  const out = {};
  for (const m of text('data/maps/maps.asm').matchAll(/^\tmap (\w+), TILESET_/gm)) {
    const name = m[1];
    let src;
    try { src = text(`maps/${name}.asm`); } catch { continue; }
    const lines = src.split('\n');
    const consts = [];
    const ev = { warps: [], coordEvents: [], bgEvents: [], objects: [] };
    let section = null;
    for (const raw of lines) {
      const line = raw.replace(/;.*$/, '');
      const t = line.trim();
      if (/^object_const_def/.test(t)) { consts.length = 0; section = 'consts'; continue; }
      if (section === 'consts') {
        const c = t.match(/^const (\w+)/);
        if (c) { consts.push(c[1]); continue; }
        if (t) section = null;
      }
      if (/^def_warp_events/.test(t)) { section = 'warps'; continue; }
      if (/^def_coord_events/.test(t)) { section = 'coord'; continue; }
      if (/^def_bg_events/.test(t)) { section = 'bg'; continue; }
      if (/^def_object_events/.test(t)) { section = 'objects'; continue; }
      if (section === 'warps' && /^warp_event/.test(t)) {
        const [x, y, destination, destWarp] = args(t); ev.warps.push({ x: +x, y: +y, destination, destWarp: +destWarp });
      } else if (section === 'coord' && /^coord_event/.test(t)) {
        const [x, y, scene, script] = args(t); ev.coordEvents.push({ x: +x, y: +y, scene, script });
      } else if (section === 'bg' && /^bg_event/.test(t)) {
        const [x, y, kind, ...rest] = args(t); ev.bgEvents.push({ x: +x, y: +y, kind, args: rest.map(num) });
      } else if (section === 'objects' && /^object_event/.test(t)) {
        const a = args(t);
        ev.objects.push({
          id: consts[ev.objects.length] ?? null, x: +a[0], y: +a[1], sprite: a[2], movement: a[3],
          radius: [+a[4], +a[5]], hours: [num(a[6]), num(a[7])], palette: a[8], type: a[9], sight: num(a[10]),
          script: a[11], eventFlag: a[12],
        });
      }
    }
    out[name] = ev;
  }
  return out;
}

function sprites() {
  // Only the overworld sprites: constants up to NUM_OVERWORLD_SPRITES (later ones are Pokémon and variable sprites).
  const constants = text('constants/sprite_constants.asm');
  const names = [...constants.slice(0, constants.indexOf('DEF NUM_OVERWORLD_SPRITES')).matchAll(/^\tconst (SPRITE_\w+)/gm)].map((m) => m[1]);
  const gfx = new Map([...text('gfx/sprites.asm').matchAll(/^(\w+)::?\s+INCBIN "([^"]+)\.2bpp"/gm)].map((m) => [m[1], m[2]]));
  const rows = [...text('data/sprites/sprites.asm').matchAll(/^\toverworld_sprite (\w+), (\d+), (\w+), (\w+)/gm)];
  if (rows.length !== names.length - 1) throw new Error(`${rows.length} sprite rows for ${names.length} sprite constants`);
  const out = {};
  rows.forEach((r, i) => {
    const [, label, tiles, type, palette] = r;
    const path = `${gfx.get(label)}.png`;
    const png = bin(path);
    out[names[i + 1]] = { gfx: path, width: png.readUInt32BE(16), height: png.readUInt32BE(20), tiles: +tiles, type, palette, png: png.toString('base64') };
  });
  return out;
}

function npcPalettes() {
  const out = {};
  let phase = null;
  for (const line of text('gfx/overworld/npc_sprites.pal').split('\n')) {
    const p = line.match(/^; (morn|day|nite)/);
    if (p) { phase = p[1]; out[phase] = []; continue; }
    const c = line.match(/RGB (\d+),(\d+),(\d+), (\d+),(\d+),(\d+), (\d+),(\d+),(\d+), (\d+),(\d+),(\d+)/);
    if (c && phase) { const v = c.slice(1).map(Number); out[phase].push([v.slice(0, 3), v.slice(3, 6), v.slice(6, 9), v.slice(9, 12)]); }
  }
  return out;
}

const rows = (a) => a.map((r) => `    ${JSON.stringify(r)},`).join('\n');

export function generate() {
  const ts = tilesets();
  const tileset = Object.entries(ts).map(([k, v]) =>
    `  ${k}: {\n  metatiles: [\n${rows(v.metatiles)}\n  ],\n  collision: [\n${rows(v.collision)}\n  ],\n},`).join('\n');
  const mp = Object.entries(maps()).map(([k, v]) =>
    `  ${k}: { name: '${v.name}', tileset: '${v.tileset}', width: ${v.width}, height: ${v.height}, border: ${v.border}, source: '${v.source}',\n    blocks: ${JSON.stringify(v.blocks)} },`).join('\n');
  const spriteTable = Object.entries(sprites()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
  const eventTable = Object.entries(events()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
  return {
    'sprites.js': `// GENERATED by tools/extract-browser-data.mjs from constants/sprite_constants.asm, data/sprites/sprites.asm, gfx/sprites.asm,\n`
      + `// gfx/sprites/*.png and gfx/overworld/npc_sprites.pal. Do not edit.\n`
      + `// png is the source sheet (4 grays: white is transparent, then palette colors 1-3); palette is the sprite's default PAL_OW_*.\n`
      + `export const SPRITES = {\n${spriteTable}\n};\n`
      + `// OBJECT_PALETTES[timeOfDay][paletteIndex] = four [r,g,b] colors in 5-bit channels; PAL_OW_x and PAL_NPC_x both index 0-7.\n`
      + `export const OBJECT_PALETTES = ${JSON.stringify(npcPalettes())};\n`,
    'events.js': `// GENERATED by tools/extract-browser-data.mjs from maps/*.asm (def_warp_events, def_coord_events, def_bg_events, def_object_events). Do not edit.\n`
      + `// Keys are map names as in data/maps/maps.asm. Object fields follow the object_event macro (macros/scripts/maps.asm).\n`
      + `export const EVENTS = {\n${eventTable}\n};\n`,
    'tilesets.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/tilesets.asm, data/tilesets/*_metatiles.bin and *_collision.asm. Do not edit.\n`
      + `// metatiles[id] = 16 tile IDs (4x4, row-major); collision[id] = 4 quadrant labels (TL, TR, BL, BR).\n`
      + `export const TILESETS = deepFreeze({\n${tileset}\n});\n`
      + `function deepFreeze(o) { Object.values(o).forEach((v) => typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); }\n`,
    'maps.js': `// GENERATED by tools/extract-browser-data.mjs from constants/map_constants.asm, data/maps/maps.asm, data/maps/blocks.asm and maps/*.blk. Do not edit.\n`
      + `// blocks is the raw row-major .blk (width x height block IDs); border is the block drawn outside the map (map_attributes).\n`
      + `export const MAPS = deepFreeze({\n${mp}\n});\n`
      + `function deepFreeze(o) { Object.values(o).forEach((v) => typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); }\n`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(OUT, { recursive: true });
  for (const [name, body] of Object.entries(generate())) writeFileSync(join(OUT, name), body);
}
