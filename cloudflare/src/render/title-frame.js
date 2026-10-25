// The title screen picture, composed like the Game Boy Color does it (engine/movie/title.asm): a 20x18 background map
// scrolled by 8 pixels, a window row for the copyright line, and 30 background-priority 8x16 sprites for the crystal.
// Pure: returns RGBA for 160x144; canvas.js only blits it.
import { TITLE_LOGO, TITLE_CRYSTAL, TITLE_SUICUNE, TITLE_BG_PALETTES, TITLE_OBJ_PALETTES } from '../generated/title.js';

const W = 160, H = 144;
// Measured: the game shows palettes 1-7 (logo, copyright) from its fourth frame; until then they are black.
const PALETTE_FRAME = 4;
const BLACK = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
const to8 = (c) => Math.round((c * 255) / 31);
const rgb = (palette, index) => palette[index].map(to8);
const px = (image, x, y) => image.pixels.charCodeAt(y * image.width + x) - 48;

/** Pixel (0-3) of an 8x8 tile of a sheet that is `perRow` tiles wide; tiles beyond the sheet are blank. */
function tilePixel(image, perRow, tile, x, y) {
  const tx = tile % perRow, ty = Math.floor(tile / perRow);
  return (ty + 1) * 8 > image.height ? 0 : px(image, tx * 8 + x, ty * 8 + y);
}
// VRAM holds the logo and Suicune from $8800 on, so tile ids $80-$ff are sheet tiles 0-127 and ids $00-$7f are tiles 128-255.
const sheetTile = (id) => (id >= 0x80 ? id - 0x80 : id + 128);

/** Rows 3-9 hold the logo, with the gradient palettes of _TitleScreen; "CRYSTAL VERSION" (row 9, columns 5-15) is palette 1. */
const logoPalette = (row, col) => (row <= 4 ? 2 : row === 5 ? 3 : row === 6 ? 4 : row === 7 ? 5 : row === 9 && col >= 5 && col <= 15 ? 1 : 6);

/**
 * state: { frames (updates so far), scx, crystalShown (OAM y of the first sprite), suicuneShown (frame 0-3), windowShown (bool) }; scx is the entrance slide: even lines are shifted by scx,
 * odd lines by -scx on the logo's 80 lines (TitleScreenEntrance), 0 once it has finished.
 */
export function titleFrame({ scx, crystalShown: crystalY, suicuneShown: suicune, windowShown: window, frames }) {
  const out = new Uint8ClampedArray(W * H * 4);
  const suicuneStart = [0x80, 0x88, 0x00, 0x08][suicune];
  const crystal = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) crystal.push({ y: (crystalY + 16 * r) & 255, x: 0x40 + 8 * c, r, c });
  for (let y = 0; y < H; y++) {
    const lineScx = y >= 1 && y <= 80 ? (y % 2 ? scx : -scx) & 255 : 0;
    const bgY = (y + 8) & 255, row = bgY >> 3;
    for (let x = 0; x < W; x++) {
      let index = 0, palette = TITLE_BG_PALETTES[0];
      if (window && y >= 136) {                                    // window row 0: the copyright line, palette 7
        const col = x >> 3;
        palette = TITLE_BG_PALETTES[7];
        index = col >= 3 && col <= 15 ? tilePixel(TITLE_LOGO, 20, 140 + col - 3, x & 7, y & 7) : 0;
      } else {
        const bgX = (x + lineScx) & 255, col = bgX >> 3;
        if (row >= 3 && row <= 9 && col < 20) {
          index = tilePixel(TITLE_LOGO, 20, 20 * (row - 3) + col, bgX & 7, bgY & 7);
          palette = frames < PALETTE_FRAME ? BLACK : TITLE_BG_PALETTES[logoPalette(row, col)];
        } else if (row >= 12 && row <= 17 && col >= 6 && col <= 13 && frames >= 2) {      // measured: Suicune shows from the second frame
          index = tilePixel(TITLE_SUICUNE, 16, sheetTile((suicuneStart + 16 * (row - 12) + col - 6) & 255), bgX & 7, bgY & 7);
        }
      }
      let color = rgb(palette, index);
      if (index === 0) {                                           // sprites have BG priority: only visible over color 0
        for (const s of crystal) {
          const sy = y - (s.y - 16), sx = x - (s.x - 8);
          if (sy < 0 || sy >= 16 || sx < 0 || sx >= 8 || s.y === 0 || s.y >= 160) continue;
          const c = px(TITLE_CRYSTAL, s.c * 8 + sx, (2 * s.r + (sy >> 3)) * 8 + (sy & 7));
          if (c) { color = rgb(TITLE_OBJ_PALETTES[0], c); break; }
        }
      }
      out.set(color, (y * W + x) * 4); out[(y * W + x) * 4 + 3] = 255;
    }
  }
  return out;
}
