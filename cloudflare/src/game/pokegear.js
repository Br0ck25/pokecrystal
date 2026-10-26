// The Pokégear (engine/pokegear/pokegear.asm): four cards (clock, map, phone, radio) switched with LEFT and RIGHT, B leaves. Every card is a
// 20x18 tilemap of the town-map and Pokégear tiles with a few object sprites on top. Frame-stepped: update(input) returns true when closed.
import { POKEGEAR as G } from '../generated/pokegear.js';

const BLANK = 0x4f;
const CARDS = ['clock', 'map', 'phone', 'radio'];
const OPEN_FRAMES = 24;                      // white while the graphics load (measured), then the card appears
const TEXT_FRAMES = 14;                      // "Press any button to exit." comes this long after the clock card
const SWITCH_FRAMES = 18;                    // a card change: the new one appears this long after the button
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const ARROW_X = [0x00, 0x10, 0x20, 0x30];     // AnimatePokegearModeIndicatorArrow
const ICONS = { clock: [0, 0x46], map: [2, 0x40], phone: [4, 0x44], radio: [6, 0x42] };      // Pokegear_FinishTilemap: column, first tile (2x2: n, n+1, n+$10, n+$11)
const CARD_FLAGS = { map: 'ENGINE_MAP_CARD', phone: 'ENGINE_PHONE_CARD', radio: 'ENGINE_RADIO_CARD' };

/** The time shown: the device's, unless the state carries a fixed one (the reference comparison). */
export function clockNow(state) {
  if (state.clock) return state.clock;
  const now = new Date();
  return { day: now.getDay(), hour: now.getHours(), minute: now.getMinutes() };
}

/** PrintHoursMins: "10:00 AM" with the hour right-aligned in two columns. */
export function hoursMins({ hour, minute }) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h).padStart(2, ' ')}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

const EMPTY = '0'.repeat(64);
const tileFor = (id) => (id < 0x30 ? G.town[id] : id < 0x60 ? G.gear[id - 0x30] : EMPTY);          // ids from $60 are font tiles (the blank $7f)

/** A 16x16 object made of four 8x8 tiles of pokegear_sprites.png starting at `base` (2x2: n, n+1, n+2, n+3). */
function sprite2x2(base) {
  let pixels = '';
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) pixels += G.sprites[base + (y >> 3) * 2 + (x >> 3)][(y & 7) * 8 + (x & 7)];
  }
  return { w: 16, h: 16, pixels };
}

export class PokegearScreen {
  constructor(state) {
    this.state = state;
    this.frame = 0;
    this.card = 0;                             // index into CARDS
    this.pending = null;                       // { card, at } while the next card loads
    this.gender = state.playerGender === 'FEMALE' ? 'female' : 'male';
    this.palettes = G.palettes[this.gender];
    this.held = null;
  }

  has(card) { return card === 'clock' || this.state.engineFlags.has(CARD_FLAGS[card]); }

  /** The card RIGHT or LEFT leads to from here, skipping the ones not yet owned (the jumps in PokegearClock_Joypad and friends). */
  neighbour(step) {
    for (let i = this.card + step; i >= 0 && i < CARDS.length; i += step) if (this.has(CARDS[i])) return i;
    return null;
  }

  update(input) {
    this.frame++;
    if (this.frame <= OPEN_FRAMES) return false;
    if (this.pending) {
      if (this.frame >= this.pending.at) { this.card = this.pending.card; this.pending = null; this.since = this.frame; }
      return false;
    }
    this.since ??= OPEN_FRAMES + 1;
    if (this.frame - this.since < 1) return false;
    const name = CARDS[this.card];
    if (input.b) return true;
    if (name === 'clock' && (input.a || input.start || input.select) && this.frame - this.since >= TEXT_FRAMES) return true;
    const step = input.dir === 'right' && this.held !== 'right' ? 1 : input.dir === 'left' && this.held !== 'left' ? -1 : 0;
    this.held = input.dir ?? null;
    if (step) {
      const next = this.neighbour(step);
      if (next !== null) this.pending = { card: next, at: this.frame + SWITCH_FRAMES };
    }
    return false;
  }

  /** The tilemap of the current card as ids, text excluded. */
  tilemap(name) {
    const map = new Array(360).fill(BLANK);
    const rle = G.tilemaps[name];
    if (rle) rle.forEach((id, i) => { map[i] = id; });
    for (let i = 0; i < 8; i++) { map[i] = BLANK; map[20 + i] = BLANK; }              // Pokegear_FinishTilemap
    for (const card of CARDS) {
      if (!this.has(card)) continue;
      const [column, first] = ICONS[card];
      map[column] = first; map[column + 1] = first + 1; map[20 + column] = first + 0x10; map[21 + column] = first + 0x11;
    }
    return map;
  }

  panels() {
    if (this.frame <= OPEN_FRAMES || this.pending) return [{ fill: 0, colors: this.palettes[0] }];
    const name = CARDS[this.card], colors = this.palettes[0];
    const map = this.tilemap(name);
    const tiles = [];
    map.forEach((id, i) => tiles.push([i % 20, Math.floor(i / 20), tileFor(id), this.palettes[G.paletteMap[id] ?? 0]]));
    const out = [{ colors, tiles }];
    const texts = [], arrow = { bitmap: sprite2x2(0), colors: [colors[0], [31, 19, 10], [31, 15, 0], [0, 0, 0]], x: ARROW_X[this.card], y: 12 };
    if (name === 'clock') {
      const now = clockNow(this.state);
      out.push({ colors, clear: [3, 5, 14, 5], texts: [[12, 1, ' SWITCH▶'], [6, 6, DAYS[now.day]], [6, 8, hoursMins(now)]], box: [0, 12, 19, 17] });
      if (this.frame - (this.since ?? 0) >= TEXT_FRAMES) out.push({ colors, texts: [[1, 14, 'Press any button'], [1, 16, 'to exit.']] });
    } else out.push({ colors, texts, box: [0, 12, 19, 17] });
    out.push({ colors, sprites: [arrow] });
    return out;
  }
}
