// One battle animation on the battle screen: the game's animation engine (machine.js) runs on a Game Boy memory that starts out as the battle
// screen's own state (the two pictures in VRAM and on the tilemap, the battle palettes), and what it leaves there is drawn over the screen.
// The tilemap cells the engine has not touched stay MARKER, which means "the battle screen draws this" (HUDs, text); every other cell, the
// pictures and anything cleared, comes from the machine, as do the sprites, the palette changes and the scroll registers.
import { BATTLE_ANIMS as D } from '../../generated/battle-anims.js';
import { MOVES } from '../../generated/moves.js';
import { AnimMachine } from './machine.js';

const MARKER = 0xf0, BLANK = 0x7f;
const SCREEN_W = 20, SCREEN_H = 18;
const ENEMY_AT = [12, 0, 7], PLAYER_AT = [2, 6, 6];        // column, row, tiles on a side: where the two pictures sit on the tilemap
const ENEMY_HUD = [1, 0], PLAYER_HUD = [9, 7];             // the first cell ClearActorHud blanks for each side
const VRAM_BG = 0x9000, VRAM_BG_HIGH = 0x8800, VRAM_OBJ = 0x8000;
const PLAYER_FIRST_TILE = 0x31;
// The line a scroll value written during an HBlank takes effect on, relative to the line number the LCD handler read it for.
const LCD_LINE_DELAY = 1;

/** The id of the animation to play for a battle event's name: a move, or one of the engine's own (SEND_OUT_MON ...). */
export const animationId = (name) => MOVES[name]?.id ?? D.constants[`ANIM_${name}`];

const rgb555 = ([r, g, b]) => r | (g << 5) | (b << 10);
const from555 = (v) => [v & 31, (v >> 5) & 31, (v >> 10) & 31];

/** The 2bpp bytes of an 8x8 tile of palette-index digits. */
function tileBytes(digits) {
  const out = [];
  for (let y = 0; y < 8; y++) {
    let lo = 0, hi = 0;
    for (let x = 0; x < 8; x++) { const v = digits.charCodeAt(y * 8 + x) - 48; lo = (lo << 1) | (v & 1); hi = (hi << 1) | (v >> 1); }
    out.push(lo, hi);
  }
  return out;
}

/** A picture's tiles in the column-major order the game stores them: `side` x `side` tiles, the raster placed at (offX, offY) tiles. */
function pictureTiles(pic, side, offX = 0, offY = 0) {
  const raster = new Array(side * 8 * side * 8).fill('0');
  const size = pic.size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raster[(y + offY * 8) * side * 8 + x + offX * 8] = pic.pixels[y * size + x];
  const tiles = [];
  for (let col = 0; col < side; col++) for (let row = 0; row < side; row++) {
    let digits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) digits += raster[(row * 8 + y) * side * 8 + col * 8 + x];
    tiles.push(digits);
  }
  return tiles;
}

const flipX = (digits) => digits.match(/.{8}/g).map((row) => [...row].reverse().join('')).join('');
const flipY = (digits) => digits.match(/.{8}/g).reverse().join('');

export class BattleAnimation {
  /**
   * id: an animationId; user: 0 for the player's side; afterAnim: the name of the animation that follows (ENEMY_DAMAGE ...); enemy / player: { pic, shown } where pic is a decoded picture ({ size, pixels, palette, offX, offY })
   * and `shown` whether it is on the screen when the animation starts.
   */
  constructor({ id, user, param = 0, enemy, player, random, sentOut = false, afterAnim = null }) {
    this.sentOut = sentOut;                                 // this animation leaves the player's Pokémon on the field
    this.machine = new AnimMachine({ random });
    this.setup(enemy, player);
    this.machine.restoreHuds = () => this.restoreHuds();
    this.machine.start(id, { turn: user, param, afterAnim: afterAnim ? D.constants[`ANIM_${afterAnim}`] - D.constants.BATTLE_AFTERANIMS : 0 });
    this.frame = 0;
    this.digits = new Map();
  }

  setup(enemy, player) {
    const m = this.machine, R = D.ram;
    m.w8('hCGB', 1);
    for (const name of ['wBGP', 'wOBP0', 'wOBP1']) m.w8(name, 0xe4);
    m.mem[0xff47] = m.mem[0xff48] = m.mem[0xff49] = 0xe4;
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) { m.mem[R.wTilemap + i] = MARKER; m.mem[R.wAttrmap + i] = 0; }
    const place = (side, at, first, tiles) => {
      const [col, row, n] = at;
      for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) {
        const index = c * n + r;
        m.mem[R.wTilemap + (row + r) * SCREEN_W + col + c] = side.shown ? first + index : BLANK;
        m.mem[R.wAttrmap + (row + r) * SCREEN_W + col + c] = side === enemy ? 1 : 0;
        if (side.pic) m.mem.set(tileBytes(tiles[index]), VRAM_BG + (first + index) * 16);
      }
    };
    place(enemy, ENEMY_AT, 0, enemy.pic ? pictureTiles(enemy.pic, 7, enemy.pic.offX ?? 0, enemy.pic.offY ?? 0) : []);
    place(player, PLAYER_AT, PLAYER_FIRST_TILE, player.pic ? pictureTiles(player.pic, 6) : []);
    m.withBank5(() => {
      const put = (name, slot, colors) => colors.forEach((c, i) => { const a = R[name] + slot * 8 + i * 2; m.write(a, rgb555(c) & 0xff); m.write(a + 1, rgb555(c) >> 8); });
      put('wBGPals1', 0, player.pic?.palette ?? [[31, 31, 31], [31, 31, 31], [0, 0, 0], [0, 0, 0]]);
      put('wBGPals1', 1, enemy.pic?.palette ?? [[31, 31, 31], [31, 31, 31], [0, 0, 0], [0, 0, 0]]);
      put('wOBPals1', 0, enemy.pic?.palette ?? [[31, 31, 31], [31, 31, 31], [0, 0, 0], [0, 0, 0]]);
      put('wOBPals1', 1, player.pic?.palette ?? [[31, 31, 31], [31, 31, 31], [0, 0, 0], [0, 0, 0]]);
      D.objectPalettes.forEach((colors, i) => put('wOBPals1', 2 + i, colors));
      for (const [name, base] of [['wBGPals2', 'wBGPals1'], ['wOBPals2', 'wOBPals1']]) m.copy(R[name], R[base], 64);
    });
  }

  /** UpdateBattleHuds: both HUDs are the screen's to draw again. */
  restoreHuds() {
    const m = this.machine, R = D.ram;
    for (const [x0, y0, w, h] of [[1, 0, 10, 4], [9, 7, 11, 5]]) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) m.mem[R.wTilemap + y * SCREEN_W + x] = MARKER;
  }

  /** One frame; true when the animation has finished. */
  update() {
    this.frame++;
    return this.machine.step();
  }

  tileDigits(address) {
    const m = this.machine;
    let key = '';
    for (let i = 0; i < 16; i++) key += String.fromCharCode(m.mem[address + i]);
    let digits = this.digits.get(key);
    if (!digits) {
      digits = '';
      for (let y = 0; y < 8; y++) for (let x = 7; x >= 0; x--) digits += ((m.mem[address + y * 2] >> x) & 1) | (((m.mem[address + y * 2 + 1] >> x) & 1) << 1);
      this.digits.set(key, digits);
    }
    return digits;
  }

  /** A palette of the screen as shown: 'bg' or 'ob', slot 0-7, as four 5-bit [r, g, b]. */
  palette(kind, slot) {
    const bytes = this.machine.shown[kind];
    return [0, 1, 2, 3].map((i) => from555(bytes[slot * 8 + i * 2] | (bytes[slot * 8 + i * 2 + 1] << 8)));
  }

  /** Does the battle screen still draw the HUD of this side (its cells are untouched)? */
  hud(side) {
    const [x, y] = side === 0 ? PLAYER_HUD : ENEMY_HUD;
    return this.machine.shown.tiles[y * SCREEN_W + x] === MARKER;
  }

  /** The BG palette byte as the index remap the canvas uses for the screen's own (non-machine) panels. */
  remap() {
    const bgp = this.machine.shown.bgp;
    return [bgp & 3, (bgp >> 2) & 3, (bgp >> 4) & 3, (bgp >> 6) & 3];
  }

  /** The BG map cells the machine owns, as tiles for the canvas: [x, y, digits, colors]. */
  cells() {
    const m = this.machine, shown = m.shown, out = [];
    const palettes = [];
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      const id = shown.tiles[i];
      if (id === MARKER) continue;
      const slot = shown.attr[i] & 7;
      palettes[slot] ??= this.palette('bg', slot);
      const address = id < 0x80 ? VRAM_BG + id * 16 : VRAM_BG_HIGH + (id - 0x80) * 16;
      out.push([i % SCREEN_W, Math.floor(i / SCREEN_W), this.tileDigits(address), palettes[slot]]);
    }
    return out;
  }

  /** The scroll each of the 144 lines is drawn with: { x, y } arrays, or null while nothing scrolls. */
  scroll() {
    const s = this.machine.shown;
    if (!s.lcd && !s.scx && !s.scy) return null;
    const x = new Array(144).fill(s.scx), y = new Array(144).fill(s.scy);
    if (s.lcd) {
      for (let line = LCD_LINE_DELAY; line < 144; line++) {
        const v = s.ly[line - LCD_LINE_DELAY];
        if (s.lcd === 0x43) x[line] = v; else if (s.lcd === 0x42) y[line] = v;
      }
    }
    const signed = (v) => (v << 24) >> 24;
    return { x: x.map(signed), y: y.map(signed) };
  }

  /** The objects as bitmap sprites for the canvas, the first OAM entry on top. */
  sprites() {
    const m = this.machine, out = [];
    const palettes = [];
    for (const s of m.sprites().reverse()) {
      const slot = s.attr & 7;
      palettes[slot] ??= this.palette('ob', slot);
      let digits = this.tileDigits(VRAM_OBJ + s.tile * 16);
      if (s.attr & 0x20) digits = flipX(digits);
      if (s.attr & 0x40) digits = flipY(digits);
      out.push({ bitmap: { w: 8, h: 8, pixels: digits }, colors: palettes[slot], x: s.x, y: s.y });
    }
    return out;
  }
}
