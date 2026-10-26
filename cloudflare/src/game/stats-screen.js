// The Pokémon summary (engine/pokemon/stats_screen.asm): three pages (pink: HP, status, type, experience; green: item and moves;
// blue: ID, OT and stats) under the Pokémon's picture. Frame-stepped: update(input) returns true when the screen is closed.
import { STATS_SCREEN as ST } from '../generated/stats-screen.js';
import { HUD_TILES } from '../generated/battle-ui.js';
import { BATTLE_EXTRA } from '../generated/party-ui.js';
import { PREDEF_PALETTES } from '../generated/intro.js';
import { POKEMON } from '../generated/pokemon.js';
import { MOVES } from '../generated/moves.js';
import { ITEMS } from '../generated/items.js';
import { expAtLevel } from '../script/mon.js';
import { monGender } from '../script/gender.js';
import { expBarPixels, expTiles } from '../battle/screen.js';
import { hpPixels, hpColor, hpBarTiles, displayName } from './party.js';
import { directionRepeat } from './menu.js';

const BLANK_FRAMES = 30;
const typeName = (t) => t.replace('_TYPE', '');
const MAX_LEVEL = 100;
const STATUS_NAMES = [[7, 'SLP'], [1 << 3, 'PSN'], [1 << 4, 'BRN'], [1 << 5, 'FRZ'], [1 << 6, 'PAR']];

export class StatsScreen {
  /** party: the party array; index: which Pokémon; onIndex(i) is told when UP/DOWN changes it */
  constructor(state, index) {
    this.state = state;
    this.party = state.party;
    this.index = index;
    this.page = 0;
    this.frame = 0;
    this.pic = null;
    this.held = { lastDir: null, repeat: 0 };
    this.load();
  }

  async load() {
    const species = this.mon.species;
    this.pic = null;
    const mod = await import(`../generated/pokemon/${species}.js`);
    const tiles = mod.PIC.size / 8;
    this.pic = { size: mod.PIC.size, pixels: mod.PIC.front, palette: mod.PIC.palette, offX: tiles < 7 ? 1 : 0, offY: 7 - tiles };
  }

  get mon() { return this.party[this.index]; }

  update(input) {
    this.frame++;
    if (input.b) return true;
    const dir = directionRepeat(this.held, input.dir ?? null);
    if (input.a) { if (this.page === 2) return true; this.page++; return false; }
    if (dir === 'right') this.page = (this.page + 1) % 3;
    else if (dir === 'left') this.page = (this.page + 2) % 3;
    else if (dir === 'down' && this.index < this.party.length - 1) { this.index++; this.load(); }
    else if (dir === 'up' && this.index > 0) { this.index--; this.load(); }
    return false;
  }

  panels() {
    const mon = this.mon;
    if (!this.pic || this.frame < BLANK_FRAMES) return [{ fill: 0 }];
    const data = POKEMON[mon.species];
    const pages = ST.pages, tint = ST.tints[this.page];
    const hpPal = PREDEF_PALETTES[hpColor(hpPixels(mon.hp, mon.stats.hp))];
    const top = [], topTexts = [], tile = (n) => (n >= 0x73 && n <= 0x74 ? BATTLE_EXTRA[n - 0x60] : HUD_TILES[n] ?? ST.tiles[n - 0x31]);
    const t = (x, y, n, list, pal) => list.push([x, y, tile(n), pal]);
    const monPal = this.pic.palette;
    // upper half, in the Pokémon's palette
    t(8, 0, 0x74, top, monPal);
    topTexts.push([9, 0, '.'], [10, 0, String(data.id).padStart(3, '0')], [8, 2, displayName(mon)], [9, 4, `/${data.name}`]);
    const level = (x, y, n, list, texts, pal) => { t(x, y, 0x6e, list, pal); texts.push([x + 1, y, String(n)]); };
    level(14, 0, mon.level, top, topTexts, monPal);
    const g = monGender(mon.species, mon.dvs);
    if (g) topTexts.push([18, 0, g === 'MALE' ? '♂' : '♀']);
    for (let x = 0; x < 20; x++) t(x, 7, 0x62, top, monPal);
    t(12, 6, 0x71, top, monPal);
    topTexts.push([19, 6, '▶']);
    const out = [{ colors: monPal, clear: [0, 0, 20, 8], tiles: top, texts: topTexts, pic: { ...this.pic, x: this.pic.offX, y: this.pic.offY } }];
    // the page indicator: four-tile squares, the current page's large, each in its own page palette
    const squares = [];
    for (let p = 0; p < 3; p++) {
      const base = p === this.page ? 0x3a : 0x36, x = 13 + 2 * p;
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy], i) => squares.push([x + dx, 5 + dy, tile(base + i), pages[p]]));
    }
    out.push({ colors: pages[0], tiles: squares });
    // lower half
    const colors = [tint, hpPal[1], hpPal[2], [0, 0, 0]];
    const tiles = [], texts = [], expTilesList = [];
    const bar = (x, y, n) => tiles.push([x, y, tile(n), colors]);
    if (this.page === 0) {
      const pixels = hpPixels(mon.hp, mon.stats.hp);
      [0x60, 0x61, ...hpBarTiles(pixels)].forEach((n, i) => bar(i, 9, n));
      bar(8, 9, 0x41);
      texts.push([1, 10, `${String(mon.hp).padStart(3, ' ')}/${String(mon.stats.hp).padStart(3, ' ')}`]);
      texts.push([0, 12, 'STATUS/'], [0, 14, 'TYPE/']);
      const status = mon.hp === 0 ? 'FNT' : STATUS_NAMES.find(([bit]) => (bit === 7 ? (mon.status & 7) : mon.status & bit))?.[1];
      texts.push([6, 13, status ?? 'OK ']);
      const types = data.types.map(typeName);
      texts.push([1, 15, types[0]]);
      if (types[1] !== types[0]) texts.push([1, 16, types[1]]);
      for (let y = 8; y < 18; y++) bar(9, y, 0x31);
      texts.push([10, 9, 'EXP POINTS'], [13, 10, String(mon.exp).padStart(7, ' ')], [10, 12, 'LEVEL UP']);
      const next = mon.level >= MAX_LEVEL ? 0 : expAtLevel(mon.species, mon.level + 1) - mon.exp;
      texts.push([13, 13, String(next).padStart(7, ' ')], [14, 14, 'TO']);
      level(17, 14, Math.min(MAX_LEVEL, mon.level + (mon.level < MAX_LEVEL ? 1 : 0)), tiles, texts, colors);
      const expColors = [tint, ST.expBarPalette[0], ST.expBarPalette[1], [0, 0, 0]];
      expTilesList.push([10, 16, tile(0x40), expColors], [19, 16, tile(0x41), expColors]);
      expTiles(expBarPixels(mon)).forEach((n, i) => expTilesList.push([18 - i, 16, tile(n), expColors]));
    } else if (this.page === 1) {
      texts.push([0, 8, 'ITEM'], [8, 8, mon.item ? ITEMS[mon.item].name : '---'], [0, 10, 'MOVE']);
      for (let i = 0; i < 4; i++) {
        const move = mon.moves[i];
        texts.push([8, 10 + 2 * i, move ? MOVES[move].name : '-']);
        bar(12, 11 + 2 * i, 0x3e); bar(13, 11 + 2 * i, move ? 0x3e : 0x3e);
        if (move) texts.push([15, 11 + 2 * i, `${String(mon.pp[i]).padStart(2, ' ')}/${String(MOVES[move].pp).padStart(2, ' ')}`]);
        else texts.push([12, 11 + 2 * i, '--']);
      }
    } else {
      t(0, 9, 0x73, tiles, colors); t(1, 9, 0x74, tiles, colors);
      texts.push([2, 9, '.'], [2, 10, String(mon.id ?? 0).padStart(5, '0')], [0, 12, 'OT/'], [2, 13, mon.id === this.state.playerId ? this.state.playerName : 'TEST']);
      for (let y = 8; y < 18; y++) bar(10, y, 0x31);
      const names = ['ATTACK', 'DEFENSE', 'SPCL.ATK', 'SPCL.DEF', 'SPEED'], keys = ['atk', 'def', 'sat', 'sdf', 'spd'];
      names.forEach((n, i) => { texts.push([11, 8 + 2 * i, n], [17, 9 + 2 * i, String(mon.stats[keys[i]]).padStart(3, ' ')]); });
    }
    out.push({ colors, clear: [0, 8, 20, 10], tiles: [...tiles, ...expTilesList], texts });
    return out;
  }
}
