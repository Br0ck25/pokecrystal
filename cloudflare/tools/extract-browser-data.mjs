// Generates cloudflare/src/generated/*.js from the disassembly's own data files.
// Run: node tools/extract-browser-data.mjs   (from cloudflare/). Dev-time only; the
// deployed app just serves the generated modules, so Pages stays no-build.
import { inflateSync } from 'node:zlib';
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
  for (const m of text('data/maps/maps.asm').matchAll(/^\tmap (\w+), TILESET_(\w+), (\w+), (\w+), [^,]+, \w+, PALETTE_(\w+),/gm)) {
    const [, name, tileset, environment, landmark, palette] = m;
    const size = sizes.get(norm(name));
    if (!size) throw new Error(`no map_const for ${name}`);
    const file = blockFiles.get(`${name}_Blocks`);
    if (!file) throw new Error(`no block file for ${name}`);
    if (!borders.has(name)) throw new Error(`no border block for ${name}`);
    const blocks = bin(file);
    if (blocks.length !== size.width * size.height) throw new Error(`${name}: ${blocks.length} bytes, expected ${size.width}x${size.height}`);
    out[size.id] = { name, tileset, environment, landmark, palette, connections: links[name] ?? [], group: size.group, number: size.number, width: size.width, height: size.height, border: borders.get(name), source: file, blocks: [...blocks] };
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

// gfx/font/font.png (tile n is character code $80 + n), gfx/frames/1-8.png (┌ ─ ┐ │ └ ┘, one sheet per wTextboxFrame), gfx/font/space.png, the charmap and
// the text palette gfx/font/bg_text.pal; frame 1 is the default.
function fontData() {
  const codes = {};
  for (const m of text('constants/charmap.asm').matchAll(/^\tcharmap "([^"]+)",\s+\$([0-9a-f]{2})/gm)) {
    if (!m[1].startsWith('<') || ['<COLON>', '<PK>', '<MN>', '<PO>', '<KE>'].includes(m[1])) codes[m[1]] = parseInt(m[2], 16);
  }
  return {
    font: bin('gfx/font/font.png').toString('base64'),
    extra: bin('gfx/font/font_extra.png').toString('base64'),
    frames: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => bin(`gfx/frames/${n}.png`).toString('base64')),
    space: bin('gfx/font/space.png').toString('base64'),
    codes,
    palette: rgbs(text('gfx/font/bg_text.pal')),
  };
}

// constants/item_constants.asm, data/items/{names,attributes,descriptions}.asm: every item by constant name (TM_*/HM_* included).
function itemData() {
  const src = text('constants/item_constants.asm').split('\n');
  const ids = {};
  let id = 0;
  for (const line of src) {
    const c = line.match(/^\tconst (\w+)/), t = line.match(/^\tadd_(?:tm|hm) (\w+)\s*; ([0-9a-f]{2})/);
    if (/^DEF NUM_ITEMS/.test(line)) break;
    if (c) ids[c[1]] = id++;
  }
  for (const line of src) {
    const t = line.match(/^\tadd_tm (\w+)\s*; ([0-9a-f]{2})/), h = line.match(/^\tadd_hm (\w+)\s*; ([0-9a-f]{2})/);
    if (t) ids[`TM_${t[1]}`] = parseInt(t[2], 16);
    if (h) ids[`HM_${h[1]}`] = parseInt(h[2], 16);
  }
  const names = [...text('data/items/names.asm').matchAll(/^\tli "([^"]*)"/gm)].map((m) => m[1]);   // names[id - 1]
  const attrs = [...text('data/items/attributes.asm').matchAll(/^\titem_attribute ([^;\n]+)/gm)].map((m) => m[1].split(',').map((x) => x.trim()));
  const descTable = [...text('data/items/descriptions.asm').split('ItemDescriptions:')[1].split('\n\n')[0].matchAll(/^\tdw (\w+)/gm)].map((m) => m[1]);
  const descText = {};
  for (const m of text('data/items/descriptions.asm').matchAll(/^(\w+Desc):\n((?:\t.*\n)+)/gm)) {
    descText[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1].replace(/@$/, ''));
  }
  const items = {};
  for (const [name, n] of Object.entries(ids)) {
    if (n === 0) continue;
    const a = attrs[n - 1];
    items[name] = { id: n, name: names[n - 1], desc: descText[descTable[n - 1]] ?? [],
      ...(a ? { price: a[0].startsWith('$') ? parseInt(a[0].slice(1), 16) : Number(a[0]), hold: a[1], param: a[2], property: a[3], pocket: a[4], field: a[5], battle: a[6] } : {}) };
  }
  return items;
}

// Pokémon: constants/pokemon_constants.asm, data/pokemon/{names,base_stats,pic_pointers}.asm, gfx/pokemon/*/{front,back}.png and shiny.pal.
let pokemonMemo;
const pokemonAll = () => (pokemonMemo ??= pokemonData());
function pokemonData() {
  const consts = [];
  for (const line of text('constants/pokemon_constants.asm').split('\n')) {
    const c = line.match(/^\tconst (\w+)\s*; [0-9a-f]{2}/);
    if (/^DEF NUM_POKEMON/.test(line)) break;
    if (c) consts.push(c[1]);
  }
  const names = [...text('data/pokemon/names.asm').matchAll(/^\tdname "([^"]*)"/gm)].map((m) => m[1]);
  const files = [...text('data/pokemon/base_stats.asm').matchAll(/INCLUDE "(data\/pokemon\/base_stats\/\w+\.asm)"/g)].map((m) => m[1]);
  const picFiles = new Map([...text('gfx/pics.asm').matchAll(/^(\w+):\s+INCBIN "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const pics = [...text('data/pokemon/pic_pointers.asm').matchAll(/^\tdba_pics ([^;\n]*)(;.*)?$/gm)].map((m) => {
    const labels = m[1].trim() ? m[1].split(',').map((l) => l.trim()) : /Unown/.test(m[2] ?? '') ? ['UnownAFrontpic', 'UnownABackpic'] : [];   // Unown has its own table; use letter A
    return labels.map((l) => picFiles.get(l));
  });
  const shiny = rgbs(text('data/pokemon/palettes.asm').split('\n').filter((l) => /^\s*RGB /.test(l) || /^INCLUDE/.test(l)).join('\n'));
  const out = {};
  consts.forEach((constant, i) => {
    const src = text(files[i]);
    const nums = (re) => { const m = src.match(re); if (!m) throw new Error(`${files[i]}: no match for ${re}`); return m.slice(1).map((v) => v.trim()); };
    const [hp, atk, def, spd, sat, sdf] = src.match(/^\tdb\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\s*$/m).slice(1).map(Number);
    const dir = pics[i][0].match(/gfx\/pokemon\/([^/]+)\//)[1];
    const front = indexedPng(`gfx/pokemon/${dir}/front.png`), back = indexedPng(`gfx/pokemon/${dir}/back.png`);
    const size = front.width;                                  // 40, 48 or 56 pixels: the first frame is width x width
    const crop = (img, w) => img.pixels.slice(0, w * w);
    const pal5 = front.palette.map((c) => c.map((v) => Math.round((v * 31) / 255)));
    const shinyPal = rgbs(text(`gfx/pokemon/${dir.startsWith("unown_") ? "unown" : dir}/shiny.pal`));
    out[constant] = {
      meta: { id: i + 1, name: names[i], dir, stats: { hp, atk, def, spd, sat, sdf }, types: nums(/^\tdb (\w+), (\w+) ; type/m),
        catchRate: Number(nums(/^\tdb (\d+) ; catch rate/m)[0]), baseExp: Number(nums(/^\tdb (\d+) ; base exp/m)[0]),
        items: nums(/^\tdb (\w+), (\w+) ; items/m), gender: nums(/^\tdb (\w+) ; gender ratio/m)[0], eggCycles: Number(nums(/^\tdb (\d+) ; step cycles to hatch/m)[0]),
        growth: nums(/^\tdb (\w+) ; growth rate/m)[0], eggGroups: nums(/^\tdn (\w+), (\w+)/m),
        tmhm: (src.match(/^\ttmhm ([^;\n]*)/m)?.[1] ?? '').split(',').map((t) => t.trim()).filter(Boolean) },
      pic: { size, front: crop(front, size), back: crop(back, 48), palette: pal5, shiny: [pal5[0], shinyPal[0], shinyPal[1], pal5[3]] },
    };
  });
  return out;
}

// data/tileset_anims.asm + engine/tilesets/tileset_anims.asm + gfx/tilesets/{water,flower,fountain,lava,whirlpool,tower-pillar,forest-tree}:
// each tileset's animation list (one entry per frame) and the tile graphics they draw, as 64-digit palette-index strings.
function tileAnimData() {
  const src = text('data/tileset_anims.asm');
  const code = text('engine/tilesets/tileset_anims.asm');
  const tile = (png, row = 0) => { const img = grayPng(png); return img.pixels.slice(row * 64, row * 64 + 64); };
  const strip = (png) => { const img = grayPng(png); return Array.from({ length: img.height / 8 }, (_, i) => img.pixels.slice(i * 64, i * 64 + 64)); };
  const frames = {
    water: strip('gfx/tilesets/water/water.png'),
    flower: ['cgb_1', 'cgb_2'].map((n) => tile(`gfx/tilesets/flower/${n}.png`)),
    fountain: [1, 2, 3, 4, 5].map((n) => tile(`gfx/tilesets/fountain/${n}.png`)),
    lava: [1, 2, 3, 4].map((n) => tile(`gfx/tilesets/lava/${n}.png`)),
    forestTree: [1, 2, 3, 4].map((n) => tile(`gfx/tilesets/forest-tree/${n}.png`)),
  };
  const pointers = {};   // label -> { tile, frames name } for the Whirlpool and TowerPillar pointer tables
  for (const m of code.matchAll(/^(\w+(?:Pointer\d+|Frames\d)):\s+dw vTiles2 tile \$([0-9a-f]+), (\w+)/gm)) {
    const png = m[3].startsWith('Whirlpool') ? `gfx/tilesets/whirlpool/${m[3].slice(-1)}.png` : `gfx/tilesets/tower-pillar/${m[3].replace('TowerPillarTile', '')}.png`;
    pointers[m[1]] = { tile: parseInt(m[2], 16), frames: strip(png) };
  }
  const OPS = { AnimateWaterTile: 'water', AnimateFlowerTile: 'flower', AnimateFountainTile: 'fountain', AnimateWaterPalette: 'waterPalette',
    WaitTileAnimation: 'wait', StandingTileFrame8: 'tick8', StandingTileFrame: 'tick', DoneTileAnimation: 'done', AnimateWhirlpoolTile: 'frames',
    AnimateTowerPillarTile: 'tower', AnimateLavaBubbleTile1: 'lava1', AnimateLavaBubbleTile2: 'lava2', ReadTileToAnimBuffer: 'read',
    ScrollTileRightLeft: 'scrollRL', ScrollTileDown: 'scrollDown', WriteTileFromAnimBuffer: 'write', FlickeringCaveEntrancePalette: 'flicker',
    ForestTreeLeftAnimation: 'forestL', ForestTreeRightAnimation: 'forestR', ForestTreeLeftAnimation2: 'forestL', ForestTreeRightAnimation2: 'forestR' };
  const lists = {};
  let pending = [];
  for (const line of src.split('\n')) {
    const label = line.match(/^(\w+Anim):/);
    if (label) { pending.push(label[1]); continue; }
    const f = line.match(/^\ttileframe (\w+)(?:,\s+(.*))?/);
    if (!f) continue;
    const op = OPS[f[1]];
    if (!op) throw new Error(`unknown tile animation ${f[1]}`);
    const arg = f[2]?.trim();
    const entry = { op };
    if (arg?.startsWith('vTiles2 tile')) entry.tile = parseInt(arg.match(/\$([0-9a-f]+)/)[1], 16);
    else if (arg && pointers[arg]) { entry.tile = pointers[arg].tile; entry.frames = pointers[arg].frames; }
    for (const l of pending) lists[l] = lists[l] ?? [];
    for (const l of pending) lists[l].push(entry);
    if (op === 'done') pending = [];
  }
  const byTileset = {};
  for (const m of text('data/tilesets.asm').matchAll(/^\ttileset (\w+)/gm)) byTileset[norm(m[1].replace(/^Tileset/, '') || '0')] = `${m[1]}Anim`;
  return { lists, frames, byTileset };
}

// constants/move_constants.asm, data/moves/{moves,names,descriptions}.asm
function moveData() {
  const consts = [];
  for (const line of text('constants/move_constants.asm').split('\n')) {
    const c = line.match(/^\tconst (\w+)/);
    if (/^DEF NUM_ATTACKS/.test(line)) break;
    if (c) consts.push(c[1]);
  }
  const names = [...text('data/moves/names.asm').matchAll(/^\tli "([^"]*)"/gm)].map((m) => m[1]);
  const rows = [...text('data/moves/moves.asm').matchAll(/^\tmove (\w+),\s+(\w+),\s+(\d+),\s+(\w+),\s+(\d+),\s+(\d+),\s+(\d+)/gm)];
  const table = [...text('data/moves/descriptions.asm').split('MoveDescriptions::')[1].split('\n\n')[0].matchAll(/^\tdw (\w+)/gm)].map((m) => m[1]);
  const desc = {};
  for (const m of text('data/moves/descriptions.asm').matchAll(/^(\w+Description):\n((?:\t.*\n)+)/gm)) desc[m[1]] = [...m[2].matchAll(/"([^"]*)"/g)].map((x) => x[1].replace(/@$/, ''));
  const out = {};
  rows.forEach((r, i) => {
    out[r[1]] = { id: i + 1, name: names[i], effect: r[2], power: Number(r[3]), type: r[4], accuracy: Number(r[5]), pp: Number(r[6]), chance: Number(r[7]), desc: desc[table[i]] ?? [] };
  });
  return out;
}

// data/pokemon/evos_attacks.asm: per species evolutions [method, param, species] and the level-up learnset [level, move]; data/growth_rates.asm
function evosAttacksData() {
  const src = text('data/pokemon/evos_attacks.asm');
  const order = [...text('data/pokemon/evos_attacks_pointers.asm').matchAll(/^\tdw (\w+)/gm)].map((m) => m[1]);
  const consts = [];
  for (const line of text('constants/pokemon_constants.asm').split('\n')) {
    const c = line.match(/^\tconst (\w+)\s*; [0-9a-f]{2}/);
    if (/^DEF NUM_POKEMON/.test(line)) break;
    if (c) consts.push(c[1]);
  }
  const out = {};
  order.forEach((label, i) => {
    const body = src.split(`${label}:`)[1].split(/\n\n|\n\w+EvosAttacks:/)[0];
    const lines = body.split('\n').map((l) => l.replace(/;.*$/, '').trim()).filter((l) => l.startsWith('db'));
    const evolutions = [], learnset = [];
    let section = 0;
    for (const l of lines) {
      const a = l.slice(2).split(',').map((x) => x.trim());
      if (a.length === 1 && a[0] === '0') { section++; continue; }
      if (section === 0) evolutions.push(a); else if (section === 1) learnset.push([Number(a[0]), a[1]]);
    }
    out[consts[i]] = { evolutions, learnset };
  });
  return out;
}
function growthData() {
  return [...text('data/growth_rates.asm').matchAll(/^\tgrowth_rate (\d+), (\d+),\s+(-?\d+),\s+(\d+),\s+(\d+)/gm)].map((m) => m.slice(1).map(Number));
}

// data/text/name_input_chars.asm: the naming screen's character boards as rows of strings (the game places the strings as written).
// Menu icons (data/pokemon/menu_icons.asm, data/icon_pointers.asm, gfx/icons.asm): the species -> icon sheet table, and each
// sheet's two 16x16 frames (the sheet is 16x32) as palette-index digits.
function monIconData() {
  const files = Object.fromEntries([...text('gfx/icons.asm').matchAll(/^(\w+Icon):\s+INCBIN "gfx\/icons\/(\w+)\.2bpp"/gm)].map((m) => [m[1], m[2]]));
  const order = [...text('data/icon_pointers.asm').matchAll(/^\tdw (\w+)/gm)].map((m) => files[m[1]] ?? null);
  const iconNames = [...text('constants/icon_constants.asm').matchAll(/^\tconst ICON_(\w+)/gm)].map((m) => m[1]);
  const sheets = {};
  for (const file of new Set(order.filter(Boolean))) { const { pixels } = grayPng(`gfx/icons/${file}.png`); sheets[file] = [pixels.slice(0, 256), pixels.slice(256, 512)]; }
  const species = [...text('data/pokemon/menu_icons.asm').matchAll(/^\tdb ICON_(\w+)\s+; (\w+)/gm)].map((m) => [m[2], order[iconNames.indexOf(m[1])]]);
  return { sheets, species: Object.fromEntries(species) };
}

// The pack screen's graphics (gfx/pack/*): menu tiles, the four backpack pictures for each gender, the pocket-name tilemap and palettes.
/** 8x8 tiles of a gray PNG in raster order as 64-digit strings. */
function cut(png, width, rows) {
  const { pixels } = grayPng(png), out = [];
  for (let t = 0; t < (width / 8) * rows; t++) {
    let tile = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) tile += pixels[((Math.floor(t / (width / 8)) * 8 + y) * width) + (t % (width / 8)) * 8 + x];
    out.push(tile);
  }
  return out;
}
function hudTiles() {
  const extra = cut('gfx/font/font_battle_extra.png', 128, 2), out = {};
  const put = (at, tiles) => tiles.forEach((t, i) => { out[at + i] = t; });
  put(0x60, extra.slice(0, 12));
  put(0x70, extra.slice(16, 19));
  put(0x6c, cut('gfx/battle/enemy_hp_bar_border.png', 32, 1));
  put(0x73, cut('gfx/battle/hp_exp_bar_border.png', 48, 1));
  put(0x55, cut('gfx/battle/expbar.png', 72, 1));
  return out;
}
function packData() {
  const art = (png) => { const tiles = cut(png, 40, 12); return [0, 1, 2, 3].map((p) => tiles.slice(p * 15, p * 15 + 15)); };    // 5x3 tiles each: KEY_ITEM, ITEM, TM_HM, BALL
  const palettes = (file) => { const c = rgbs(text(file)); return Array.from({ length: 8 }, (_, i) => c.slice(i * 4, i * 4 + 4)); };
  return {
    menuTiles: cut('gfx/pack/pack_menu.png', 128, 5),
    art: { male: art('gfx/pack/pack.png'), female: art('gfx/pack/pack_f.png') },
    pocketNames: [...bin('gfx/pack/pack_menu.tilemap')],
    palettes: { male: palettes('gfx/pack/pack.pal'), female: palettes('gfx/pack/pack_f.pal') },
  };
}

// Battle tables: types (constants/type_constants.asm), the type chart, move effect scripts (data/moves/effects*.asm) and the
// small tables of data/battle/. out_of/percent are evaluated as the assembler does (integer arithmetic).
function battleData() {
  const types = {};
  let value = 0;
  for (const line of text('constants/type_constants.asm').split('\n')) {
    const next = line.match(/^\tconst_next (\d+)/);
    if (next) { value = Number(next[1]); continue; }
    const c = line.match(/^\tconst (\w+)/);
    if (c) types[c[1]] = value++;
    if (/^DEF TYPES_END/.test(line)) break;
  }
  const special = types.FIRE;
  const WEATHER = { WEATHER_NONE: 0, WEATHER_RAIN: 1, WEATHER_SUN: 2, WEATHER_SANDSTORM: 3 };
  const effectness = { SUPER_EFFECTIVE: 20, MORE_EFFECTIVE: 15, EFFECTIVE: 10, NOT_VERY_EFFECTIVE: 5, NO_EFFECT: 0 };
  const matchups = [], foresight = [];
  let into = matchups;
  for (const line of text('data/types/type_matchups.asm').split('\n')) {
    const row = line.match(/^\tdb (\w+),\s+(\w+),\s+(\w+)/);
    if (row) into.push([types[row[1]], types[row[2]], effectness[row[3]]]);
    else if (/^\tdb -2/.test(line)) into = foresight;
  }
  const effectConsts = [...text('constants/move_effect_constants.asm').matchAll(/^\tconst (EFFECT_\w+)/gm)].map((m) => m[1]);
  const effectLabels = [...text('data/moves/effects_pointers.asm').matchAll(/^\tdw (\w+)/gm)].map((m) => m[1]);
  const { blocks } = parseBlocks('data/moves/effects.asm');
  const pairs = (file) => [...text(file).matchAll(/^\tdb\s+(\d+),\s+(\d+)/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  const crit = [...text('data/battle/critical_hit_chances.asm').matchAll(/db (\d+) out_of (\d+)/g)].map((m) => Math.floor((Number(m[1]) * 256) / Number(m[2])));
  return {
    types, special, matchups, foresight,
    effects: Object.fromEntries(effectConsts.map((c, i) => [c, effectLabels[i]])),
    scripts: Object.fromEntries(effectLabels.filter((l, i) => effectLabels.indexOf(l) === i).map((l) => [l, blocks[l]])),
    priorities: [...text('data/moves/effects_priorities.asm').matchAll(/^\tdb (EFFECT_\w+),\s+(\d+)/gm)].map((m) => [m[1], Number(m[2])]),
    critMoves: [...text('data/moves/critical_hit_moves.asm').matchAll(/^\tdb (\w+)/gm)].map((m) => m[1]).filter((m) => m !== '-1'),
    critChances: crit,
    statMultipliers: pairs('data/battle/stat_multipliers.asm'),
    accuracyMultipliers: pairs('data/battle/accuracy_multipliers.asm'),
    wild: wildData(),
    typeBoostItems: Object.fromEntries([...text('data/types/type_boost_items.asm').matchAll(/^\tdb (HELD_\w+),\s+(\w+)/gm)].map((m) => [m[1], types[m[2]]])),
    badgeBoosts: [...text('data/types/badge_type_boosts.asm').matchAll(/^\tdb (\w+)\s+;/gm)].map((m) => types[m[1]]),   // Johto badges, then Kanto
    weatherTypes: [...text('data/battle/weather_modifiers.asm').matchAll(/^\tdb (WEATHER_\w+),\s+(\w+),\s+(\w+)/gm)].map((m) => [WEATHER[m[1]], types[m[2]] ?? m[2], effectness[m[3]]]),
  };
}

// data/wild/{johto,kanto}_{grass,water}.asm: rates are raw bytes (n percent = n * 255 / 100), slots are [level, species].
function wildData() {
  const out = {};
  for (const [file, kind] of [['johto_grass', 'grass'], ['kanto_grass', 'grass'], ['johto_water', 'water'], ['kanto_water', 'water']]) {
    let cur = null;
    for (const line of text(`data/wild/${file}.asm`).split('\n')) {
      const start = line.match(/def_(?:grass|water)_wildmons (\w+)/);
      if (start) { cur = out[start[1]] ??= {}; cur[kind] = { rates: [], slots: [] }; continue; }
      if (!cur) continue;
      const rate = line.match(/^\tdb ([\d, percent]+)\s*;\s*encounter rate/);
      if (rate) { cur[kind].rates = [...rate[1].matchAll(/(\d+) percent/g)].map((m) => Math.floor(Number(m[1]) * 255 / 100)); continue; }
      const slot = line.match(/^\tdb (\d+), (\w+)/);
      if (slot) cur[kind].slots.push([Number(slot[1]), slot[2]]);
    }
  }
  return out;
}

function nameInputBoards() {
  const out = {};
  let name = null;
  for (const line of text('data/text/name_input_chars.asm').split('\n')) {
    const label = line.match(/^(\w+):/);
    if (label) { name = label[1]; out[name] = []; continue; }
    const row = line.match(/^\tdb "(.*)"\s*$/);
    if (name && row) out[name].push(row[1]);
  }
  return out;
}

// Trainer and player pictures: constants/trainer_constants.asm, data/trainers/pic_pointers.asm, gfx/pics.asm, gfx/trainers/*.png, gfx/player/*.png.
let trainerMemo;
const trainerPicsAll = () => (trainerMemo ??= trainerPics());
function trainerPics() {
  const classes = [...text('constants/trainer_constants.asm').matchAll(/^\ttrainerclass (\w+)/gm)].map((m) => m[1]).filter((c) => c !== 'TRAINER_NONE');
  const picFiles = new Map([...text('gfx/pics.asm').matchAll(/^(\w+):\s+INCBIN "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  const labels = [...text('data/trainers/pic_pointers.asm').matchAll(/^\tdba_pic (\w+)/gm)].map((m) => m[1]);
  const to5 = (c) => Math.round((c * 31) / 255);
  const pic = (png, palettePng = png) => {
    const img = indexedPng(png, { gray: true }), pal = indexedPng(palettePng).palette ?? img.palette;
    return { size: img.width, pixels: img.pixels, palette: pal.map((c) => c.map(to5)) };
  };
  const out = {};
  classes.forEach((c, i) => {
    const file = picFiles.get(labels[i])?.replace(/\.2bpp\.lz$/, '.png');
    if (file) out[c] = pic(file);
  });
  // The player pictures are grayscale; Chris uses Cal's colors and Kris Falkner's (data/trainers/palettes.asm).
  out.CHRIS = { ...pic('gfx/player/chris.png', 'gfx/trainers/cal.png'), back: pic('gfx/player/chris_back.png', 'gfx/trainers/cal.png').pixels };
  out.KRIS = { ...pic('gfx/player/kris.png', 'gfx/trainers/falkner.png'), back: pic('gfx/player/kris_back.png', 'gfx/trainers/falkner.png').pixels };
  return out;
}

// gfx/title/*.png (2-bit grayscale) as palette indexes, one digit per pixel, row by row (0 = lightest), and gfx/title/title.pal.
function grayPng(path) { return indexedPng(path, { gray: true }); }
/** Decode a non-interlaced PNG of 1-8 bits per pixel: grayscale (index = 3 - value for 2-bit, as rgbgfx reads it) or indexed color. */
function indexedPng(path, { gray = false } = {}) {
  const png = bin(path);
  let width = 0, height = 0, depth = 0, colorType = 0, palette = null;
  const idat = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at), type = png.toString('latin1', at + 4, at + 8), body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colorType = body[9]; if (body[12] !== 0) throw new Error(`${path}: interlaced`); }
    if (type === 'PLTE') palette = Array.from({ length: length / 3 }, (_, i) => [...body.subarray(i * 3, i * 3 + 3)]);
    if (type === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  if (colorType !== 0 && colorType !== 3) throw new Error(`${path}: color type ${colorType} unsupported`);
  const raw = inflateSync(Buffer.concat(idat)), stride = Math.ceil(width * depth / 8), rows = [];
  for (let y = 0; y < height; y++) {                      // undo the PNG row filters
    const filter = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))), up = rows[y - 1];
    const bpp = Math.max(1, depth >> 3);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? line[i - bpp] : 0, above = up ? up[i] : 0, corner = up && i >= bpp ? up[i - bpp] : 0;
      const p = left + above - corner, pa = Math.abs(p - left), pb = Math.abs(p - above), pc = Math.abs(p - corner);
      line[i] = (line[i] + [0, left, above, (left + above) >> 1, pa <= pb && pa <= pc ? left : pb <= pc ? above : corner][filter]) & 255;
    }
    rows.push(line);
  }
  const max = (1 << depth) - 1;
  let pixels = '';
  for (const line of rows) for (let x = 0; x < width; x++) {
    const v = (line[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & max;
    pixels += gray && colorType === 0 ? (max === 3 ? 3 - v : max - v) : v;
  }
  return { width, height, pixels, palette: colorType === 3 ? palette : null };
}
function titleData() {
  const palettes = palettesOf(rgbs(text('gfx/title/title.pal')));
  return { logo: grayPng('gfx/title/logo.png'), crystal: grayPng('gfx/title/crystal.png'), suicune: grayPng('gfx/title/suicune.png'),
    bgPalettes: palettes.slice(0, 8), objPalettes: palettes.slice(8) };
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
  for (const [species, { pic }] of Object.entries(pokemonAll())) {
    files[`pokemon/${species}.js`] = `// GENERATED by tools/extract-browser-data.mjs from gfx/pokemon/*/{front,back}.png and shiny.pal. Do not edit.\n`
      + `// PIC: front (first frame, size x size), back (48x48) as one palette-index digit per pixel; palette and shiny are [white, color1, color2, black] in 5-bit [r,g,b].\n`
      + `export const PIC = ${JSON.stringify(pic)};\n`;
  }
  for (const [cls, pic] of Object.entries(trainerPicsAll())) {
    files[`trainers/${cls}.js`] = `// GENERATED by tools/extract-browser-data.mjs from gfx/trainers and gfx/player. Do not edit.\n`
      + `// PIC: { size, pixels (palette-index digit per pixel), palette: [4 x [r,g,b] 5-bit] }.\n`
      + `export const PIC = ${JSON.stringify(pic)};\n`;
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
    `  ${k}: { name: '${v.name}', tileset: '${v.tileset}', environment: '${v.environment}', landmark: '${v.landmark}', palette: '${v.palette}', connections: ${JSON.stringify(v.connections)}, group: ${v.group}, number: ${v.number}, width: ${v.width}, height: ${v.height}, border: ${v.border}, source: '${v.source}',\n    blocks: ${JSON.stringify(v.blocks)} },`).join('\n');
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
      return `// GENERATED by tools/extract-browser-data.mjs from gfx/font, gfx/frames/1-8.png and constants/charmap.asm. Do not edit.\n`
        + `// FONT_CODES: character -> code; glyph = tile (code - $80) of FONT_PNG, or tile (code - $60) of FONT_EXTRA_PNG for codes $63-$78 (quotes, ellipsis...); 16 tiles per row, black ink on white. The frame\n`
        + `// sheet holds six tiles in order: top-left, horizontal, top-right, vertical, bottom-left, bottom-right.\n`
        + `export const FONT_PNG = '${f.font}';\nexport const FONT_EXTRA_PNG = '${f.extra}';\nexport const FRAME_PNGS = ${JSON.stringify(f.frames)};\nexport const SPACE_PNG = '${f.space}';\n`
        + `export const FONT_CODES = ${JSON.stringify(f.codes)};\nexport const TEXT_PALETTE = ${JSON.stringify(f.palette)};\n`;
    })(),
    'sprite-movement.js': `// GENERATED by tools/extract-browser-data.mjs from data/sprites/map_objects.asm. Do not edit.\n`
      + `// SPRITE_MOVEMENT[SPRITEMOVEDATA_*] = { fn: SPRITEMOVEFN_* without the prefix, facing, flags: [FIXED_FACING|SLIDING|...] } (the object_event's movement function).\n`
      + `export const SPRITE_MOVEMENT = ${JSON.stringify(Object.fromEntries([...text('data/sprites/map_objects.asm').matchAll(/^; (SPRITEMOVEDATA_\w+)\n\tdb SPRITEMOVEFN_(\w+) ; movement function\n\tdb (\w+) ; facing\n\tdb \w+ ; action\n\tdb ([^;]*) ; flags1/gm)].map((m) => [m[1], { fn: m[2], facing: m[3].toLowerCase(), flags: m[4].split('|').map((f) => f.trim()).filter((f) => f && f !== '0') }])))};\n`
      + `// JUMP_SHADOW: gfx/overworld/shadow.png, one 8x8 tile of palette-index digits; the hop draws it twice side by side, the right copy mirrored.\n`
      + `export const JUMP_SHADOW = ${JSON.stringify(grayPng('gfx/overworld/shadow.png').pixels)};\n`
      + `// GRASS_RUSTLE: gfx/overworld/grass_rustle.png, one 8x8 tile of palette-index digits (the grass that shakes when a step enters tall grass).\n`
      + `export const GRASS_RUSTLE = ${JSON.stringify(grayPng('gfx/overworld/grass_rustle.png').pixels)};\n`,
    'fruit-trees.js': `// GENERATED by tools/extract-browser-data.mjs from data/items/fruit_trees.asm. Do not edit.\n`
      + `export const FRUIT_TREE_ITEMS = ${JSON.stringify(Object.fromEntries([...text('data/items/fruit_trees.asm').matchAll(/^\tdb (\w+)\s*; (\w+)/gm)].map((m) => [`FRUITTREE_${m[2]}`, m[1]])))};\n`,
    'pokemon.js': (() => {
      const all = pokemonAll();
      return `// GENERATED by tools/extract-browser-data.mjs from data/pokemon/{names,base_stats}.asm. Do not edit.\n`
        + `// POKEMON[SPECIES] = { id, name, dir, stats: {hp, atk, def, spd, sat, sdf}, types, catchRate, baseExp, items, gender, eggCycles, growth, eggGroups, tmhm }.\n`
        + `export const POKEMON = ${JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.meta])))};\n`
        + `export const SPECIES_BY_ID = ${JSON.stringify(Object.keys(all))};\n`;
    })(),
    'landmarks.js': (() => {
      const consts = [...text('constants/landmark_constants.asm').matchAll(/^\tconst (LANDMARK_\w+)/gm)].map((m) => m[1]);
      const table = [...text('data/maps/landmarks.asm').matchAll(/^\tlandmark\s+-?\d+,\s+-?\d+,\s+(\w+)/gm)].map((m) => m[1]);
      const names = Object.fromEntries([...text('data/maps/landmarks.asm').matchAll(/^(\w+Name):\s+db "([^"]*)@"/gm)].map((m) => [m[1], m[2].replace(/<BSP>/g, ' ')]));
      return `// GENERATED by tools/extract-browser-data.mjs from constants/landmark_constants.asm and data/maps/landmarks.asm. Do not edit.\n`
        + `// LANDMARK_NAMES[LANDMARK_*] = the name shown on the sign when entering the area (<BSP> is a space).\n`
        + `export const LANDMARK_NAMES = ${JSON.stringify(Object.fromEntries(consts.map((c, i) => [c, names[table[i]]])))};\n`
        + `// MAP_ENTRY_SIGN: gfx/frames/map_entry_sign.png, 7x2 tiles as palette-index digits (0 lightest), row by row.\n`
        + `export const MAP_ENTRY_SIGN = ${JSON.stringify(grayPng('gfx/frames/map_entry_sign.png'))};\n`;
    })(),
    'tile-anims.js': (() => {
      const t = tileAnimData();
      return `// GENERATED by tools/extract-browser-data.mjs from data/tileset_anims.asm, engine/tilesets/tileset_anims.asm and gfx/tilesets/*. Do not edit.\n`
        + `// TILE_ANIM_LISTS[list] = one { op, tile?, frames? } per frame (hTileAnimFrame indexes it, 'done' wraps); FRAMES: tile graphics as 64-digit palette-index strings.\n`
        + `export const TILE_ANIM_LISTS = ${JSON.stringify(t.lists)};\nexport const TILE_ANIM_FRAMES = ${JSON.stringify(t.frames)};\n`
        + `// TILE_ANIM_BY_TILESET[normalized tileset name without underscores] = list name\nexport const TILE_ANIM_BY_TILESET = ${JSON.stringify(t.byTileset)};\n`;
    })(),
    'moves.js': `// GENERATED by tools/extract-browser-data.mjs from constants/move_constants.asm and data/moves/{moves,names,descriptions}.asm. Do not edit.\n`
      + `// MOVES[MOVE] = { id, name, effect, power, type, accuracy (percent), pp, chance (percent), desc: [line, line] }.\n`
      + `export const MOVES = ${JSON.stringify(moveData())};\n`,
    'learnsets.js': `// GENERATED by tools/extract-browser-data.mjs from data/pokemon/evos_attacks.asm and data/growth_rates.asm. Do not edit.\n`
      + `// EVOS_ATTACKS[SPECIES] = { evolutions: [[method, param..., species]], learnset: [[level, MOVE]] }; GROWTH_RATES[GROWTH_* index] = [a, b, c, d, e]: exp = a/b*n^3 + c*n^2 + d*n - e.\n`
      + `export const EVOS_ATTACKS = ${JSON.stringify(evosAttacksData())};\nexport const GROWTH_RATES = ${JSON.stringify(growthData())};\n`,
    'intro.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/new_game, gfx/naming_screen, data/player_names.asm and data/text/name_input_chars.asm. Do not edit.\n`
      + `export const GENDER_SCREEN = ${JSON.stringify({ pixels: grayPng('gfx/new_game/gender_screen.png').pixels, palette: rgbs(text('gfx/new_game/gender_screen.pal')) })};\n`
      + `export const SHRINK = ${JSON.stringify([1, 2].map((n) => grayPng(`gfx/new_game/shrink${n}.png`).pixels))};   // 7x7 tile pictures, palette-index digits\n`
      + `export const NAMING_CURSOR = ${JSON.stringify(grayPng('gfx/naming_screen/cursor.png'))};\n`
      + `// Glyphs the naming screen loads into VRAM: '■' border, '→' unused entry slot, '<DOT>' underline (8x8 palette-index digits, 3 = ink).\n`
      + `export const NAMING_GLYPHS = ${JSON.stringify({ '■': grayPng('gfx/naming_screen/border.png').pixels, '→': grayPng('gfx/naming_screen/middle_line.png').pixels, '<DOT>': grayPng('gfx/naming_screen/underline.png').pixels })};\n`
      + `// PREDEF_PALETTES[NAME]: gfx/sgb/predef.pal (PREDEFPAL_*), four 5-bit colors each; the DIPLOMA one colors the naming screen and main menu.\n`
      + `export const PREDEF_PALETTES = ${JSON.stringify(Object.fromEntries([...text('gfx/sgb/predef.pal').matchAll(/RGB (\d+),(\d+),(\d+), (\d+),(\d+),(\d+), (\d+),(\d+),(\d+), (\d+),(\d+),(\d+) ; PREDEFPAL_(\w+)/g)].map((m) => [m[13], [0, 1, 2, 3].map((i) => m.slice(1 + i * 3, 4 + i * 3).map(Number))])))};\n`
      + `export const PLAYER_NAMES = ${JSON.stringify({ male: ['CHRIS', 'MAT', 'ALLAN', 'JON'], female: ['KRIS', 'AMANDA', 'JUANA', 'JODI'] })};\n`
      + `export const NAME_INPUT = ${JSON.stringify(nameInputBoards())};\n`
      + `// MON_ICONS.sheets[name] = two 16x16 frames of palette-index digits; .species[SPECIES] = sheet name. ICON_OBJ_PALETTE: gfx/stats/party_menu_ob.pal color 0-3 of the first palette (the naming screen's OBJ palette 0).\n`
      + `export const MON_ICONS = ${JSON.stringify(monIconData())};\n`
      + `export const ICON_OBJ_PALETTE = ${JSON.stringify(rgbs(text('gfx/stats/party_menu_ob.pal')).slice(0, 4))};\n`,
    'pack.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/pack/. Do not edit.\n`
      + `// PACK: menuTiles (80 tiles, VRAM $00-$4f), art[gender][KEY_ITEM, ITEM, TM_HM, BALL] = 15 tiles (5x3, VRAM $50), pocketNames = four 5x3 tilemaps (ITEM, BALL, KEY_ITEM, TM_HM), palettes[gender] = 8 BG palettes of 5-bit colors. Tiles are 64 palette-index digits.\n`
      + `export const PACK = ${JSON.stringify(packData())};\n`,
    'party-ui.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/font/font_battle_extra.png, gfx/stats/{party_menu_bg.pal,item.png,mail.png}. Do not edit.\n`
      + `// BATTLE_EXTRA: 32 tiles (VRAM $60-$7f in the party menu): $60 $61 "HP:", $62 empty bar, $63-$69 partial fills, $6a full bar, $6b bar end, $6e <LV>. PARTY_MENU_BG: BG palettes 0 and 7. HELD_ITEM_ICONS: the 8x8 tile that replaces an icon's lower left corner while the Pokémon holds an item or mail.\n`
      + `export const BATTLE_EXTRA = ${JSON.stringify(cut('gfx/font/font_battle_extra.png', 128, 2))};\nexport const PARTY_MENU_BG = ${JSON.stringify(rgbs(text('gfx/stats/party_menu_bg.pal')))};\nexport const HELD_ITEM_ICONS = ${JSON.stringify({ item: cut('gfx/stats/item.png', 8, 1)[0], mail: cut('gfx/stats/mail.png', 8, 1)[0] })};\n`,
    'battle-ui.js': `// GENERATED by tools/extract-browser-data.mjs from gfx/font/font_battle_extra.png and gfx/battle/*.png. Do not edit.\n`
      + `// HUD_TILES[vram tile number] -> 64 palette-index digits, as LoadBattleFontsHPBar + LoadHPBar leave VRAM during a battle.\n`
      + `export const HUD_TILES = ${JSON.stringify(hudTiles())};\n`,
    'battle-data.js': `// GENERATED by tools/extract-browser-data.mjs from constants/type_constants.asm, data/types/type_matchups.asm, data/moves/effects*.asm and data/battle/. Do not edit.\n`
      + `// types[NAME] -> number (special types start at .special); matchups [attacker, defender, multiplier*10]; foresight: extra rows when Foresight is active;\n`
      + `// effects[EFFECT_*] -> script label; scripts[label] -> [[battle command, ...args]]; priorities [EFFECT_*, priority]; critChances: threshold out of 256 per crit stage;\n`
      + `// statMultipliers / accuracyMultipliers: [numerator, denominator] for stat levels -6..+6.\n`
      + `export const BATTLE = ${JSON.stringify(battleData())};\n`,
    'items.js': `// GENERATED by tools/extract-browser-data.mjs from constants/item_constants.asm and data/items/{names,attributes,descriptions}.asm. Do not edit.\n`
      + `// ITEMS[ITEM_CONSTANT] = { id, name, desc: [line, ...], price, hold, param, property, pocket, field, battle } (TM_*/HM_* included).\n`
      + `export const ITEMS = ${JSON.stringify(itemData())};\n`,
    'title.js': (() => {
      const t = titleData();
      return `// GENERATED by tools/extract-browser-data.mjs from gfx/title/{logo,crystal,suicune}.png and gfx/title/title.pal. Do not edit.\n`
        + `// Images: { width, height, pixels } with one digit per pixel (0 lightest .. 3 darkest, as rgbgfx reads them), row by row.\n`
        + `export const TITLE_LOGO = ${JSON.stringify(t.logo)};\nexport const TITLE_CRYSTAL = ${JSON.stringify(t.crystal)};\nexport const TITLE_SUICUNE = ${JSON.stringify(t.suicune)};\n`
        + `// Palettes: 8 background and 8 object palettes of four 5-bit [r,g,b] colors.\n`
        + `export const TITLE_BG_PALETTES = ${JSON.stringify(t.bgPalettes)};\nexport const TITLE_OBJ_PALETTES = ${JSON.stringify(t.objPalettes)};\n`;
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
