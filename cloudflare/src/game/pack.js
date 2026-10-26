// The PACK screen (engine/items/pack.asm Pack, engine/menus/scrolling_menu.asm, engine/items/tmhm.asm TMHMPocket and
// engine/items/buy_sell_toss.asm): four pockets listed five at a time, the item's description below, and the item
// submenu. Using, giving and registering items need the party screen and item effects, which are not ported (`unported`).
import { PACK } from '../generated/pack.js';
import { ITEMS } from '../generated/items.js';
import { MOVES } from '../generated/moves.js';
import { SCRIPTS as sharedText } from '../generated/scripts/_text.js';
import { renderText, expandTokens } from '../script/text.js';
import { startTextWait, stepTextWait, textLines } from '../script/textwait.js';
import { directionRepeat } from './menu.js';
import { inPocket, tossItem, itemName } from '../script/bag.js';

export const POCKETS = ['ITEM', 'BALL', 'KEY_ITEM', 'TM_HM'];             // wCurPocket
const ART_ORDER = [1, 3, 0, 2];                                          // PackGFXPointers: the picture for each pocket
const ROWS = 5;
const NAMES = { playerName: '', rivalName: '' };                       // item texts only use # and <PKMN> style tokens
const tmNumbers = Object.keys(ITEMS).filter((c) => ITEMS[c].pocket === 'TM_HM');   // TM01-TM50 then HM01-HM07, in item order

/** The list a pocket shows: [{ item, name, quantity }] without the CANCEL entry. */
export function pocketList(state, pocket) {
  const list = POCKETS[pocket] === 'TM_HM'
    ? tmNumbers.filter((c) => state.items[c] > 0)
    : inPocket(state, POCKETS[pocket]);
  return list.map((item) => ({ item, name: expandTokens(itemName(item), NAMES), quantity: state.items[item] }));
}

const tossable = (item) => !ITEMS[item].property.includes('CANT_TOSS');
const selectable = (item) => !ITEMS[item].property.includes('CANT_SELECT');
const usable = (item) => ITEMS[item].field !== 'ITEMMENU_NOUSE';

/** .ItemBallsKey_LoadSubmenu: which entries the A button offers. */
export function submenuFor(item) {
  if (!tossable(item)) return selectable(item) ? ['USE', 'SEL', 'QUIT'] : ['USE', 'QUIT'];
  const use = usable(item) ? ['USE'] : [];
  return selectable(item) ? [...use, 'GIVE', 'TOSS', 'SEL', 'QUIT'] : [...use, 'GIVE', 'TOSS', 'QUIT'];
}

export class PackScreen {
  constructor(state) {
    this.state = state;
    const memory = (state.pack ??= { pocket: 0, cursor: [1, 1, 1, 1], scroll: [0, 0, 0, 0] });
    this.memory = memory;
    this.phase = 'list';
    this.held = { lastDir: null, repeat: 0 };
    this.sub = null;                 // { items, cursor }
    this.text = null;                // a message in the bottom box
    this.quantity = 1;
    this.frame = 0;
    this.unported = new Set();
    this.normalize();
  }

  get pocket() { return this.memory.pocket; }
  get list() { return pocketList(this.state, this.pocket); }

  /** InitScrollingMenuCursor: keep the scroll and cursor inside the list (items plus CANCEL). */
  normalize() {
    const p = this.pocket, size = this.list.length;
    const max = Math.max(0, size + 1 - ROWS);
    if (this.memory.scroll[p] > max) this.memory.scroll[p] = max;
    const rows = Math.min(ROWS, size + 1);
    if (this.memory.cursor[p] > rows || this.memory.cursor[p] < 1) this.memory.cursor[p] = 1;
  }

  /** The list index under the cursor (size means CANCEL). */
  get selected() { return this.memory.scroll[this.pocket] + this.memory.cursor[this.pocket] - 1; }

  /** One frame: returns true when the pack is closed. input: { dir, a, b }. */
  update(input) {
    this.frame++;
    if (this.phase === 'list') return this.updateList(input);
    if (this.phase === 'submenu') { this.updateSubmenu(input); return false; }
    if (this.phase === 'quantity') { this.updateQuantity(input); return false; }
    if (this.phase === 'yesno') { this.updateYesNo(input); return false; }
    if (this.phase === 'text') { if (stepTextWait(this.text, input)) { this.text = null; this.shown = null; this.phase = 'list'; this.normalize(); } return false; }
    return false;
  }

  updateList(input) {
    const m = this.memory, p = m.pocket, size = this.list.length;
    const dir = directionRepeat(this.held, input.dir ?? null);
    if (dir === 'left' || dir === 'right') {
      m.pocket = (p + (dir === 'right' ? 1 : POCKETS.length - 1)) % POCKETS.length;
      this.normalize();
      return false;
    }
    const rows = Math.min(ROWS, size + 1);
    if (dir === 'down') { if (m.cursor[p] < rows) m.cursor[p]++; else if (m.scroll[p] + ROWS <= size) m.scroll[p]++; }
    else if (dir === 'up') { if (m.cursor[p] > 1) m.cursor[p]--; else if (m.scroll[p] > 0) m.scroll[p]--; }
    if (input.b) return true;
    if (input.select) this.unported.add('pack: SELECT switches items');
    if (input.a) {
      if (this.selected >= size) return true;                             // CANCEL
      this.sub = { items: submenuFor(this.list[this.selected].item), cursor: 0 };
      this.phase = 'submenu';
    }
    return false;
  }

  updateSubmenu(input) {
    const s = this.sub, dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
    if (dir) s.cursor = (s.cursor + (dir === 'up' ? -1 : 1) + s.items.length) % s.items.length;
    if (input.b) { this.phase = 'list'; this.sub = null; return; }
    if (!input.a) return;
    const choice = s.items[s.cursor];
    if (choice === 'TOSS') {
      this.entry = this.list[this.selected];
      this.quantity = 1;
      this.phase = 'quantity';
    } else {
      if (choice !== 'QUIT') this.unported.add(`pack: ${choice}`);
      this.phase = 'list';
    }
    this.sub = null;
  }

  /** BuySellToss_InterpretJoypad: up/down change the number by one (wrapping), left/right by ten. */
  updateQuantity(input) {
    const max = this.entry.quantity, dir = directionRepeat(this.held, input.dir ?? null);
    if (dir === 'down') this.quantity = this.quantity === 1 ? max : this.quantity - 1;
    else if (dir === 'up') this.quantity = this.quantity + 1 > max ? 1 : this.quantity + 1;
    else if (dir === 'left') this.quantity = this.quantity - 10 > 0 ? this.quantity - 10 : 1;
    else if (dir === 'right') this.quantity = Math.min(max, this.quantity + 10);
    if (input.b) { this.phase = 'list'; return; }
    if (input.a) { this.phase = 'yesno'; this.yes = 0; }
  }

  updateYesNo(input) {
    if (input.dir === 'up') this.yes = 0; else if (input.dir === 'down') this.yes = 1;
    if (input.b) { this.phase = 'list'; return; }
    if (!input.a) return;
    if (this.yes === 1) { this.phase = 'list'; return; }
    this.shown = this.list;                                       // the list on screen is only redrawn when the message is gone
    tossItem(this.state, this.entry.item, this.quantity);
    this.say('_ThrewAwayText');
  }

  say(label) {
    const vars = { wStringBuffer2: this.entry?.name ?? '', wItemQuantityChange: this.quantity };
    const screens = renderText([['text_far', label]], { block: (l) => sharedText[l], vars, playerName: this.state.playerName, rivalName: this.state.rivalName });
    this.text = startTextWait(screens);
    this.phase = 'text';
  }

  /** The message box text for the phases that show one. */
  message() {
    if (this.phase === 'text') return textLines(this.text);
    if (this.phase === 'quantity') return renderLines('_AskThrowAwayText', this);
    if (this.phase === 'yesno') return renderLines('_AskQuantityThrowAwayText', this);
    return null;
  }

  panels() {
    const m = this.memory, p = m.pocket, gender = this.state.playerGender === 'FEMALE' ? 'female' : 'male';
    const pal = PACK.palettes[gender];
    const list = this.shown ?? this.list;
    const tile = (x, y, index, palette) => [x, y, PACK.menuTiles[index], pal[palette]];
    const tiles = [];
    for (let y = 1; y <= 11; y++) for (let x = 0; x < 5; x++) tiles.push(tile(x, y, 0x24, 0));
    for (let x = 0; x < 20; x++) tiles.push(tile(x, 0, 0x28 + x, x < 10 ? 1 : 2));
    const art = PACK.art[gender][ART_ORDER[p]];
    art.forEach((pixels, n) => tiles.push([n % 5, 3 + Math.floor(n / 5), pixels, pal[5]]));
    PACK.pocketNames.slice(p * 15, p * 15 + 15).forEach((index, n) => tiles.push(tile(n % 5, 7 + Math.floor(n / 5), index, 4)));
    const background = { fill: 0, tiles };
    const texts = [], quantities = [];
    const entries = [...list.map((e) => e), null];
    const tm = POCKETS[p] === 'TM_HM';
    for (let i = 0; i < ROWS; i++) {
      const e = entries[m.scroll[p] + i];
      if (e === undefined) break;
      const y = 2 + 2 * i;
      if (e === null) { texts.push([8, y, 'CANCEL']); break; }
      if (tm) {
        const n = tmNumbers.indexOf(e.item) + 1;
        const move = expandTokens(MOVES[e.item.replace(/^(TM|HM)_/, '')].name, NAMES);
        texts.push([5, y, n <= 50 ? String(n).padStart(2, '0') : `H${n - 50}`], [8, y, move]);
        if (n <= 50) quantities.push([17, y + 1, `×${String(e.quantity).padStart(2, ' ')}`]);
      } else {
        texts.push([8, y, e.name]);
        if (tossable(e.item)) quantities.push([17, y + 1, `×${String(e.quantity).padStart(2, ' ')}`]);
      }
    }
    const here = entries[this.selected];
    const description = (here ? (tm ? MOVES[here.item.replace(/^(TM|HM)_/, '')].desc : ITEMS[here.item].desc) : []).map((l) => expandTokens(l, NAMES));
    const cursorRow = 2 + 2 * (m.cursor[p] - 1);
    const out = [
      background,
      { colors: pal[0], clear: [5, 1, 15, 11], texts: [...texts, ...quantities] },
      { colors: pal[3], texts: [[7, cursorRow, this.phase === 'list' ? '▶' : '▷']] },
    ];
    const message = this.message();
    out.push({ box: [0, 12, 19, 17], texts: message ? [[1, 14, message.lines[0]], [1, 16, message.lines[1]]] : [[1, 14, description[0] ?? ''], [1, 16, description[1] ?? '']], prompt: message?.prompt });
    if (this.phase === 'submenu') {
      const n = this.sub.items.length, top = 11 - 2 * n;
      out.push({ box: [13, top, 19, 11], texts: this.sub.items.map((label, i) => [15, top + 1 + 2 * i, label]), cursor: [14, top + 1 + 2 * this.sub.cursor, '▶'] });
    }
    if (this.phase === 'quantity') out.push({ box: [15, 9, 19, 11], texts: [[16, 10, `×${String(this.quantity).padStart(2, '0')}`]] });
    if (this.phase === 'yesno') out.push({ box: [14, 7, 19, 11], texts: [[16, 8, 'YES'], [16, 10, 'NO']], cursor: [15, 8 + 2 * this.yes, '▶'] });
    return out;
  }
}

function renderLines(label, screen) {
  const vars = { wStringBuffer2: screen.entry?.name ?? '', wItemQuantityChange: screen.quantity };
  const screens = renderText([['text_far', label]], { block: (l) => sharedText[l], vars, playerName: screen.state.playerName, rivalName: screen.state.rivalName });
  return { lines: screens[screens.length - 1].lines, prompt: false };
}
