// The Pokédex (engine/pokedex/pokedex.asm, pokedex_2.asm, pokedex_3.asm): the list of Pokémon seen (new Pokédex order) and the entry pages.
// Frame-stepped like the other screens: update(input) returns true when it is closed. Everything is drawn from the screen's own VRAM model:
// tiles $00-$30 hold the 7x7 picture, $31-$70 pokedex.png, $7f is solid black, $80-$ff the inverted standard font; the background scrolls
// by POKEDEX_SCX and the list is the window at x = 64 (WX = $47).
import { POKEDEX as D } from '../generated/pokedex.js';
import { POKEMON } from '../generated/pokemon.js';
import { FONT_CODES } from '../generated/font.js';
import { ICON_OBJ_PALETTE } from '../generated/intro.js';

const SCX = 5;
const OPEN_FRAMES = 20;
const ENTRY_FRAMES = 11, ENTRY_GREEN_FRAMES = 4;       // A on the list: it stays, then the entry shows with the list's palette for a few frames before the picture's own
const ARROW_FRAMES = 23;                              // the menu arrow starts blinking this long after the entry appears (measured)
const LIST_HEIGHT = 7;
const BLACK = '3'.repeat(64);
const SCROLLBAR_COLORS = [ICON_OBJ_PALETTE[0], ICON_OBJ_PALETTE[0], ICON_OBJ_PALETTE[2], ICON_OBJ_PALETTE[3]];     // the marker's outline shows the palette's first color (measured)
const WHITE = [[31, 31, 31], [31, 31, 31], [31, 31, 31], [31, 31, 31]];
const SPECIES = Object.keys(POKEMON);
const dexNumber = (species) => SPECIES.indexOf(species) + 1;
const invert = (tile) => [...tile].map((v) => 3 - v).join('');
const FONT = D.font.map(invert);
const flipX = (tile) => tile.match(/.{8}/g).map((row) => [...row].reverse().join('')).join('');
const flipY = (tile) => tile.match(/.{8}/g).reverse().join('');

/** The tile ids a string places (a character's code; spaces are $7f, black). */
function codes(text) {
  return [...text.replace(/#/g, 'POKé').matchAll(/<[A-Z0-9_]+>|[^]/gu)].map(([c]) => (c === ' ' ? 0x7f : FONT_CODES[c] ?? 0x7f));
}

const FONT_EXTRA = D.fontExtra.map(invert);
const tileImage = (id) => (id === 0x7f ? BLACK : id >= 0x80 ? FONT[id - 0x80] : id > 0x70 ? FONT_EXTRA[id - 0x60] : D.tiles[id - 0x31]);

/** A 20x18 (plus a column) map of tile ids with a palette slot per tile: 1 inside the picture, 0 elsewhere. */
class TileMap {
  constructor(width = 21) { this.width = width; this.ids = new Array(width * 18).fill(0x32); this.slot = new Array(width * 18).fill(0); }
  set(x, y, id, slot = 0) { this.ids[y * this.width + x] = id; this.slot[y * this.width + x] = slot; }
  text(x, y, text) { codes(text).forEach((id, i) => this.set(x + i, y, id)); }
  fill(x, y, w, h, id) { for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) this.set(x + c, y + r, id); }
  /** Pokedex_PlaceBorder: a frame of w x h inner tiles with the corner at (x, y). */
  border(x, y, w, h) {
    this.set(x, y, 0x33); this.fill(x + 1, y, w, 1, 0x34); this.set(x + w + 1, y, 0x35);
    for (let r = 1; r <= h; r++) { this.set(x, y + r, 0x36); this.fill(x + 1, y + r, w, 1, 0x7f); this.set(x + w + 1, y + r, 0x37); }
    this.set(x, y + h + 1, 0x38); this.fill(x + 1, y + h + 1, w, 1, 0x39); this.set(x + w + 1, y + h + 1, 0x3a);
  }
  /** The 7x7 picture area: tile r + 7c at column c, row r. */
  picture(x, y) { for (let c = 0; c < 7; c++) for (let r = 0; r < 7; r++) this.set(x + c, y + r, r + 7 * c, 1); }
}

// Pokedex_PutNewModeABCModeCursorOAM: tile column, tile row, x offset, y offset, tile, flip bits (1 = X, 2 = Y)
const CURSOR = [
  [9, 3, -1, 3, 0x30, 0], [9, 2, -1, 3, 0x31, 0], [10, 2, -1, 3, 0x32, 0], [11, 2, -1, 3, 0x32, 0], [12, 2, -1, 3, 0x33, 0],
  [16, 2, 0, 3, 0x33, 1], [17, 2, 0, 3, 0x32, 1], [18, 2, 0, 3, 0x32, 1], [19, 2, 0, 3, 0x31, 1], [19, 3, 0, 3, 0x30, 1],
  [9, 4, -1, 3, 0x30, 2], [9, 5, -1, 3, 0x31, 2], [10, 5, -1, 3, 0x32, 2], [11, 5, -1, 3, 0x32, 2], [12, 5, -1, 3, 0x33, 2],
  [16, 5, 0, 3, 0x33, 3], [17, 5, 0, 3, 0x32, 3], [18, 5, 0, 3, 0x32, 3], [19, 5, 0, 3, 0x31, 3], [19, 4, 0, 3, 0x30, 3],
];

/** An object tile with its flips, as a bitmap sprite at pixel (x, y). */
const objectTile = (id, flip, x, y, colors) => {
  let pixels = D.slowpoke[id];
  if (flip & 1) pixels = flipX(pixels);
  if (flip & 2) pixels = flipY(pixels);
  return { bitmap: { w: 8, h: 8, pixels }, colors, x, y };
};

const MENU = [1, 6, 11, 15];                  // DexEntryScreen_ArrowCursorData: PAGE, AREA, CRY, PRNT

export class PokedexScreen {
  constructor(state) {
    this.state = state;
    this.frame = 0;
    this.mode = 'list';
    this.seen = (species) => state.dexSeen?.has(species) ?? false;
    this.caught = (species) => state.dexCaught?.has(species) ?? false;
    this.order = D.orders.new;
    this.end = this.order.reduce((last, species, i) => (this.seen(species) ? i + 1 : last), 0);          // FindLastSeen
    const saved = state.dexListing ?? { cursor: 0, scroll: 0 };
    this.cursor = saved.cursor;
    this.scroll = saved.scroll;
    this.page = 0;
    this.menu = 0;
    this.blink = 0;
    this.delay = 0;
    this.held = null;
    this.unported = new Set();
  }

  get species() { return this.order[this.cursor + this.scroll]; }

  /** Pokedex_ListingMoveCursorUp / Down: true when the position changed. */
  move(step) {
    if (step < 0) {
      if (this.cursor > 0) this.cursor--;
      else if (this.scroll > 0) this.scroll--;
      else return false;
      return true;
    }
    const next = this.cursor + 1;
    if (next >= this.end) return false;
    if (next < LIST_HEIGHT) { this.cursor++; return true; }
    if (next + this.scroll >= this.end) return false;
    this.scroll++;
    return true;
  }

  movePage(step) {
    if (LIST_HEIGHT >= this.end) return;
    if (step < 0) this.scroll = this.scroll < LIST_HEIGHT ? 0 : this.scroll - LIST_HEIGHT;
    else this.scroll = LIST_HEIGHT * 2 + this.scroll >= this.end ? this.end - LIST_HEIGHT : this.scroll + LIST_HEIGHT;
  }

  update(input) {
    this.frame++;
    if (this.frame <= OPEN_FRAMES) return false;
    if (this.entering !== undefined && this.mode === 'list') {
      if (++this.entering >= ENTRY_FRAMES) { this.mode = 'entry'; this.entered = 0; this.page = 0; this.menu = 0; this.blink = -ARROW_FRAMES; this.delay = 0; delete this.entering; }
      return false;
    }
    const edge = input.dir && input.dir !== this.held;
    this.held = input.dir ?? null;
    if (this.mode === 'list') return this.updateList(input, edge);
    return this.updateEntry(input, edge);
  }

  updateList(input, edge) {
    if (input.b) { this.state.dexListing = { cursor: this.cursor, scroll: this.scroll }; return true; }
    if (input.a) { if (this.seen(this.species) && !this.entering) { this.entering = 0; } return false; }
    if (input.select || input.start) { this.unported.add(input.select ? 'Pokédex option screen' : 'Pokédex search screen'); return false; }
    if (!edge) return false;
    if (input.dir === 'up') this.move(-1);
    else if (input.dir === 'down') this.move(1);
    else if (input.dir === 'left') this.movePage(-1);
    else if (input.dir === 'right') this.movePage(1);
    return false;
  }

  updateEntry(input, edge) {
    this.entered++;
    this.blink++;
    if (this.delay > 0) this.delay--;
    if (input.b) { this.mode = 'list'; return false; }
    if (input.a) {
      if (this.menu === 0) this.page ^= 1;
      else this.unported.add(['', 'Pokédex area page', 'Pokédex cry', 'Pokédex print'][this.menu]);
      return false;
    }
    const moveMenu = (to) => { this.menu = to; this.delay = 12; this.blink = 0; };
    if (edge && input.dir === 'left' && this.menu > 0) moveMenu(this.menu - 1);
    else if (edge && input.dir === 'right' && this.menu < MENU.length - 1) moveMenu(this.menu + 1);
    else if (input.select) moveMenu((this.menu + 1) % MENU.length);
    else if (edge && (input.dir === 'up' || input.dir === 'down')) this.step(input.dir === 'up' ? -1 : 1);
    return false;
  }

  /** Pokedex_NextOrPreviousDexEntry: the next entry in the order that has been seen. */
  step(direction) {
    const saved = [this.cursor, this.scroll];
    do { if (!this.move(direction)) { [this.cursor, this.scroll] = saved; return; } } while (!this.seen(this.species));
    this.page = 0; this.menu = 0; this.blink = -ARROW_FRAMES; this.entered = 0;
  }

  panels() {
    if (this.frame <= OPEN_FRAMES) return [{ fill: 0, colors: [[31, 31, 31], [31, 31, 31], [31, 31, 31], [31, 31, 31]] }];
    return this.mode === 'list' ? this.listPanels() : this.entryPanels();
  }

  /** Both screens' palettes: slot 0 is the Pokédex's, slot 1 the picture's. */
  tilesOf(map, columns, offset = 0) {
    const tiles = [];
    for (let y = 0; y < 18; y++) for (let x = 0; x < columns; x++) {
      const id = map.ids[y * map.width + x];
      if (id < 0x31) continue;                        // picture tiles are drawn separately
      tiles.push([x + offset, y, tileImage(id), this.colors(map.slot[y * map.width + x])]);
    }
    return tiles;
  }

  /** The 7x7 picture area's backdrop: every tile of it is the picture's color 0 until the picture is drawn over it. */
  backdrop(tiles) { for (let i = 0; i < 49; i++) tiles.push([1 + Math.floor(i / 7), 1 + (i % 7), '0'.repeat(64), this.picPalette]); }

  colors(slot) { return slot === 0 ? D.palettes.dex : this.picPalette; }

  listPanels() {
    this.picPalette = D.palettes.question;
    const seen = this.seen(this.species), bg = new TileMap();
    bg.border(0, 0, 7, 7); bg.border(0, 9, 7, 6);
    bg.text(1, 11, 'SEEN'); bg.text(1, 14, 'OWN');
    bg.text(5, 12, String(this.order.filter((s) => this.seen(s)).length).padStart(3, ' '));
    bg.text(5, 15, String(this.order.filter((s) => this.caught(s)).length).padStart(3, ' '));
    for (const [i, id] of [0x3b, 0x48, 0x49, 0x4a, 0x44, 0x45, 0x46, 0x47, 0x3c, 0x3b, 0x41, 0x42, 0x43, 0x4b, 0x4c, 0x4d, 0x4e, 0x3c].entries()) bg.set(1 + i, 17, id);
    for (let y = 1; y <= 7; y++) bg.set(8, y, 0x5a);
    for (let y = 10; y <= 15; y++) bg.set(8, y, 0x5a);
    bg.set(8, 0, 0x59); bg.set(8, 8, 0x53); bg.set(8, 9, 0x54); bg.set(8, 16, 0x5b);
    const win = new TileMap(12);
    win.fill(0, 1, 11, 15, 0x7f); win.fill(0, 0, 11, 1, 0x34); win.fill(0, 16, 11, 1, 0x39);
    win.set(5, 0, 0x3f); win.set(5, 16, 0x40);
    win.set(11, 0, 0x50); win.fill(11, 1, 1, 15, 0x51); win.set(11, 16, 0x52);
    for (let i = 0; i < LIST_HEIGHT; i++) {
      const species = this.order[this.scroll + i];
      if (!species) continue;
      const y = 2 + 2 * i;
      if (!this.seen(species)) { win.text(1, y, '-----'); continue; }
      if (this.caught(species)) win.set(0, y, 0x4f);
      win.text(1, y, POKEMON[species].name);
    }
    for (const [i, id] of [0x3c, 0x3b, 0x41, 0x42, 0x43, 0x4b, 0x4c, 0x4d, 0x4e, 0x3c].entries()) win.set(i, 17, id);
    const picture = seen ? { species: this.species, x: 1, y: 1, palette: D.palettes.question } : null;
    const panels = [{ fill: 2, colors: D.palettes.dex, dx: -SCX, tiles: this.tilesOf(bg, 9) }];
    if (!seen) panels[0].tiles.push(...D.questionMark.map((tile, n) => [1 + (n % 7), 1 + Math.floor(n / 7), tile, D.palettes.question]));
    else { this.backdrop(panels[0].tiles); panels.push({ colors: D.palettes.question, dx: -SCX, pic: picture }); }
    panels.push({ colors: D.palettes.dex, tiles: this.tilesOf(win, 12, 8) });
    const cursorColors = D.palettes.cursor, sprites = CURSOR.map(([x, y, ox, oy, id, flip]) => objectTile(id, flip, x * 8 + ox - 8, y * 8 + oy - 16 + 16 * this.cursor, cursorColors));
    const top = this.cursor + this.scroll === this.end - 1 ? 121 : Math.floor(((this.cursor + this.scroll) * 121) / this.end);
    sprites.push({ bitmap: { w: 8, h: 8, pixels: D.slowpoke[0x0f] }, colors: SCROLLBAR_COLORS, x: 153, y: 4 + top });
    if (this.entering === undefined) panels.push({ colors: D.palettes.dex, sprites });          // InitDexEntryScreen clears the sprites first
    return panels;
  }

  entryPanels() {
    const species = this.species, number = dexNumber(species), entry = D.entries[species], caught = this.caught(species);
    const green = this.entered < ENTRY_GREEN_FRAMES;
    this.picPalette = green ? D.palettes.question : WHITE;          // the picture's color 0 (its other colors come with the picture)
    const map = new TileMap();
    map.border(0, 0, 18, 15);
    map.set(19, 0, 0x34); map.fill(19, 1, 1, 15, 0x7f); map.set(19, 16, 0x39);
    map.fill(1, 10, 19, 1, 0x61);
    map.fill(1, 17, 18, 1, 0x7f);
    map.text(9, 7, 'HT  ?'); map.set(14, 7, 0x5e); map.text(15, 7, '??'); map.set(17, 7, 0x5f);
    map.text(9, 9, 'WT   ???lb');
    map.set(0, 17, 0x3b); map.text(2, 17, 'PAGE AREA CRY PRNT');
    map.picture(1, 1);
    map.text(9, 3, POKEMON[species].name);
    map.text(9, 5, entry.category);
    map.set(2, 8, 0x5c); map.set(3, 8, 0x5d); map.text(4, 8, String(number).padStart(3, '0'));
    if (caught) {
      map.text(12, 7, `${String(Math.floor(entry.height / 100)).padStart(2, ' ')}.${String(entry.height % 100).padStart(2, '0')}`); map.set(14, 7, 0x5e);
      map.text(11, 9, `${String(Math.floor(entry.weight / 10)).padStart(4, ' ')}.${entry.weight % 10}`);
      map.fill(2, 11, 18, 5, 0x7f);
      map.fill(1, 10, 19, 1, 0x61);
      map.set(1, 9, 0x55); map.set(2, 9, 0x55); map.set(1, 10, 0x56); map.set(2, 10, this.page ? 0x58 : 0x57);
      entry.pages[this.page].forEach((line, i) => map.text(2, 11 + 2 * i, line));
    }
    map.set(18, 1, 0x62); map.set(19, 1, 0x63); map.set(18, 2, 0x64); map.set(19, 2, 0x65);
    map.set(20, 0, 0x66);
    for (let y = 1; y <= 15; y++) map.set(20, y, 0x67);
    map.set(20, 16, 0x68); map.set(20, 17, 0x3c);
    map.set(MENU[this.menu], 17, this.blink >= 0 && !(this.blink & 8) ? FONT_CODES['▶'] : 0x7f);
    const footprint = D.footprints[number - 1];
    const tiles = this.tilesOf(map, 21).filter(([x, y]) => !(y >= 1 && y <= 2 && x >= 18 && x <= 19));
    this.backdrop(tiles);
    footprint.forEach((tile, i) => tiles.push([18 + (i & 1), 1 + (i >> 1), tile, D.palettes.dex]));
    const panels = [{ fill: 2, colors: D.palettes.dex, dx: -SCX, tiles }];
    if (this.caught(species) || this.seen(species)) panels.push({ colors: null, dx: -SCX, pic: { species, x: 1, y: 1, ...(green && { palette: D.palettes.question }) } });
    return panels;
  }
}
