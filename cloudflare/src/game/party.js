// The party screen opened by START > POKéMON (engine/pokemon/party_menu.asm, mon_menu.asm, mon_submenu.asm):
// one row per Pokémon with icon, nickname, level, HP bar and HP digits, the action submenu, and SWITCH.
// The summary (STATS), MOVE and ITEM actions are not ported (reported through `unported`).
import { BATTLE_EXTRA, PARTY_MENU_BG, HELD_ITEM_ICONS } from '../generated/party-ui.js';
import { PREDEF_PALETTES, MON_ICONS, ICON_OBJ_PALETTE } from '../generated/intro.js';
import { POKEMON } from '../generated/pokemon.js';
import { MOVES } from '../generated/moves.js';
import { directionRepeat } from './menu.js';

const HP_BAR_PIXELS = 48;
const FIELD_MOVES = ['CUT', 'FLY', 'SURF', 'STRENGTH', 'FLASH', 'WATERFALL', 'WHIRLPOOL', 'DIG', 'TELEPORT', 'SOFTBOILED', 'HEADBUTT', 'ROCK_SMASH', 'MILK_DRINK', 'SWEET_SCENT'];
const BLANK_FRAMES = 28;                                   // the screen stays white while its graphics load (measured: the first icon appears ~29 frames after the A press)
const STRINGS = { choose: 'Choose a #MON.', moveTo: 'Move to where?' };

/** The icon's two frames, with the held item or mail drawn over the lower left tile (the *WithItem framesets use tile $09 / $08 there). */
export function iconFrames(mon) {
  const frames = MON_ICONS.sheets[MON_ICONS.species[mon.species]];
  if (!mon.item) return frames;
  const tile = mon.item.endsWith('MAIL') ? HELD_ITEM_ICONS.mail : HELD_ITEM_ICONS.item;
  return frames.map((pixels) => {
    const out = pixels.split('');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[(8 + y) * 16 + x] = tile[y * 8 + x];
    return out.join('');
  });
}

export const displayName = (mon) => mon.nickname ?? POKEMON[mon.species].name;

/** ComputeHPBarPixels: e = hp * 48 / max, at least 1 while any HP is left. */
export const hpPixels = (hp, max) => (hp === 0 ? 0 : Math.max(1, Math.floor((hp * HP_BAR_PIXELS) / max)));
/** GetHPPal: green from 24 pixels, yellow from 10, otherwise red. */
export const hpColor = (pixels) => (pixels >= 24 ? 'HP_GREEN' : pixels >= 10 ? 'HP_YELLOW' : 'HP_RED');
/** The tile numbers DrawBattleHPBar writes after "HP:": 6 tiles of $6a (full) / $62 + remainder / $62 (empty), then the end cap $6b. */
export function hpBarTiles(pixels) {
  const tiles = [];
  let left = pixels;
  for (let i = 0; i < 6; i++) { const n = Math.min(8, left); left -= n; tiles.push(n === 8 ? 0x6a : 0x62 + n); }
  return tiles;
}

/** GetMonSubmenuItems: the field moves it knows, then STATS, SWITCH, MOVE, ITEM and CANCEL. */
export const submenuItems = (mon) => [...mon.moves.filter((m) => FIELD_MOVES.includes(m)).map((m) => ({ id: m, label: MOVES[m].name })),
  ...['STATS', 'SWITCH', 'MOVE', 'ITEM', 'CANCEL'].map((id) => ({ id, label: id }))];

export class PartyScreen {
  constructor(state) {
    this.state = state;
    this.party = state.party;
    this.cursor = Math.min(state.partyCursor ?? 1, this.party.length + 1);        // wPartyMenuCursor, 1-based; the last row is CANCEL
    this.phase = 'select';
    this.held = { lastDir: null, repeat: 0 };
    this.frame = 0;
    this.unported = new Set();
  }

  /** One frame; true when the screen is closed. */
  update(input) {
    this.frame++;
    const rows = this.party.length + (this.phase === 'switch' ? 0 : 1);
    if (this.phase === 'submenu') { this.updateSubmenu(input); return false; }
    const dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
    if (dir && rows) this.cursor = ((this.cursor - 1 + (dir === 'up' ? -1 : 1) + rows) % rows) + 1;
    if (input.b) return this.phase === 'switch' ? this.endSwitch() : this.close();
    if (!input.a) return false;
    if (this.phase === 'switch') return this.finishSwitch();
    if (this.cursor > this.party.length) return this.close();                     // CANCEL
    this.state.partyCursor = this.cursor;
    this.sub = { items: submenuItems(this.party[this.cursor - 1]), cursor: 0 };
    this.phase = 'submenu';
    return false;
  }

  close() { this.state.partyCursor = this.cursor; return true; }

  updateSubmenu(input) {
    const s = this.sub, dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
    if (dir) s.cursor = (s.cursor + (dir === 'up' ? -1 : 1) + s.items.length) % s.items.length;
    if (input.b) { this.phase = 'select'; this.sub = null; return; }
    if (!input.a) return;
    const { id } = s.items[s.cursor];
    this.sub = null;
    if (id === 'SWITCH' && this.party.length >= 2) { this.switchFrom = this.cursor; this.phase = 'switch'; return; }
    this.phase = 'select';
    if (id !== 'CANCEL' && id !== 'SWITCH') this.unported.add(`party: ${id}`);
  }

  endSwitch() { this.phase = 'select'; this.cursor = this.switchFrom; return false; }

  /** _SwitchPartyMons: the two Pokémon trade places. */
  finishSwitch() {
    const a = this.switchFrom - 1, b = this.cursor - 1;
    if (a !== b) [this.party[a], this.party[b]] = [this.party[b], this.party[a]];
    this.phase = 'select';
    this.state.partyCursor = this.cursor;
    return false;
  }

  /** Panels bottom first: tiles and texts in the party menu palette, the HP bars in their HP palette, icons, then boxes. */
  panels() {
    if (this.frame <= BLANK_FRAMES) return [{ colors: PARTY_MENU_BG, fill: 0 }];
    const n = this.party.length, text = [], tiles = [], out = [];
    const icons = [], lv = [];
    this.party.forEach((mon, i) => {
      const y = 1 + 2 * i;
      text.push([3, y, displayName(mon)]);
      const pixels = hpPixels(mon.hp, mon.stats.hp);
      if (mon.hp === 0) text.push([5, y + 1, 'FNT']);
      else { text.push([9, y + 1, String(mon.level)]); lv.push([8, y + 1, BATTLE_EXTRA[0x6e - 0x60], PARTY_MENU_BG]); }
      text.push([13, y, `${String(mon.hp).padStart(3, ' ')}/${String(mon.stats.hp).padStart(3, ' ')}`]);
      const bar = [[11, y + 1, BATTLE_EXTRA[0]], [12, y + 1, BATTLE_EXTRA[1]], ...hpBarTiles(pixels).map((t, k) => [13 + k, y + 1, BATTLE_EXTRA[t - 0x60]])];
      tiles.push({ colors: PREDEF_PALETTES[hpColor(pixels)], tiles: bar.map(([x, yy, px]) => [x, yy, px, PREDEF_PALETTES[hpColor(pixels)]]) });
      tiles.push({ colors: PARTY_MENU_BG, tiles: [[19, y + 1, BATTLE_EXTRA[0x6b - 0x60], PARTY_MENU_BG]] });
      // SpriteAnimFunc_PartyMon / PartyMonSwitch / PartyMonSelected: the row under the cursor steps right and hops; in SWITCH the picked one hops
      const row = i + 1, hops = this.phase === 'switch' ? row === this.switchFrom : row === this.cursor;
      const right = this.phase === 'switch' ? hops || row === this.cursor : row === this.cursor;
      icons.push({ icon: iconFrames(mon)[this.iconFrame(pixels)], colors: ICON_OBJ_PALETTE, x: right ? 8 : 0, y: 4 + 16 * i + (hops ? this.bounce(pixels) : 0) });
    });
    if (this.phase !== 'switch') text.push([1, 1 + 2 * n, 'CANCEL']);
    out.push({ colors: PARTY_MENU_BG, fill: 0, texts: text, tiles: lv }, ...tiles);
    const cursorRow = 1 + 2 * (this.cursor - 1);
    const hollow = this.phase === 'submenu' || this.phase === 'switch';
    out.push({ colors: PARTY_MENU_BG, texts: [[0, cursorRow, hollow ? '▷' : '▶'], ...(this.phase === 'switch' ? [[0, 1 + 2 * (this.switchFrom - 1), '▷']] : [])], sprites: icons });
    out.push({ box: [0, 14, 19, 17], texts: this.phase === 'submenu' ? [] : [[1, 16, n ? (this.phase === 'switch' ? STRINGS.moveTo : STRINGS.choose).replace('#', 'POKé') : 'You have no <PK><MN>!']] });
    if (this.phase === 'submenu') {
      const items = this.sub.items, top = 18 - 2 * (items.length + 1);
      out.push({ box: [6, top, 19, 17], texts: items.map((it, i) => [8, top + 2 + 2 * i, it.label]), cursor: [7, top + 2 + 2 * this.sub.cursor, '▶'] });
    }
    return out;
  }

  iconFrame(pixels) {
    const period = { HP_GREEN: 9, HP_YELLOW: 73, HP_RED: 137 }[hpColor(pixels)];     // 8 + the slow-down offsets $00, $40, $80
    return Math.floor(this.frame / period) & 1;
  }

  /** SpriteAnimFunc_PartyMonSwitch: every 16 frames the hop toggles between 0 and -2 (green), -1 (yellow) or 0 (red) pixels. */
  bounce(pixels) {
    const high = ((this.frame - 3) >> 4) & 1;
    return high ? { HP_GREEN: -2, HP_YELLOW: -1, HP_RED: 0 }[hpColor(pixels)] : 0;
  }
}
