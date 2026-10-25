import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapBgPalettes, tilePaletteIndex, tilePngIndex } from './map-palettes.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const to8 = (c) => Math.round((c * 255) / 31);

test('tile ids map to the tileset image the way LoadTilesetGFX loads it', () => {
  assert.match(source('home/map.asm'), /ld de, vTiles2\s+ld bc, \$60 tiles[\s\S]*?ld hl, wDecompressScratch \+ \$60 tiles\s+ld de, vTiles5/);
  assert.equal(tilePngIndex(0), 0);
  assert.equal(tilePngIndex(0x5f), 0x5f);
  assert.equal(tilePngIndex(0x60), null);
  assert.equal(tilePngIndex(0x7f), null);
  assert.equal(tilePngIndex(0x80), 0x60);
  assert.equal(tilePngIndex(129), 97);
  assert.equal(tilePngIndex(0xdf), 191);
  assert.equal(tilePngIndex(0xe0), null);
});

test('tile palettes come from the tileset palette map by tile id', () => {
  // gfx/tilesets/johto_palette_map.asm: first line is "tilepal 0, GRAY, BROWN, BROWN, RED, ..."
  assert.deepEqual([0, 1, 2, 3].map((id) => tilePaletteIndex('JOHTO', id)), [0, 5, 5, 1]);
  assert.equal(tilePaletteIndex('JOHTO', 0x60), null);
  // First bank-1 line of the same file is the bank-1 palette for ids $80...
  const bank1 = source('gfx/tilesets/johto_palette_map.asm').match(/tilepal 1, (\w+)/)[1];
  assert.equal(['GRAY', 'RED', 'GREEN', 'WATER', 'YELLOW', 'BROWN', 'ROOF', 'TEXT'][tilePaletteIndex('JOHTO', 0x80)], bank1);
});

test('outdoor maps use the day environment colors with the map group roof colors', () => {
  const palettes = mapBgPalettes('NEW_BARK_TOWN');
  // data/maps/environment_colors.asm OutdoorColors day row starts $08 (bg_tiles.pal "day gray": 27,31,27 first color)
  assert.deepEqual(palettes[0][0], [to8(27), to8(31), to8(27)]);
  // gfx/tilesets/roofs.pal group 24 (New Bark): RGB 20,31,14, 11,23,05 for morn/day
  assert.deepEqual(palettes[6].slice(1, 3), [[20, 31, 14].map(to8), [11, 23, 5].map(to8)]);
});

test('indoor maps use the indoor color row and keep ROOF as the glass palette', () => {
  const palettes = mapBgPalettes('PLAYERS_HOUSE_2F');
  assert.equal(palettes.length, 8);
  assert.deepEqual(palettes[0][0], [to8(30), to8(28), to8(26)]);   // bg_tiles.pal $20: RGB 30,28,26
});

test('TILESET_HOUSE loads gfx/tilesets/house.pal instead of the environment colors', () => {
  assert.match(source('engine/tilesets/tileset_palettes.asm'), /cp TILESET_HOUSE\s+jr z, \.house/);
  const palettes = mapBgPalettes('PLAYERS_NEIGHBORS_HOUSE');
  // house.pal brown: 26,24,17 / 21,17,07 / 16,13,03 / 07,07,07
  assert.deepEqual(palettes[5], [[26, 24, 17], [21, 17, 7], [16, 13, 3], [7, 7, 7]].map((p) => p.map(to8)));
});

test('unsupported palette sources fail loudly', () => {
  assert.throws(() => mapBgPalettes('NO_SUCH_MAP'));
});
