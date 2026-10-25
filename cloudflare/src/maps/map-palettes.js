// Background palettes and tile graphics for a map, following engine/gfx/color.asm LoadMapPals and home/map.asm
// LoadTilesetGFX; all data comes from src/generated.
import { MAPS } from '../generated/maps.js';
import { ROOF_PALETTES } from '../generated/roofs.js';
import { BG_TILE_PALETTES, ENVIRONMENT_COLORS, PAL_BG, SPECIAL_PALETTES, TILE_PALETTE_MAPS } from '../generated/palettes.js';
import { TIME_OF_DAY } from './object-sprites.js';

const to8 = (c) => Math.round((c * 255) / 31);
const toRgb8 = (palette) => palette.map((rgb) => rgb.map(to8));

/**
 * The eight BG palettes (four [r,g,b] colors each, 8-bit) a map is drawn with. engine/tilesets/tileset_palettes.asm
 * LoadSpecialMapPalette gives some tilesets a fixed set (not Hall of Fame's ice path, which is INDOOR); otherwise each
 * slot is picked from bg_tiles.pal by the map environment and time of day, and on TOWN and ROUTE maps the map group's
 * roof colors replace colors 1 and 2 of the ROOF palette.
 */
export function mapBgPalettes(mapId, timeOfDay = TIME_OF_DAY) {
  const map = MAPS[mapId];
  if (!map) throw new Error(`unknown map ${mapId}`);
  // The map's own PALETTE_* (maps.asm) overrides the clock: DAY, NITE and DARK are fixed, AUTO follows the time of day.
  if (map.palette !== 'AUTO') timeOfDay = map.palette.toLowerCase();
  if (map.tileset === 'MANSION') throw new Error('the mansion palette is not ported yet');
  const special = SPECIAL_PALETTES[map.tileset];
  if (special && !(map.tileset === 'ICE_PATH' && map.environment === 'INDOOR')) return special.map(toRgb8);
  const setName = ENVIRONMENT_COLORS.pointers[map.environment];
  const palettes = ENVIRONMENT_COLORS.sets[setName][timeOfDay].map((index) => toRgb8(BG_TILE_PALETTES[index]));
  if (map.environment === 'TOWN' || map.environment === 'ROUTE') {
    const roof = ROOF_PALETTES[map.group][timeOfDay === 'nite' || timeOfDay === 'dark' ? 'nite' : 'day'].map((rgb) => rgb.map(to8));
    palettes[PAL_BG.indexOf('ROOF')] = [palettes[6][0], roof[0], roof[1], palettes[6][3]];
  }
  return palettes;
}

/**
 * Index into the tileset PNG (16 tiles per row) for a metatile's tile id: ids $00-$5f are the first 96 tiles (VRAM
 * bank 0) and $80-$df the next 96 (bank 1, home/map.asm LoadTilesetGFX). $60-$7f are shared/roof tiles that are not
 * in the tileset image.
 */
export function tilePngIndex(id) {
  if (id >= 0 && id < 0x60) return id;
  if (id >= 0x80 && id < 0xe0) return id - 0x80 + 0x60;
  return null;
}

/** BG palette index (0-7, PAL_BG_*) for a tile id of a tileset, or null for ids with no graphics in the image. */
export function tilePaletteIndex(tileset, id) {
  const index = tilePngIndex(id);
  if (index === null) return null;
  const bank = id >= 0x80 ? 1 : 0;
  const name = TILE_PALETTE_MAPS[tileset][bank][bank ? id - 0x80 : id];
  return PAL_BG.indexOf(name);
}
