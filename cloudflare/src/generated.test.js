import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../tools/extract-browser-data.mjs';
import { MAPS } from './generated/maps.js';
import { TILESETS } from './generated/tilesets.js';

test('generated modules are up to date with the disassembly (run npm run extract)', () => {
  for (const [name, body] of Object.entries(generate())) {
    assert.equal(readFileSync(new URL(`./generated/${name}`, import.meta.url), 'utf8'), body, name);
  }
});

test('every map in data/maps/maps.asm has a block grid of exactly width x height', () => {
  assert.equal(Object.keys(MAPS).length, 388);
  for (const [id, m] of Object.entries(MAPS)) {
    assert.equal(m.blocks.length, m.width * m.height, id);
    assert.ok(TILESETS[m.tileset], `${id} tileset ${m.tileset}`);
  }
});

test('every tileset has a collision row for each metatile', () => {
  for (const [id, t] of Object.entries(TILESETS)) {
    // Source quirk: forest_collision.asm has 64 rows but forest_metatiles.bin only 40 metatiles.
    assert.ok(t.collision.length >= t.metatiles.length, id);
    for (const row of t.metatiles) assert.equal(row.length, 16, id);
    for (const row of t.collision) assert.equal(row.length, 4, id);
  }
});

test('source spot checks: Elm\'s Lab exit block and New Bark Town tileset', () => {
  assert.deepEqual(MAPS.ELMS_LAB.blocks.slice(-5), [1, 1, 2, 1, 1]);
  assert.equal(MAPS.NEW_BARK_TOWN.tileset, 'JOHTO');
  assert.equal(MAPS.PLAYERS_NEIGHBORS_HOUSE.source, 'maps/House1.blk');
});

test('decoration data matches the source: new-game bed and poster blocks and where they are written', async () => {
  const { DECORATION_BLOCKS, DECORATION_PLACEMENT, NEW_GAME_DECORATIONS } = await import('./generated/decorations.js');
  assert.deepEqual(NEW_GAME_DECORATIONS, { bed: 'DECO_FEATHERY_BED', poster: 'DECO_TOWN_MAP' });
  assert.equal(DECORATION_BLOCKS.DECO_FEATHERY_BED, 0x1b);
  assert.equal(DECORATION_BLOCKS.DECO_TOWN_MAP, 0x1f);
  assert.deepEqual(DECORATION_PLACEMENT.bed, [0, 4]);
  assert.deepEqual(DECORATION_PLACEMENT.poster, [6, 0]);
});
