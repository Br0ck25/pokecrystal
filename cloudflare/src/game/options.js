// The OPTION screen (engine/menus/options_menu.asm _Option) and the settings it edits (data/default_options.asm).
// Pure and frame-stepped like the other screens: update(input) returns true when the screen is closed.
import { PREDEF_PALETTES } from '../generated/intro.js';
import { directionRepeat } from './menu.js';

export const DEFAULT_OPTIONS = { textSpeed: 1, battleScene: true, battleShift: true, stereo: false, print: 2, menuAccount: true, frame: 0 };
export const options = (state) => (state.options ??= { ...DEFAULT_OPTIONS });
/** wOptions text delay for each OPT_TEXT_SPEED_* (TEXT_DELAY_FAST, MED, SLOW): frames per character. */
export const TEXT_DELAYS = [1, 3, 5];

const TEXT_SPEED = ['FAST', 'MID ', 'SLOW'];
const PRINT = ['LIGHTEST', 'LIGHTER ', 'NORMAL  ', 'DARKER  ', 'DARKEST '];
const CANCEL = 7;
const FRAMES = 8;                                                   // NUM_FRAMES

export class OptionsScreen {
  constructor(settings) {
    this.settings = settings;
    this.row = 0;                                                   // wJumptableIndex
    this.held = { lastDir: null, repeat: 0 };
  }

  /** One pass of the joypad loop. input: { dir, a, b, start }. */
  update(input) {
    if (input.start || input.b) return true;
    const dir = directionRepeat(this.held, input.dir ?? null);
    if (dir === 'down') this.row = this.row === CANCEL ? 0 : this.row + 1;
    else if (dir === 'up') this.row = this.row === 0 ? CANCEL : this.row - 1;
    else if (dir === 'left' || dir === 'right') this.change(dir === 'right' ? 1 : -1);
    return this.row === CANCEL && Boolean(input.a);
  }

  change(step) {
    const s = this.settings;
    const cycle = (n, count) => (n + step + count) % count;
    switch (this.row) {
      case 0: s.textSpeed = cycle(s.textSpeed, 3); break;
      case 1: s.battleScene = !s.battleScene; break;
      case 2: s.battleShift = !s.battleShift; break;
      case 3: s.stereo = !s.stereo; break;
      case 4: s.print = cycle(s.print, 5); break;
      case 5: s.menuAccount = !s.menuAccount; break;
      case 6: s.frame = cycle(s.frame, FRAMES); break;
      default: break;
    }
  }

  /** A box over the whole screen with the settings listed on the even rows, in the DIPLOMA palette. */
  panels() {
    const s = this.settings;
    const label = [
      [2, 2, 'TEXT SPEED'], [2, 4, 'BATTLE SCENE'], [2, 6, 'BATTLE STYLE'], [2, 8, 'SOUND'], [2, 10, 'PRINT'], [2, 12, 'MENU ACCOUNT'], [2, 14, 'FRAME'], [2, 16, 'CANCEL'],
    ];
    const value = [
      TEXT_SPEED[s.textSpeed], s.battleScene ? 'ON ' : 'OFF', s.battleShift ? 'SHIFT' : 'SET  ', s.stereo ? 'STEREO' : 'MONO  ', PRINT[s.print], s.menuAccount ? 'ON ' : 'OFF',
    ];
    const colons = [3, 5, 7, 9, 11, 13, 15].map((y) => [10, y, ':']);
    return [{
      colors: PREDEF_PALETTES.DIPLOMA, fill: 0, box: [0, 0, 19, 17],
      texts: [...label, ...colons, ...value.map((v, i) => [11, 3 + 2 * i, v]), [11, 15, 'TYPE'], [16, 15, String(s.frame + 1)]],
      cursor: [1, 2 + 2 * this.row, '▶'],
    }];
  }
}
