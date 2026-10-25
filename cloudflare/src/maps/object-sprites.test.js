import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAYER_SPRITE, initialFacing, sourceObjectAt, objectPaletteIndex, objectPaletteColors, recolorSprite, spriteFrame } from './object-sprites.js';
import { SPRITES } from '../generated/sprites.js';
import { EVENTS } from '../generated/events.js';

const source = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('palette comes from the object_event, falling back to the sprite default', () => {
  // ElmsLab.asm: the aide is PAL_NPC_BLUE; Elm uses 0 (sprite default; SPRITE_ELM is PAL_OW_BROWN in sprites.asm).
  assert.equal(objectPaletteIndex(sourceObjectAt('ElmsLab', 2, 9)), 1);
  assert.equal(SPRITES.SPRITE_ELM.palette, 'PAL_OW_BROWN');
  assert.equal(objectPaletteIndex(sourceObjectAt('ElmsLab', 5, 2)), 3);
  assert.equal(objectPaletteIndex({ sprite: 'SPRITE_CHRIS', palette: '0' }), 0);
  assert.equal(PLAYER_SPRITE, 'SPRITE_CHRIS');
  assert.equal(sourceObjectAt('ElmsLab', 0, 0), null);
  assert.equal(sourceObjectAt('NoSuchMap', 0, 0), null);
});

test('every object in every map names a known sprite and palette', () => {
  // Constants after NUM_OVERWORLD_SPRITES are Pokémon overworld sprites (SPRITE_RHYDON, ...), not ported yet.
  const constants = source('constants/sprite_constants.asm');
  const pokemonSprites = new Set([...constants.slice(constants.indexOf('DEF SPRITE_POKEMON')).matchAll(/^\tconst (SPRITE_\w+)/gm)].map((m) => m[1]));
  for (const [map, ev] of Object.entries(EVENTS)) {
    for (const o of ev.objects) {
      if (pokemonSprites.has(o.sprite)) continue;
      assert.ok(SPRITES[o.sprite], `${map}: ${o.sprite}`);
      objectPaletteIndex(o);
    }
  }
});

test('object palettes are the day colors from npc_sprites.pal at 8-bit scale', () => {
  // day red: RGB 27,31,27, 31,19,10, 31,07,01, 00,00,00
  assert.deepEqual(objectPaletteColors(0), [[222, 255, 222], [255, 156, 82], [255, 58, 8], [0, 0, 0]]);
});

test('recolorSprite makes white transparent and maps the other grays to palette colors 1-3', () => {
  const colors = [[1, 1, 1], [10, 11, 12], [20, 21, 22], [30, 31, 32]];
  const px = new Uint8ClampedArray([255, 255, 255, 255, 170, 170, 170, 255, 85, 85, 85, 255, 0, 0, 0, 255]);
  recolorSprite(px, colors);
  assert.deepEqual([...px], [255, 255, 255, 0, 10, 11, 12, 255, 20, 21, 22, 255, 30, 31, 32, 255]);
});

test('sprite frames follow data/sprites/facings.asm', () => {
  const facings = source('data/sprites/facings.asm');
  // standing tiles: down $00, up $04, left $08 (frames 0,1,2); walking tiles: $80, $84, $88 (frames 3,4,5)
  for (const [label, firstTile] of [['FacingStepDown0', '00'], ['FacingStepUp0', '04'], ['FacingStepLeft0', '08'], ['FacingStepDown1', '80'], ['FacingStepUp1', '84'], ['FacingStepLeft1', '88']]) {
    assert.match(facings, new RegExp(`${label}:[^\\n]*\\n(?:\\w+:[^\\n]*\\n)*\\tdb 4 ; #\\n\\tdb  0,  0, 0, \\$${firstTile}`), label);
  }
  assert.deepEqual(spriteFrame('down', 0), { row: 0, mirror: false });
  assert.deepEqual(spriteFrame('up', 2), { row: 1, mirror: false });
  assert.deepEqual(spriteFrame('left', 0), { row: 2, mirror: false });
  assert.deepEqual(spriteFrame('right', 0), { row: 2, mirror: true });
  assert.deepEqual(spriteFrame('down', 1), { row: 3, mirror: false });
  assert.deepEqual(spriteFrame('down', 3), { row: 3, mirror: true });  // FacingStepDown3 is Down1 with OAM_XFLIP
  assert.deepEqual(spriteFrame('up', 3), { row: 4, mirror: true });
  assert.deepEqual(spriteFrame('left', 1), { row: 5, mirror: false });
  assert.deepEqual(spriteFrame('left', 3), { row: 5, mirror: false }); // FacingStepLeft3 shares FacingStepLeft1
  assert.deepEqual(spriteFrame('right', 3), { row: 5, mirror: true });
});

test('initial facing comes from the standing movement function', () => {
  assert.equal(initialFacing(sourceObjectAt('PlayersHouse1F', 7, 4)), 'left');
  assert.equal(initialFacing(sourceObjectAt('PlayersHouse1F', 2, 2)), 'up');
  assert.equal(initialFacing(sourceObjectAt('ElmsLab', 2, 9)), 'down'); // SPINRANDOM_SLOW
  assert.equal(initialFacing(null), 'down');
});
