// Overworld sprite selection, palettes and frames, all from source data (src/generated).
import { EVENTS } from '../generated/events.js';
import { SPRITES, OBJECT_PALETTES } from '../generated/sprites.js';
import { SPRITE_MOVEMENT } from '../generated/sprite-movement.js';

// data/sprites/sprites.asm: the player is Chris unless the girl is chosen at the intro (not ported yet).
export const PLAYER_SPRITE = 'SPRITE_CHRIS';
/** data/sprites/sprites.asm via wPlayerGender: Kris for a girl. */
export const playerSprite = (state) => (state?.playerGender === 'FEMALE' ? 'SPRITE_KRIS' : PLAYER_SPRITE);

// The runtime has no clock yet; the original picks OBJECT_PALETTES by time of day.
export const TIME_OF_DAY = 'day';

export const PALETTE_NAMES = ['RED', 'BLUE', 'GREEN', 'BROWN', 'PINK', 'EMOTE', 'TREE', 'ROCK'];

/** Event object as written in maps/<mapName>.asm at its source coordinates, or null. */
export function sourceObjectAt(mapName, x, y) {
  return EVENTS[mapName]?.objects.find((o) => o.x === x && o.y === y) ?? null;
}

/** Initial facing from the object_event's movement data (data/sprites/map_objects.asm), down when unknown. */
export function initialFacing(sourceObject) {
  return SPRITE_MOVEMENT[sourceObject?.movement]?.facing ?? 'down';
}

/**
 * OBJECT_PALETTES index for an object_event: its own PAL_NPC_* if given, otherwise the sprite's default PAL_OW_*
 * (macros/scripts/maps.asm: "a PAL_NPC_* constant, or 0 for sprite default").
 */
export function objectPaletteIndex(sourceObject) {
  const sprite = SPRITES[sourceObject.sprite];
  if (!sprite) throw new Error(`unknown sprite ${sourceObject.sprite}`);
  const name = sourceObject.palette === '0' ? sprite.palette : sourceObject.palette;
  const index = PALETTE_NAMES.indexOf(name.replace(/^PAL_(OW|NPC)_/, ''));
  if (index < 0) throw new Error(`unknown palette ${name}`);
  return index;
}

/** 5-bit channel to 8-bit, the same scaling the tile palettes use (31 -> 255). */
const to8 = (c) => Math.round((c * 255) / 31);

/** The four palette colors as [r, g, b] 8-bit triples. */
export function objectPaletteColors(paletteIndex, timeOfDay = TIME_OF_DAY) {
  return OBJECT_PALETTES[timeOfDay][paletteIndex].map((rgb) => rgb.map(to8));
}

/**
 * Recolor an RGBA image of a source sprite sheet in place. The sheets use four grays: white is color 0, which
 * sprites treat as transparent, then light, dark and black map to palette colors 1-3.
 */
export function recolorSprite(rgba, colors) {
  for (let i = 0; i < rgba.length; i += 4) {
    const shade = Math.max(0, Math.min(3, Math.round((255 - rgba[i]) / 85)));
    if (shade === 0) { rgba[i + 3] = 0; continue; }
    [rgba[i], rgba[i + 1], rgba[i + 2]] = colors[shade];
    rgba[i + 3] = 255;
  }
  return rgba;
}

/**
 * Frame of a 16-wide sprite sheet for a facing and animation step (data/sprites/facings.asm). Sheet rows are
 * 16x16 frames: 0 stand down, 1 stand up, 2 stand left, 3 walk down, 4 walk up, 5 walk left. Steps 0 and 2 are
 * standing, 1 and 3 are the two walking poses (the second is the first mirrored for up/down). Right is left mirrored.
 */
export function spriteFrame(facing, step = 0) {
  const walking = step === 1 || step === 3;
  const base = facing === 'up' ? 1 : facing === 'left' || facing === 'right' ? 2 : 0;
  const row = base + (walking ? 3 : 0);
  const mirror = facing === 'right' || (walking && step === 3 && facing !== 'left');
  return { row, mirror };
}
