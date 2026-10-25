import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEW_GAME_DECORATION_BLOCKS, PLAYERS_HOUSE_2F_BLOCK_IDS, PLAYERS_HOUSE_2F_DECORATED_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile } from './players-house-2f-blocks.js';
import { isSceneObjectVisible } from './scene-object-state.js';
import { PLAYERS_HOUSE_2F } from './players-house-2f.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('new-game decorations match engine/overworld/decorations.asm and data/decorations/attributes.asm', () => {
  const deco = source('engine/overworld/decorations.asm');
  assert.match(deco, /InitDecorations:\s+ld a, DECO_FEATHERY_BED\s+ld \[wDecoBed\], a\s+ld a, DECO_TOWN_MAP\s+ld \[wDecoPoster\], a/);
  assert.match(deco, /lb de, 0, 4 ; bed coordinates/);
  assert.match(deco, /lb de, 6, 0 ; poster coordinates/);
  const attrs = source('data/decorations/attributes.asm');
  const bed = attrs.match(/decoration DECO_BED,\s+FEATHERY_BED,.*?,\s+\$([0-9a-f]{2})\s/)[1];
  const poster = attrs.match(/decoration DECO_PLANT,\s+TOWN_MAP_POSTER,.*?,\s+\$([0-9a-f]{2})\s/)[1];
  assert.deepEqual(NEW_GAME_DECORATION_BLOCKS.map((d) => [d.blockX, d.blockY, d.blockId]),
    [[0, 2, parseInt(bed, 16)], [3, 0, parseInt(poster, 16)]]);
});

test('only the bed and poster blocks differ from the raw .blk', () => {
  const changed = PLAYERS_HOUSE_2F_DECORATED_BLOCK_IDS.map((id, i) => [id, PLAYERS_HOUSE_2F_BLOCK_IDS[i], i]).filter(([a, b]) => a !== b);
  assert.deepEqual(changed.map(([a, , i]) => [i, a]), [[3, 0x1f], [8, 0x1b]]);
});

test('decoration blocks drive collision, so the bed tile is not floor', () => {
  assert.notEqual(getPlayersHouse2FCollisionAtMetatile(0, 4), 'FLOOR');
});

test('console, ornaments and big doll are hidden in a new game', () => {
  for (const object of PLAYERS_HOUSE_2F.objects) assert.equal(isSceneObjectVisible('PLAYERS_HOUSE_2F', object, {}), false, object.id);
});
