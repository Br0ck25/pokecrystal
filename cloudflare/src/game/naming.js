// The naming screen for the player's name (engine/menus/naming_screen.asm, NAME_PLAYER): a 9x5 board of characters
// with a cursor; A enters a character, B deletes, START jumps to END, SELECT switches upper/lower case.
import { NAME_INPUT, PREDEF_PALETTES, MON_ICONS, ICON_OBJ_PALETTE } from '../generated/intro.js';
import { directionRepeat } from './menu.js';
import { tiles } from '../script/text.js';

const PLAYER_LENGTH = 7;                 // PLAYER_NAME_LENGTH - 1
const MON_LENGTH = 10;                   // MON_NAME_LENGTH - 1
const ENTRY = { x: 5, y: 6 };            // StoreSpriteIconParams: where the name is placed

export class NamingScreen {
  /**
   * gender: 'MALE' | 'FEMALE' picks the player icon's colors. mon: { species, name, gender } names a Pokémon instead (NAME_MON).
   * The name starts empty (the underline sits on the first slot).
   */
  constructor({ gender = 'MALE', mon = null } = {}) {
    this.gender = gender;
    this.mon = mon;
    this.maxLength = mon ? MON_LENGTH : PLAYER_LENGTH;
    this.entry = ['<DOT>', ...Array(this.maxLength - 1).fill('→')];  // NamingScreen_InitNameEntry
    this.length = 0;
    this.lower = false;                  // wNamingScreenLetterCase
    this.cx = 0;                         // cursor column 0-8 and row 0-4 (SPRITEANIMSTRUCT_VAR1 / VAR2)
    this.cy = 0;
    this.held = { lastDir: null, repeat: 0 };
    this.frame = 0;
    this.kind = 'panels';
  }

  board() { return NAME_INPUT[this.lower ? 'NameInputLower' : 'NameInputUpper']; }

  /** NamingScreen_GetCursorPosition: 0 on the letters, otherwise 1 case switch, 2 delete, 3 end (the bottom row). */
  zone() {
    if (this.cy !== 4) return 0;
    return this.cx < 3 ? 1 : this.cx < 6 ? 2 : 3;
  }

  currentChar() { return tiles(this.board()[this.cy])[this.cx * 2]; }

  update(input) {
    this.frame++;
    const dir = directionRepeat(this.held, input.dir);
    if (dir) this.move(dir);
    if (input.a) return this.press();
    if (input.b) this.delete();
    else if (input.start) { this.cx = 8; this.cy = 4; }
    else if (input.select) this.lower = !this.lower;
    return null;
  }

  move(dir) {
    const zone = this.zone();
    if (dir === 'right') {
      if (zone) this.cx = (zone === 3 ? 0 : zone) * 3;
      else this.cx = this.cx >= 8 ? 0 : this.cx + 1;
    } else if (dir === 'left') {
      if (zone) this.cx = ((zone === 1 ? 4 : zone) - 2) * 3;
      else this.cx = this.cx === 0 ? 8 : this.cx - 1;
    } else if (dir === 'down') this.cy = this.cy >= 4 ? 0 : this.cy + 1;
    else if (dir === 'up') this.cy = this.cy === 0 ? 4 : this.cy - 1;
  }

  press() {
    const zone = this.zone();
    if (zone === 1) { this.lower = !this.lower; return null; }
    if (zone === 2) { this.delete(); return null; }
    if (zone === 3) return { name: this.name() };
    if (this.length < this.maxLength) {                                 // NamingScreen_TryAddCharacter
      this.entry[this.length++] = this.currentChar();
      if (this.length < this.maxLength) this.entry[this.length] = '<DOT>';
      else { this.cx = 8; this.cy = 4; }                            // the string is full: on to END
    } else { this.cx = 8; this.cy = 4; }
    return null;
  }

  delete() {                                                        // NamingScreen_DeleteCharacter
    if (!this.length) return;
    this.length--;
    this.entry[this.length] = '<DOT>';
    if (this.length + 1 < this.maxLength) this.entry[this.length + 1] = '→';
  }

  name() { return this.entry.slice(0, this.length).join(''); }

  /** What to draw: the checkered border, the name box and the board, in the DIPLOMA palette. */
  panels() {
    const colors = PREDEF_PALETTES.DIPLOMA;
    const texts = [];
    const border = { colors, texts: Array.from({ length: 18 }, (_, y) => [0, y, '■'.repeat(20)]) };
    const panel = { colors, texts, clears: [[1, 1, 18, 6], [1, 8, 18, 7], [1, 16, 18, 1]] };   // ClearBox calls of NamingScreen_InitText
    if (this.mon) {                                                 // NamingScreen .Pokemon
      const glyph = { MALE: '♂', FEMALE: '♀' }[this.mon.gender];
      texts.push([5, 2, `${this.mon.name}'S`], [5, 4, 'NICKNAME?'], ...(glyph ? [[1, 2, glyph]] : []));
    } else texts.push([5, 2, 'YOUR NAME?']);
    texts.push([ENTRY.x, ENTRY.y, this.entry.join('')]);
    this.board().forEach((row, i) => texts.push([2, 8 + 2 * i, row]));
    // The cursor is a 9x9 outline around a letter, or a 40x9 one around lower/UPPER, DEL and END (OAMData_TextEntryCursor[Big]).
    const bottom = this.cy === 4;
    const left = 16 + (bottom ? [0, 0, 0, 48, 48, 48, 96, 96, 96][this.cx] : this.cx * 16), top = 64 + this.cy * 16;
    panel.cursorBox = bottom ? [left, top - 1, left + 39, top + 7] : [left - 1, top - 1, left + 7, top + 7];
    // SPRITE_ANIM_OBJ_RED_WALK / BLUE_WALK: stand, step, stand, mirrored step, 8 frames each
    const phase = (this.frame >> 3) & 3;
    // the Pokémon's menu icon alternates its two frames every 8 frames (SPRITE_ANIM_FRAMESET_PARTY_MON)
    if (this.mon) panel.sprites = [{ icon: MON_ICONS.sheets[MON_ICONS.species[this.mon.species]][(this.frame >> 3) & 1], colors: ICON_OBJ_PALETTE, x: 16, y: 12 }];
    else panel.sprites = [{ sprite: this.gender === 'FEMALE' ? 'SPRITE_KRIS' : 'SPRITE_CHRIS', palette: this.gender === 'FEMALE' ? 'BLUE' : 'RED',
      row: phase % 2 ? 3 : 0, mirror: phase === 3, x: 16, y: 12 }];
    return [border, panel];
  }
}
