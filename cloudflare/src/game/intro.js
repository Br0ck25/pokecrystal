// Title screen and main menu (engine/movie/title.asm, engine/menus/intro_menu.asm RunTitleScreen/TitleScreen*, and
// engine/menus/main_menu.asm). Frame-stepped like Game: update(input) returns null, or what the player chose.
// Not ported: the copyright and Game Freak splash screens, the intro movie, music, and the secret key combinations
// (delete save data, reset clock); NEW GAME starts in the player's room without the introduction and naming.
import { parseSave } from './save.js';
import { moveCursor, mainMenuView, saveInfoView } from './menu.js';

export const TITLE_TIMER = 73 * 60 + 36;       // TitleScreenTimer: frames before the title restarts the intro
const CRYSTAL_START_Y = -0x22 & 255, CRYSTAL_REST_Y = 6 + 16;

export class Intro {
  constructor({ saveStore = null } = {}) {
    this.saveStore = saveStore;
    this.cursor = 0;
    this.restartTitle();
  }

  restartTitle() {
    this.stage = 'title';
    this.title = { scene: 'entrance', scx: 112, crystalY: CRYSTAL_START_Y, window: false, windowShown: false, frames: 0, crystalShown: CRYSTAL_START_Y, suicuneCounter: 0, suicune: 0, suicuneShown: 0, timer: 0 };
    this.menu = null;
  }

  /** The saved game's data when one is stored and readable. */
  savedGame() {
    try { return this.saveStore ? parseSave(this.saveStore.read()) : null; } catch { return null; }
  }

  /** What the title screen shows now: the arguments of titleFrame (render/title-frame.js). */
  titleState() { return this.title; }

  update(input = {}) {
    if (this.stage === 'title') return this.updateTitle(input);
    return this.stage === 'menu' ? this.updateMenu(input) : this.updateConfirm(input);
  }

  updateTitle(input) {
    const t = this.title;
    t.crystalShown = t.crystalY;                 // the sprites and the tile map are copied to the screen at the start of the next frame
    t.suicuneShown = t.suicune;
    t.windowShown = t.window;
    t.frames++;
    if (t.scene === 'entrance') {                // TitleScreenEntrance: slide in 4 pixels a frame, drop the crystal 2 a frame
      if (t.scx === 0) { t.scene = 'timer'; t.window = true; }
      else {
        t.scx -= 4;
        if (t.crystalY !== CRYSTAL_REST_Y) t.crystalY = (t.crystalY + 2) & 255;
      }
    } else if (t.scene === 'timer') { t.scene = 'main'; t.timer = TITLE_TIMER; }
    else if (t.timer === 0) this.restartTitle();
    else {
      t.timer--;
      if (input.a || input.start) { this.stage = 'menu'; this.cursor = 0; this.menu = { lastDir: null, repeat: 0 }; return null; }
    }
    if ((t.suicuneCounter++ & 7) === 0) t.suicune = ((t.suicuneCounter - 1) & 0x18) >> 3;   // SuicuneFrameIterator
    return null;
  }

  menuItems() { return this.savedGame() ? ['CONTINUE', 'NEW GAME', 'OPTION'] : ['NEW GAME', 'OPTION']; }

  updateMenu(input) {
    const items = this.menuItems();
    this.cursor = moveCursor(this.menu, input.dir, this.cursor, items.length);
    if (input.b) { this.restartTitle(); return null; }             // MainMenu returns: back to the title screen
    if (!input.a) return null;
    const item = items[this.cursor];
    if (item === 'NEW GAME') return { start: 'new' };
    if (item === 'CONTINUE') { this.stage = 'confirm'; this.confirmFrames = 0; }
    return null;                                                   // OPTION is not ported
  }

  /** Continue: the save-info box, 20 frames, then A loads the game and B goes back to the menu. */
  updateConfirm(input) {
    if (++this.confirmFrames <= 20) return null;
    if (input.b) { this.stage = 'menu'; return null; }
    return input.a ? { start: 'continue', save: this.saveStore.read() } : null;
  }

  /** Boxes and text to draw on the white screen of the main menu, bottom layer first. */
  menuPanels(now = new Date()) {
    if (this.stage === 'title') return [];
    if (this.stage === 'confirm') return [saveInfoView(this.savedGame().state, 8)];       // the main menu has been closed
    return [mainMenuView(this.menuItems(), this.cursor), ...(this.savedGame() ? [clockView(now)] : [])];
  }
}

/** MainMenu_PrintCurrentTimeAndDay: box at (0,14), the weekday, then the time of day and the hour. */
export function clockView(now) {
  const days = ['SUN', 'MON', 'TUES', 'WEDNES', 'THURS', 'FRI', 'SATUR'];
  const hour = now.getHours(), minutes = String(now.getMinutes()).padStart(2, '0');
  const timeOfDay = hour < 4 ? 'NITE' : hour < 10 ? 'MORN' : hour < 18 ? 'DAY' : 'NITE';      // MORN_HOUR, DAY_HOUR, NITE_HOUR
  const twelve = hour % 12 || 12;
  return { box: [0, 14, 19, 17], texts: [[1, 15, `${days[now.getDay()]}DAY`], [4, 16, `${timeOfDay} ${twelve}:${minutes}`]] };
}
