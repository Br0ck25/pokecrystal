// Generates cloudflare/src/generated/*.js from the disassembly's own data files.
// Run: node tools/extract-browser-data.mjs   (from cloudflare/). Dev-time only; the
// deployed app just serves the generated modules, so Pages stays no-build.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
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

// data/maps/attributes.asm: `connection dir, Name, MAP_ID, offset` lines follow their map_attributes line.
function connections() {
  const out = {};
  let current = null;
  for (const line of text('data/maps/attributes.asm').split('\n')) {
    const a = line.match(/^\tmap_attributes (\w+),/);
    if (a) { current = a[1]; out[current] = []; continue; }
    const c = line.match(/^\tconnection (north|south|west|east), \w+, (\w+), (-?\d+)/);
    if (c && current) out[current].push({ direction: c[1], map: c[2], offset: +c[3] });
  }
  return out;
}

function maps() {
  const links = connections();
  // map_const follows its `newgroup`; group numbers start at 1 (wMapGroup) and map numbers at 1 within a group.
  const sizes = new Map();
  let group = 0;
  let number = 0;
  for (const line of text('constants/map_constants.asm').split('\n')) {
    if (/^\s*newgroup /.test(line)) { group++; number = 0; continue; }
    const m = line.match(/^\s*map_const (\w+),\s*(\d+),\s*(\d+)/);
    if (m) sizes.set(norm(m[1]), { id: m[1], group, number: ++number, width: +m[2], height: +m[3] });
  }
  const blockFiles = labelFiles('data/maps/blocks.asm', 'INCBIN');
  const borders = new Map([...text('data/maps/attributes.asm').matchAll(/^\tmap_attributes (\w+), \w+, \$([0-9a-fA-F]{2})/gm)]
    .map((m) => [m[1], parseInt(m[2], 16)]));
  const out = {};
  for (const m of text('data/maps/maps.asm').matchAll(/^\tmap (\w+), TILESET_(\w+), (\w+), \w+, [^,]+, \w+, PALETTE_(\w+),/gm)) {
    const [, name, tileset, environment, palette] = m;
    const size = sizes.get(norm(name));
    if (!size) throw new Error(`no map_const for ${name}`);
    const file = blockFiles.get(`${name}_Blocks`);
    if (!file) throw new Error(`no block file for ${name}`);
    if (!borders.has(name)) throw new Error(`no border block for ${name}`);
    const blocks = bin(file);
    if (blocks.length !== size.width * size.height) throw new Error(`${name}: ${blocks.length} bytes, expected ${size.width}x${size.height}`);
    out[size.id] = { name, tileset, environment, palette, connections: links[name] ?? [], group: size.group, number: size.number, width: size.width, height: size.height, border: borders.get(name), source: file, blocks: [...blocks] };
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

// Event flags a new game starts with: the setevent lines of InitializeEventsScript (engine/events/std_scripts.asm),
// which PlayersHouse2F's MAPCALLBACK_NEWMAP runs once. Every other flag starts clear.
function initialEventFlags() {
  const body = text('engine/events/std_scripts.asm').split('\nInitializeEventsScript:\n')[1].split('\n\tend\n')[0];
  const flags = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s+(setevent|clearevent) (\w+)/);
    if (!m) continue;
    if (m[1] === 'setevent') flags.add(m[2]); else flags.delete(m[2]);
  }
  return [...flags];
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

// gfx/tilesets/roofs.pal: one entry per map group starting at group 0 (engine/gfx/color.asm RoofPals, indexed by wMapGroup).
function roofPalettes() {
  const out = [];
  let current;
  for (const line of text('gfx/tilesets/roofs.pal').split('\n')) {
    const c = line.match(/RGB (\d+),(\d+),(\d+), (\d+),(\d+),(\d+) ; (morn\/day|nite)/);
    if (!c) continue;
    const colors = [c.slice(1, 4).map(Number), c.slice(4, 7).map(Number)];
    if (c[7] === 'morn/day') { current = { day: colors }; out.push(current); } else current.nite = colors;
  }
  return out;
}

const PAL_BG = ['GRAY', 'RED', 'GREEN', 'WATER', 'YELLOW', 'BROWN', 'ROOF', 'TEXT'];
// Every RGB line, with one color (house.pal) or several (bg_tiles.pal: four per line), as [r,g,b] triples.
const rgbs = (src) => src.split('\n').filter((l) => /^\s*RGB /.test(l)).flatMap((l) => {
  const n = l.replace(/;.*$/, '').match(/\d+/g).map(Number);
  return Array.from({ length: n.length / 3 }, (_, i) => n.slice(i * 3, i * 3 + 3));
});
const palettesOf = (colors) => Array.from({ length: colors.length / 4 }, (_, i) => colors.slice(i * 4, i * 4 + 4));

// gfx/tileset_palette_maps.asm + gfx/tilesets/*_palette_map.asm: per tileset, 96 palette names for tile ids $00-$5f
// (VRAM bank 0) and 96 for ids $80-$df (bank 1). The macro packs two tiles per byte; names are listed in tile order.
function tilePaletteMaps() {
  const files = labelFiles('gfx/tileset_palette_maps.asm', 'INCLUDE');
  const out = {};
  for (const name of [...text('constants/tileset_constants.asm').matchAll(/^\s*const TILESET_(\w+)/gm)].map((m) => m[1])) {
    const label = [...files.keys()].find((l) => norm(l.replace(/^Tileset|PalMap$/g, '')) === norm(name));
    if (!label) throw new Error(`no palette map for ${name}`);
    const banks = [[], []];
    for (const m of text(files.get(label)).matchAll(/^\s*tilepal (\d), ([^;\n]+)/gm)) banks[+m[1]].push(...m[2].split(',').map((n) => n.trim()));
    if (banks[0].length !== 96 || banks[1].length !== 96) throw new Error(`${name}: ${banks[0].length}/${banks[1].length} palette entries`);
    for (const n of banks.flat()) if (!PAL_BG.includes(n)) throw new Error(`${name}: unknown palette ${n}`);
    out[name] = banks;
  }
  return out;
}

// data/maps/environment_colors.asm: 8 indexes into bg_tiles.pal for each time of day (morn, day, nite, dark).
function environmentColors() {
  const src = text('data/maps/environment_colors.asm');
  const sets = {};
  for (const m of src.matchAll(/^\.(\w+)Colors:\n((?:\tdb [^\n]+\n){4})/gm)) {
    const rows = m[2].trim().split('\n').map((r) => [...r.matchAll(/\$([0-9a-f]{2})/g)].map((x) => parseInt(x[1], 16)));
    sets[m[1].toUpperCase()] = { morn: rows[0], day: rows[1], nite: rows[2], dark: rows[3] };
  }
  const pointers = {};
  const table = src.split('EnvironmentColorsPointers:')[1].split('assert_table_length')[0];
  for (const m of table.matchAll(/dw \.(\w+)Colors\s*; (\w+)/g)) pointers[m[2]] = m[1].toUpperCase();
  return { sets, pointers };
}

// constants/collision_constants.asm + data/collision/collision_permissions.asm: COLL_* values and, per value, the
// permission the engine checks when walking (LAND_TILE 0, WATER_TILE 1, WALL_TILE $0f, optionally | TALK $10).
function collisionData() {
  const constants = text('constants/collision_constants.asm');
  const bits = Object.fromEntries([...constants.matchAll(/^DEF (LAND_TILE|WATER_TILE|WALL_TILE|TALK)\s+EQU \$([0-9a-f]+)/gm)].map((m) => [m[1], parseInt(m[2], 16)]));
  const values = Object.fromEntries([...constants.matchAll(/^DEF COLL_(\w+)\s+EQU \$([0-9a-f]+)/gm)].map((m) => [m[1], parseInt(m[2], 16)]));
  const permissions = [...text('data/collision/collision_permissions.asm').matchAll(/^\tdb ([A-Z_| ]+?)\s*(?:;.*)?$/gm)]
    .map((m) => m[1].split('|').reduce((v, name) => v | bits[name.trim()], 0));
  if (permissions.length !== 256) throw new Error(`${permissions.length} collision permissions`);
  return { values, permissions };
}

// gfx/tilesets/*.png for every tileset (tile graphics: first 96 tiles are VRAM bank 0, the next 96 bank 1) and the
// per-map-group roof art (data/maps/roofs.asm: LoadMapGroupRoof copies 9 tiles to tile id $0a).
function tilesetImages() {
  const files = new Map([...labelFiles('gfx/tilesets.asm', 'INCBIN')].filter(([l]) => /GFX$/.test(l)).map(([l, f]) => [l.replace(/^Tileset|GFX$/g, ''), f]));
  const images = {};
  for (const name of [...text('constants/tileset_constants.asm').matchAll(/^\s*const TILESET_(\w+)/gm)].map((m) => m[1])) {
    const label = [...files.keys()].find((l) => norm(l) === norm(name));
    if (!label) throw new Error(`no graphics for ${name}`);
    const png = bin(files.get(label).replace(/\.2bpp\.lz$/, '.png'));
    images[name] = { width: png.readUInt32BE(16), height: png.readUInt32BE(20), png: png.toString('base64') };
  }
  const roofs = text('data/maps/roofs.asm');
  const names = [...roofs.matchAll(/^\tconst ROOF_(\w+)\s+; (\d+)/gm)].map((m) => m[1]);
  const roofPng = [...roofs.matchAll(/INCBIN "gfx\/tilesets\/roofs\/(\w+)\.2bpp"/g)].map((m) => bin(`gfx/tilesets/roofs/${m[1]}.png`).toString('base64'));
  const table = roofs.split('MapGroupRoofs:')[1].split('Roofs:')[0];
  const groupRoofs = [...table.matchAll(/^\tdb (-1|ROOF_\w+)/gm)].map((m) => (m[1] === '-1' ? null : names.indexOf(m[1].replace('ROOF_', ''))));
  return { images, roofs: { png: roofPng, groupRoofs } };
}

// data/decorations/attributes.asm rows correspond to constants/deco_constants.asm in order; the numeric last field of
// bed, carpet, plant and poster rows is the block written into the map (engine/overworld/decorations.asm
// ToggleMaptileDecorations, whose `lb de, x, y` comments give the 16x16-square coordinates).
function decorations() {
  // Decoration values count up from 1 after "const_def 1" under "; decorations:"; attribute row i is value i (row 0 is unused).
  const consts = text('constants/deco_constants.asm').split('; - DecorationAttributes')[1];
  const names = [...consts.matchAll(/^\tconst (\w+)/gm)].map((m) => m[1]);
  const rows = [...text('data/decorations/attributes.asm').matchAll(/^\tdecoration (\w+),\s*(\w+),\s*(\w+),\s*(\w+),\s*(\$[0-9a-f]+|\w+)/gm)];
  const blocks = {};
  rows.forEach((r, i) => { if (i >= 1 && /^\$/.test(r[5])) blocks[names[i - 1]] = parseInt(r[5].slice(1), 16); });
  const ev = text('engine/overworld/decorations.asm').split('ToggleMaptileDecorations:')[1].split('SetPosterVisibility:')[0];
  const placement = Object.fromEntries([...ev.matchAll(/lb de, (\d+), (\d+) ; ([\w -]+?) coordinates/g)].map((m) => [m[3].replace(/\W+/g, '_'), [+m[1], +m[2]]]));
  const init = text('engine/overworld/decorations.asm').split('InitDecorations:')[1].split('ret')[0];
  const defaults = { bed: init.match(/ld a, (DECO_\w+)\s+ld \[wDecoBed\]/)[1], poster: init.match(/ld a, (DECO_\w+)\s+ld \[wDecoPoster\]/)[1] };
  return { blocks, placement, defaults };
}

// gfx/font/font.png (tile n is character code $80 + n), gfx/frames/1.png (┌ ─ ┐ │ └ ┘), gfx/font/space.png, the charmap and
// the text palette gfx/font/bg_text.pal; frame 1 is the default wTextboxFrame.
function fontData() {
  const codes = {};
  for (const m of text('constants/charmap.asm').matchAll(/^\tcharmap "([^"]+)",\s+\$([0-9a-f]{2})/gm)) {
    if (!m[1].startsWith('<') || m[1] === '<COLON>') codes[m[1]] = parseInt(m[2], 16);
  }
  return {
    font: bin('gfx/font/font.png').toString('base64'),
    extra: bin('gfx/font/font_extra.png').toString('base64'),
    frame: bin('gfx/frames/1.png').toString('base64'),
    space: bin('gfx/font/space.png').toString('base64'),
    codes,
    palette: rgbs(text('gfx/font/bg_text.pal')),
  };
}

// tileset_palettes.asm LoadSpecialMapPalette: fixed palette sets for some tilesets. The mansion copies mansion_1.pal, then
// replaces YELLOW with mansion_2's palette, WATER with mansion_1's palette 6 and ROOF with mansion_1's palette 8.
function specialPalettes() {
  const load = (f) => palettesOf(rgbs(text(`gfx/tilesets/${f}.pal`)));
  const out = Object.fromEntries(Object.entries({
    HOUSE: 'house', POKECOM_CENTER: 'pokecom_center', BATTLE_TOWER_INSIDE: 'battle_tower_inside', RADIO_TOWER: 'radio_tower', ICE_PATH: 'ice_path',
  }).map(([k, f]) => [k, load(f)]));
  const m1 = load('mansion_1');
  const mansion = m1.slice(0, 8);
  mansion[PAL_BG.indexOf('YELLOW')] = load('mansion_2')[0];
  mansion[PAL_BG.indexOf('WATER')] = m1[6];
  mansion[PAL_BG.indexOf('ROOF')] = m1[8];
  out.MANSION = mansion;
  return out;
}

// Frames each sound effect plays, computed the way audio/engine.asm SetNoteDuration does: a note of length L at note speed S
// lasts (S*L*tempo + carry) >> 8 frames, the low byte carrying into the next note. The longest channel decides; effects
// that loop forever are null. Commands per channel come from audio/sfx.asm, SFX_* ids from audio/sfx_pointers.asm.
function sfxFrames() {
  const { blocks } = parseBlocks('audio/sfx.asm');
  Object.assign(blocks, parseBlocks('audio/sfx_crystal.asm').blocks);
  const ids = [...text('constants/sfx_constants.asm').matchAll(/^\tconst (SFX_\w+)/gm)].map((m) => m[1]);
  const labels = [...text('audio/sfx_pointers.asm').matchAll(/^\tdba (\w+)/gm)].map((m) => m[1]);
  const initialTempo = (channels) => {
    for (const label of channels) for (const [name, ...args] of blocks[label] ?? []) if (name === 'tempo') return Number(args[0]);
    return 256;
  };
  const channelFrames = (label, tempo0) => {
    let frames = 0, tempo = tempo0, speed = 1, carry = 0, steps = 0;
    const stack = [];
    const loops = new Map();
    let key = label, i = 0;
    for (;;) {
      if (++steps > 200000) return null;
      const block = blocks[key];
      if (!block) return frames;
      if (i >= block.length) {                       // fall into the next label, as the ROM does
        const keys = Object.keys(blocks); key = keys[keys.indexOf(key) + 1]; i = 0; if (key === undefined) return frames; continue;
      }
      const [name, ...a] = block[i++];
      const note = (units) => { const t = (speed * units) & 0xff; const v = t * tempo + carry; frames += v >> 8; carry = v & 0xff; };
      if (name === 'note' || name === 'rest' || name === 'drum_note') note(Number(a[a.length - 1]));
      else if (name === 'square_note' || name === 'noise_note') note(Number(a[0]) + 1);
      else if (name === 'note_type' || name === 'drum_speed') speed = Number(a[0]);
      else if (name === 'tempo') tempo = Number(a[0]);
      else if (name === 'sound_ret') { if (!stack.length) return frames; ({ key, i } = stack.pop()); }
      else if (name === 'sound_call') { stack.push({ key, i }); key = a[0]; i = 0; }
      else if (name === 'sound_jump') { key = a[0]; i = 0; }
      else if (name === 'sound_loop') {
        const count = Number(a[0]);
        if (count === 0) return null;
        const id = `${key}:${i}`;
        const done = loops.get(id) ?? 1;
        if (done < count) { loops.set(id, done + 1); key = a[1]; i = 0; } else loops.delete(id);
      }
    }
  }
  const out = {};
  labels.forEach((label, n) => {
    const channels = (blocks[label] ?? []).filter(([c]) => c === 'channel').map((c) => c[2]);
    const tempo = initialTempo(channels);
    const lengths = channels.map((ch) => channelFrames(ch, tempo));
    out[ids[n]] = lengths.includes(null) ? null : Math.max(0, ...lengths);
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

// Split macro arguments on commas outside double quotes. Quoted strings are returned without their quotes.
function splitArgs(rest) {
  const out = [];
  let cur = '';
  let quoted = false;
  let wasQuoted = false;
  for (const ch of rest) {
    if (ch === '"') { quoted = !quoted; wasQuoted = true; continue; }
    if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; wasQuoted = false; continue; }
    cur += ch;
  }
  if (cur.trim() || wasQuoted || out.length) out.push(wasQuoted ? cur : cur.trim());
  return out;
}

// Labelled command blocks of an .asm file: scripts, text, movement data. Local labels (.Name) are keyed Global.Name.
// Event-table macros (warps, objects, ...) live in events.js, so they are skipped; scene scripts and map callbacks
// are returned separately. Each command is [name, ...args].
const TABLE_MACROS = /^(def_(warp|coord|bg|object)_events|object_const_def|const |warp_event|coord_event|bg_event|object_event)/;
function parseBlocks(path) {
  const blocks = {};
  const scenes = [];
  const callbacks = [];
  let global = null;
  let current = null;
  for (const raw of text(path).split('\n')) {
    const noComment = raw.replace(/^((?:[^";]|"[^"]*")*);.*$/, '$1').replace(/\s+$/, '');
    if (!noComment.trim()) continue;
    const label = noComment.match(/^(\w+)::?\s*(.*)$/) ?? noComment.match(/^(\.\w+)(?::{1,2})?\s*(.*)$/);   // local labels may omit the colon
    let body = noComment;
    if (label) {
      if (label[1].startsWith('.')) current = `${global}${label[1]}`; else { global = label[1]; current = global; }
      blocks[current] = [];
      body = label[2];
      if (!body.trim()) continue;
    }
    const t = body.trim();
    if (current === null || TABLE_MACROS.test(t)) continue;
    const [name, ...rest] = [t.match(/^\S+/)[0], t.replace(/^\S+\s*/, '')];
    if (name === 'def_scene_scripts' || name === 'def_callbacks') continue;
    if (name === 'scene_script') { scenes.push(splitArgs(rest[0])); continue; }
    if (name === 'scene_const') { scenes.push([null, rest[0]]); continue; }
    if (name === 'callback') { callbacks.push(splitArgs(rest[0])); continue; }
    blocks[current].push([name, ...(rest[0] ? splitArgs(rest[0]) : [])]);
  }
  for (const k of Object.keys(blocks)) if (blocks[k].length === 0) delete blocks[k];
  return { blocks, scenes, callbacks };
}

function scriptFiles() {
  const files = {};
  const allScenes = {};
  const allCallbacks = {};
  const mapNames = [...text('data/maps/maps.asm').matchAll(/^\tmap (\w+), TILESET_/gm)].map((m) => m[1]);
  for (const name of mapNames) {
    let parsed;
    try { parsed = parseBlocks(`maps/${name}.asm`); } catch { continue; }
    allScenes[name] = parsed.scenes;
    allCallbacks[name] = parsed.callbacks;
    files[`scripts/${name}.js`] = `// GENERATED by tools/extract-browser-data.mjs from maps/${name}.asm. Do not edit.\n`
      + `// SCRIPTS: label -> commands ([name, ...args]; quoted strings unquoted). SCENES: [script, scene name] in id order (script is null for a scene_const without one). CALLBACKS: [type, script].\n`
      + `export const SCENES = ${JSON.stringify(parsed.scenes)};\n`
      + `export const CALLBACKS = ${JSON.stringify(parsed.callbacks)};\n`
      + `export const SCRIPTS = ${JSON.stringify(parsed.blocks)};\n`;
  }
  // Shared scripts: std scripts (jumpstd) and the decoration descriptions (describedecoration).
  const std = { ...parseBlocks('engine/events/std_scripts.asm').blocks, ...parseBlocks('engine/overworld/decorations.asm').blocks };
  files['scripts/_std.js'] = `// GENERATED by tools/extract-browser-data.mjs from engine/events/std_scripts.asm and engine/overworld/decorations.asm. Do not edit.\n`
    + `export const SCRIPTS = ${JSON.stringify(std)};\n`;
  files['scenes.js'] = `// GENERATED by tools/extract-browser-data.mjs from maps/*.asm (def_scene_scripts, def_callbacks). Do not edit.\n`
    + `// SCENES[map] = [script, scene name] in scene-id order (script null for a scene_const without one); CALLBACKS[map] = [type, script].\n`
    + `export const SCENES = ${JSON.stringify(allScenes)};\nexport const CALLBACKS = ${JSON.stringify(allCallbacks)};\n`;
  // Shared text (text_far / farwritetext targets): every block in data/text/*.asm.
  const shared = {};
  for (const file of readdirSync(join(ROOT, 'data/text')).filter((f) => f.endsWith('.asm')).sort()) {
    Object.assign(shared, parseBlocks(`data/text/${file}`).blocks);
  }
  files['scripts/_text.js'] = `// GENERATED by tools/extract-browser-data.mjs from data/text/*.asm. Do not edit.\n`
    + `export const SCRIPTS = ${JSON.stringify(shared)};\n`;
  return files;
}

const rows = (a) => a.map((r) => `    ${JSON.stringify(r)},`).join('\n');

export function generate() {
  const ts = tilesets();
  const tileset = Object.entries(ts).map(([k, v]) =>
    `  ${k}: {\n  metatiles: [\n${rows(v.metatiles)}\n  ],\n  collision: [\n${rows(v.collision)}\n  ],\n},`).join('\n');
  const mp = Object.entries(maps()).map(([k, v]) =>
    `  ${k}: { name: '${v.name}', tileset: '${v.tileset}', environment: '${v.environment}', palette: '${v.palette}', connections: ${JSON.stringify(v.connections)}, group: ${v.group}, number: ${v.number}, width: ${v.width}, height: ${v.height}, border: ${v.border}, source: '${v.source}',\n    blocks: ${JSON.stringify(v.blocks)} },`).join('\n');
  const spriteTable = Object.entries(sprites()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
  const eventTable = Object.entries(events()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
  return {
    ...scriptFiles(),
    'sprites.js': `// GENERATED by tools/extract-browser-data.mjs from constants/sprite_constants.asm, data/sprites/sprites.asm, gfx/sprites.asm,\n`
      + `// gfx/sprites/*.png and gfx/overworld/npc_sprites.pal. Do not edit.\n`
      + `// png is the source sheet (4 grays: white is transparent, then palette colors 1-3); palette is the sprite's default PAL_OW_*.\n`
      + `export const SPRITES = {\n${spriteTable}\n};\n`
      + `// OBJECT_PALETTES[timeOfDay][paletteIndex] = four [r,g,b] colors in 5-bit channels; PAL_OW_x and PAL_NPC_x both index 0-7.\n`
      + `export const OBJECT_PALETTES = ${JSON.stringify(npcPalettes())};\n`,
    'palettes.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/tilesets/bg_tiles.pal, data/maps/environment_colors.asm,\n`
      + `// gfx/tilesets/{house,pokecom_center,battle_tower_inside,radio_tower,ice_path}.pal and gfx/tilesets/*_palette_map.asm. Do not edit.\n`
      + `// Colors are [r,g,b] in 5-bit channels, four per palette.\n`
      + `export const PAL_BG = ${JSON.stringify(PAL_BG)};\n`
      + `export const BG_TILE_PALETTES = ${JSON.stringify(palettesOf(rgbs(text('gfx/tilesets/bg_tiles.pal'))))};\n`
      + `export const ENVIRONMENT_COLORS = ${JSON.stringify(environmentColors())};\n`
      + `export const SPECIAL_PALETTES = ${JSON.stringify(specialPalettes())};\n`
      + `export const TILE_PALETTE_MAPS = ${JSON.stringify(tilePaletteMaps())};\n`,
    'collision.js': `// GENERATED by tools/extract-browser-data.mjs from constants/collision_constants.asm and data/collision/collision_permissions.asm. Do not edit.\n`
      + `// COLLISION_VALUES: COLL_* name (without the prefix) -> value. COLLISION_PERMISSIONS[value]: 0 land, 1 water, $0f wall, | $10 talk.\n`
      + `export const COLLISION_VALUES = ${JSON.stringify(collisionData().values)};\n`
      + `export const COLLISION_PERMISSIONS = ${JSON.stringify(collisionData().permissions)};\n`,
    'tileset-images.js': (() => {
      const { images, roofs } = tilesetImages();
      return `// GENERATED by tools/extract-browser-data.mjs from gfx/tilesets/*.png and data/maps/roofs.asm. Do not edit.\n`
        + `// TILESET_IMAGES[tileset].png is the source sheet (16 tiles per row). ROOFS.png[roof] is a 3x3-tile roof sheet and\n`
        + `// ROOFS.groupRoofs[mapGroup] the roof index (or null) copied over tile ids $0a-$12 for that group's outdoor maps.\n`
        + `export const TILESET_IMAGES = ${JSON.stringify(images)};\nexport const ROOFS = ${JSON.stringify(roofs)};\n`;
    })(),
    'decorations.js': `// GENERATED by tools/extract-browser-data.mjs from constants/deco_constants.asm, data/decorations/attributes.asm and\n`
      + `// engine/overworld/decorations.asm. Do not edit.\n`
      + `// DECORATION_BLOCKS: DECO_* -> block ID; DECORATION_PLACEMENT: where each kind is written (16x16-square coordinates);\n`
      + `// NEW_GAME_DECORATIONS: InitDecorations.\n`
      + `export const DECORATION_BLOCKS = ${JSON.stringify(decorations().blocks)};\n`
      + `export const DECORATION_PLACEMENT = ${JSON.stringify(decorations().placement)};\n`
      + `export const NEW_GAME_DECORATIONS = ${JSON.stringify(decorations().defaults)};\n`,
    'font.js': (() => {
      const f = fontData();
      return `// GENERATED by tools/extract-browser-data.mjs from gfx/font, gfx/frames/1.png and constants/charmap.asm. Do not edit.\n`
        + `// FONT_CODES: character -> code; glyph = tile (code - $80) of FONT_PNG, or tile (code - $60) of FONT_EXTRA_PNG for codes $63-$78 (quotes, ellipsis...); 16 tiles per row, black ink on white. The frame\n`
        + `// sheet holds six tiles in order: top-left, horizontal, top-right, vertical, bottom-left, bottom-right.\n`
        + `export const FONT_PNG = '${f.font}';\nexport const FONT_EXTRA_PNG = '${f.extra}';\nexport const FRAME_PNG = '${f.frame}';\nexport const SPACE_PNG = '${f.space}';\n`
        + `export const FONT_CODES = ${JSON.stringify(f.codes)};\nexport const TEXT_PALETTE = ${JSON.stringify(f.palette)};\n`;
    })(),
    'sfx.js': `// GENERATED by tools/extract-browser-data.mjs from audio/sfx.asm, audio/sfx_crystal.asm and audio/sfx_pointers.asm. Do not edit.\n`
      + `// SFX_FRAMES[SFX_*] = frames the effect plays (waitsfx waits this long); null for effects that loop forever.\n`
      + `export const SFX_FRAMES = ${JSON.stringify(sfxFrames())};\n`,
    'roofs.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/tilesets/roofs.pal. Do not edit.\n`
      + `// ROOF_PALETTES[mapGroup] = { day, nite }: two [r,g,b] 5-bit colors that replace BG palette ROOF colors 1 and 2 on TOWN and ROUTE maps.\n`
      + `export const ROOF_PALETTES = ${JSON.stringify(roofPalettes())};\n`,
    'events.js': `// GENERATED by tools/extract-browser-data.mjs from maps/*.asm (def_warp_events, def_coord_events, def_bg_events, def_object_events). Do not edit.\n`
      + `// Keys are map names as in data/maps/maps.asm. Object fields follow the object_event macro (macros/scripts/maps.asm).\n`
      + `export const EVENTS = {\n${eventTable}\n};\n`
      + `// Flags set at the start of a new game (InitializeEventsScript); all others start clear. An object is hidden while its flag is set.\n`
      + `export const INITIAL_EVENT_FLAGS = ${JSON.stringify(initialEventFlags())};\n`,
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
  for (const [name, body] of Object.entries(generate())) {
    mkdirSync(dirname(join(OUT, name)), { recursive: true });
    writeFileSync(join(OUT, name), body);
  }
}
