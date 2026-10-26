// The trainer card (engine/menus/trainer_card.asm): page 1 (name, money, play time), page 2 (the Johto badges with their leaders).
// Frame-stepped like the other screens: update(input) returns true when the card is closed.
import { TRAINER_CARD as CARD } from '../generated/trainer-card.js';

const PHASE = 0;                     // the app's frame count against hVBlankCounter (only the badges' and colon's phase depends on it)
const flip = (tile) => tile.match(/.{8}/g).map((row) => [...row].reverse().join('')).join('');
const BADGES = ['ZEPHYR', 'HIVE', 'PLAIN', 'FOG', 'MINERAL', 'STORM', 'GLACIER', 'RISING'];
// TrainerCard_JohtoBadgesOAM: where each badge's 2x2 sprite sits (screen tile column, row) and its face tile in badges.png
const BADGE_AT = [[2, 11], [6, 11], [10, 11], [14, 11], [6, 14], [2, 14], [10, 14], [14, 14]];
const FACE_TILE = [0x00, 0x04, 0x08, 0x0c, 0x10, 0x14, 0x18, 0x1c];
// The leaders: Falkner, Bugsy, Whitney, Morty on one row, Chuck, Jasmine, Pryce, Clair on the next; each face's palette (rows below the first)
const FACES = [[2, 10, 1], [6, 10, 2], [10, 10, 3], [14, 10, 4], [2, 13, 5], [6, 13, 6], [10, 13, 7], [14, 13, 1]];

export class TrainerCardScreen {
  constructor(state) {
    this.state = state;
    this.page = 0;
    this.frame = 0;
    this.colonStart = Math.floor(this.clock() / 32);
    this.cycleStart = 0;                                             // wTrainerCardBadgeFrameCounter restarts on page 2
  }

  update(input) {
    this.frame++;
    if (input.b) return true;
    if (this.page === 0) { if (input.dir === 'right' || input.a) { this.page = 1; this.cycleStart = Math.floor(this.clock() / 8); } return false; }
    if (input.a) return true;
    if (input.dir === 'left') { this.page = 0; this.colonStart = Math.floor(this.clock() / 32); }
    return false;
  }

  /** hVBlankCounter: the game's frame count, which the colon and the badges follow. */
  clock() { return (this.state.playFrames ?? 0) + PHASE; }

  /** The text's and the border's palette: the opposite gender's (Kris's slot 1 for a boy). */
  borderSlot() { return this.state.playerGender === 'FEMALE' ? 0 : 1; }

  panels() {
    const s = this.state, pal = CARD.palettes, border = this.borderSlot();
    const female = s.playerGender === 'FEMALE';
    const tiles = [], texts = [];
    const put = (x, y, tile, slot = border) => tiles.push([x, y, tile, pal[slot]]);
    // TrainerCard_InitBorder at (0,0) with 5 rows and at (0,8) with 6
    const drawBorder = (top, inner) => {
      const solid = CARD.border[0];
      for (let x = 0; x < 20; x++) { put(x, top, solid); put(x, top + inner + 3, solid); }
      put(0, top + 1, solid); put(18, top + 1, CARD.corner); put(19, top + 1, solid);
      for (let r = 0; r < inner; r++) { put(0, top + 2 + r, solid); put(19, top + 2 + r, solid); }
      put(0, top + inner + 2, solid); put(1, top + inner + 2, CARD.border[1]); put(19, top + inner + 2, solid);
    };
    drawBorder(0, 5);
    drawBorder(8, 6);
    // top half
    texts.push([2, 2, 'NAME/'], [2, 6, 'MONEY'], [7, 2, s.playerName]);
    put(2, 4, CARD.border[4]); put(3, 4, CARD.border[5]);
    texts.push([5, 4, String((s.playerId ?? 0) % 65536).padStart(5, '0')]);
    texts.push([7, 6, `¥${s.money ?? 0}`.padStart(7, ' ')]);
    for (let x = 1; x < 13; x++) put(x, 3, CARD.border[2]);
    put(13, 3, CARD.border[3]);
    // the player's picture: the player's own palette, the opposite of the border
    const picSlot = female ? 1 : 0;
    CARD.cardPics[female ? 'KRIS' : 'CHRIS'].forEach((t, i) => put(14 + (i % 5), 1 + Math.floor(i / 5), t, picSlot));
    put(18, 1, CARD.corner, female ? 0 : 1);
    const panels = [{ colors: pal[border], fill: 0, tiles, texts: [] }];
    if (this.page === 0) {
      for (let i = 0; i < 5; i++) put(2 + i, 8, CARD.status[i]);
      const dex = s.engineFlags?.has('ENGINE_POKEDEX');
      if (dex) texts.push([2, 10, 'POKéDEX'], [15, 10, String(s.dexCaught?.size ?? 0).padStart(3, ' ')]);
      texts.push([2, 12, 'PLAY TIME'], [10, 15, '  BADGES▶']);
      const frames = s.playFrames ?? 0;
      const hours = Math.min(9999, Math.floor(frames / 216000)), minutes = Math.floor(frames / 3600) % 60;
      texts.push([11, 12, String(hours).padStart(4, ' ')], [16, 12, String(minutes).padStart(2, '0')]);
      if ((Math.floor(this.clock() / 32) - this.colonStart + 1) & 1) put(15, 12, CARD.status[5]);      // the colon toggles every 32 frames (phase set to match the real game's counter in the regress run)
    } else {
      for (let i = 0; i < 5; i++) put(2 + i, 8, CARD.leaders[80 + i]);
      FACES.forEach(([x, top, slot], k) => {
        [[0, 4, 0], [1, 3, 4], [1, 3, 7]].forEach(([dx, count, offset], r) => {
          for (let c = 0; c < count; c++) put(x + dx + c, top + r, CARD.leaders[10 * k + offset + c], r === 0 ? border : slot);
        });
      });
      const cycle = (Math.floor(this.clock() / 8) - this.cycleStart) & 7;
      const sprites = [];
      BADGES.forEach((name, k) => {
        if (!s.engineFlags?.has(`ENGINE_${name}BADGE`)) return;
        let id = [FACE_TILE[k], 0x20, 0x24, 0xa0][cycle & 3];
        if (k === 7 && cycle >= 4 && (cycle & 3) === 0) id = FACE_TILE[k] | 0x80;
        const base = id & 0x7f, [x, y] = BADGE_AT[k], t = (n) => CARD.badges[n];
        const grid = id & 0x80 ? [[flip(t(base + 1)), flip(t(base))], [flip(t(base + 3)), flip(t(base + 2))]] : [[t(base), t(base + 1)], [t(base + 2), t(base + 3)]];
        grid.forEach((row, dy) => row.forEach((tile, dx) => sprites.push([x + dx, y + dy, tile, CARD.badgePalette, true])));
      });
      if (sprites.length) panels.push({ colors: CARD.badgePalette, tiles: sprites });
    }
    panels[0].texts = texts;
    return panels;
  }
}
