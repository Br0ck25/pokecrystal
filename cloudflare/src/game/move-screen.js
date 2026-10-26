// The party MOVE screen (engine/pokemon/mon_menu.asm MoveScreenLoop): the Pokémon's moves with PP, a description of the one under
// the cursor, A to pick one up and A on another to swap them (PP goes along), LEFT/RIGHT for the neighbouring Pokémon.
import { PREDEF_PALETTES, ICON_OBJ_PALETTE } from '../generated/intro.js';
import { BATTLE_EXTRA } from '../generated/party-ui.js';
import { STATS_SCREEN } from '../generated/stats-screen.js';
import { MOVES } from '../generated/moves.js';
import { directionRepeat } from './menu.js';
import { iconFrames, displayName } from './party.js';

const PLACE_FRAMES = 46;
const BLANK_FRAMES = 22;          // white while the graphics load; the tilemap then fills in over four more frames (measured)
const ICON_PHASE = 6;
const ICON_PERIOD = 9;            // frames the icon holds each of its two frames (as in the party menu, for a healthy Pokémon)
const typeName = (t) => t.replace('_TYPE', '');

export class MoveScreen {
  constructor(state, index) {
    this.state = state;
    this.party = state.party;
    this.index = index;
    this.cursor = 0;                  // wMenuCursorY - 1
    this.swapping = null;             // wSwappingMove - 1
    this.held = { lastDir: null, repeat: 0 };
    this.placing = 0;
    this.frame = 0;
  }

  get mon() { return this.party[this.index]; }
  get count() { return this.mon.moves.filter(Boolean).length; }

  update(input) {
    this.frame++;
    if (this.placing > 0) {                // two SFX_SWITCH_POKEMON (measured: the old list stays up ~46 frames)
      if (--this.placing === 0) this.swap();
      return false;
    }
    const dir = directionRepeat(this.held, input.dir ?? null);
    if (input.b) {
      if (this.swapping === null) return true;
      this.cursor = this.swapping; this.swapping = null;
      return false;
    }
    if (dir === 'down') this.cursor = (this.cursor + 1) % this.count;
    else if (dir === 'up') this.cursor = (this.cursor + this.count - 1) % this.count;
    else if ((dir === 'left' || dir === 'right') && this.swapping === null) this.neighbour(dir === 'right' ? 1 : -1);
    if (input.a) {
      if (this.swapping === null) this.swapping = this.cursor;
      else this.placing = PLACE_FRAMES;
    }
    return false;
  }

  swap() {
    const m = this.mon, a = this.swapping, b = this.cursor;
    [m.moves[a], m.moves[b]] = [m.moves[b], m.moves[a]];
    [m.pp[a], m.pp[b]] = [m.pp[b], m.pp[a]];
    this.swapping = null;
  }

  neighbour(step) {
    const i = this.index + step;
    if (i < 0 || i >= this.party.length) return;
    this.index = i; this.cursor = 0;
  }

  iconFrame() {
    return Math.floor((this.frame + ICON_PHASE) / ICON_PERIOD) & 1;
  }

  panels() {
    if (this.frame <= BLANK_FRAMES) return [{ colors: PREDEF_PALETTES.GOLDENROD, fill: 0 }];
    const mon = this.mon, colors = PREDEF_PALETTES.GOLDENROD;
    const texts = [], tiles = [];
    texts.push([5, 1, displayName(mon)]);
    tiles.push([5 + displayName(mon).length, 1, BATTLE_EXTRA[0x6e - 0x60], colors]);
    texts.push([6 + displayName(mon).length, 1, String(mon.level)]);
    if (this.index > 0) texts.push([16, 0, '◀']);
    if (this.index < this.party.length - 1) texts.push([18, 0, '▶']);
    for (let i = 0; i < 4; i++) {
      const move = mon.moves[i], y = 3 + 2 * i;
      texts.push([2, y, move ? MOVES[move].name : '-']);
      tiles.push([10, y + 1, STATS_SCREEN.tiles[0x3e - 0x31], colors], [11, y + 1, STATS_SCREEN.tiles[0x3e - 0x31], colors]);
      if (move) texts.push([13, y + 1, `${String(mon.pp[i]).padStart(2, ' ')}/${String(MOVES[move].pp).padStart(2, ' ')}`]);
      else texts.push([10, y + 1, '--']);
    }
    const sel = mon.moves[this.cursor], m = sel && MOVES[sel];
    const lower = [];
    if (this.swapping !== null) lower.push([0, 10, '┌─────┐'], [0, 11, '│'], [6, 11, '└'], [1, 12, 'Where?']);
    else if (m) {
      lower.push([0, 10, '┌─────┐'], [0, 11, '│TYPE/└'], [2, 12, typeName(m.type)], [12, 12, 'ATK/'], [16, 12, m.power >= 2 ? String(m.power).padStart(3, ' ') : '---']);
      m.desc.forEach((line, i) => lower.push([1, 14 + 2 * i, line]));
    }
    const cursors = [[1, 3 + 2 * this.cursor, '▶']];
    if (this.swapping !== null) cursors.unshift([1, 3 + 2 * this.swapping, '▷']);
    return [
      { colors, fill: 0, box: [0, 1, 19, 11], texts: [] },
      { colors, box: [0, 11, 19, 17] },
      { colors, clear: [2, 0, 3, 2], clears: [[16, 0, 3, 1], ...(this.swapping !== null ? [[1, 11, 5, 1]] : [])], texts: [...texts, ...lower, ...cursors], tiles: tiles.filter((t) => t[2]),
        sprites: [{ icon: iconFrames(mon)[this.iconFrame()], colors: ICON_OBJ_PALETTE, x: 20, y: 2 }] },
    ];
  }
}
