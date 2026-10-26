// The battle screen: runs a Battle (battle.js) and shows what it yields, as panels for the canvas renderer.
// Layout from engine/battle/core.asm (DrawPlayerHUD, DrawEnemyHUD, BattleMenu) and trainer_huds.asm (HUD borders).
// Not ported yet: the battle transition, the sliding intro, move animations, the PKMN and PACK menus, exp bar animation.
import { HUD_TILES } from '../generated/battle-ui.js';
import { PREDEF_PALETTES } from '../generated/intro.js';
import { TEXT_PALETTE } from '../generated/font.js';
import { POKEMON } from '../generated/pokemon.js';
import { MOVES } from '../generated/moves.js';
import { SCRIPTS as TEXT } from '../generated/scripts/_text.js';
import { renderText } from '../script/text.js';
import { startTextWait, stepTextWait, textLines } from '../script/textwait.js';
import { directionRepeat } from '../game/menu.js';
import { hpPixels, hpColor, displayName } from '../game/party.js';
import { monGender } from '../script/gender.js';
import { expAtLevel } from '../script/mon.js';

const HP_BAR_TILES = 6;
const tile = (n) => HUD_TILES[n];

/** hpBarTiles for a bar of `pixels` pixels (DrawBattleHPBar): 6 tiles, then the end tile. */
function barTiles(pixels, end) {
  const out = [];
  let left = pixels;
  for (let i = 0; i < HP_BAR_TILES; i++) { const n = Math.min(8, left); left -= n; out.push(n === 8 ? 0x6a : 0x62 + n); }
  return [0x60, 0x61, ...out, 0x6b + end];
}

/** The experience bar of the player's Pokémon: 8 tiles of PlaceExpBar, 64 pixels. */
function expBarPixels(mon) {
  const base = expAtLevel(mon.species, mon.level), next = expAtLevel(mon.species, mon.level + 1);
  const range = next - base, remaining = next - mon.exp;
  return Math.max(0, Math.min(64, 64 - Math.floor((remaining * 64) / range)));
}
function expTiles(pixels) {
  const tiles = [];
  let left = pixels;
  for (let i = 0; i < 8; i++) {
    const n = Math.min(8, left); left -= n;
    tiles.push(n === 8 ? 0x6a : n === 0 ? 0x62 : 0x54 + n);
  }
  return tiles;
}

export class BattleScreen {
  /**
   * battle: a Battle; pics: { enemy: {size, pixels, palette}, player: {size, pixels, palette} } already decoded;
   * options: { textDelay (frames per tile) }; intro: the "appeared" text commands shown first.
   */
  constructor({ battle, pics, intro, playerName = '' }) {
    this.battle = battle;
    this.pics = pics;
    this.gen = battle.run();
    this.frame = 0;
    this.mode = 'intro';
    this.wait = startTextWait(renderText(intro, { block: (l) => TEXT[l], vars: {}, playerName, rivalName: '' }));
    this.result = null;
    this.shown = { 0: battle.sides[0].hp, 1: battle.sides[1].hp };       // HP the bars show
    this.held = { lastDir: null, repeat: 0 };
    this.cursor = 0;
    this.moveCursor = 0;
    this.unported = new Set();
    this.hpAnim = null;
    this.timer = 0;
    this.pending = null;
  }

  /** One frame; returns the battle's result when it is over, else null. */
  update(input) {
    this.frame++;
    switch (this.mode) {
      case 'intro':
        if (stepTextWait(this.wait, input)) this.advance();
        break;
      case 'text':
        if (stepTextWait(this.wait, input)) this.advance();
        break;
      case 'wait':
        if (--this.timer <= 0) this.advance();
        break;
      case 'hp': this.stepHp(); break;
      case 'menu': this.updateMenu(input); break;
      case 'moves': this.updateMoves(input); break;
      default: break;
    }
    return this.result;
  }

  /** Resume the battle until it yields something that takes time. */
  advance(answer) {
    for (;;) {
      const { value, done } = this.gen.next(answer);
      answer = undefined;
      if (done) { this.result = value; this.mode = 'done'; return; }
      if (value.text) { this.wait = startTextWait(renderText(value.text, { block: (l) => TEXT[l], vars: {}, playerName: '', rivalName: '' })); this.mode = 'text'; return; }
      if (value.wait) { this.timer = value.wait; this.mode = 'wait'; return; }
      if (value.anim !== undefined) { this.unported.add(`battle animation: ${value.anim}`); this.timer = 20; this.mode = 'wait'; return; }
      if (value.hp !== undefined) { this.hpAnim = value; this.mode = 'hp'; return; }
      if (value.ask === 'action') { this.mode = 'menu'; this.wait = null; return; }
      if (value.exp || value.levelUp) continue;
      this.unported.add(`battle event: ${JSON.stringify(Object.keys(value))}`);
    }
  }

  stepHp() {
    const a = this.hpAnim, side = a.side ?? a.hp;
    const max = this.battle.sides[side].maxHp;
    const target = hpPixels(a.to, max);
    const now = hpPixels(this.shown[side], max);
    if (now === target) { this.shown[side] = a.to; this.advance(); return; }
    this.shown[side] += now < target ? 1 : -1;
  }

  updateMenu(input) {
    const dir = directionRepeat(this.held, input.dir);
    if (dir === 'left' && this.cursor % 2 === 1) this.cursor--;
    else if (dir === 'right' && this.cursor % 2 === 0) this.cursor++;
    else if (dir === 'up' && this.cursor >= 2) this.cursor -= 2;
    else if (dir === 'down' && this.cursor < 2) this.cursor += 2;
    if (!input.a) return;
    if (this.cursor === 0) { this.mode = 'moves'; this.moveCursor = this.battle.sides[0].curMoveNum ?? 0; return; }
    if (this.cursor === 3) { this.mode = 'running'; this.advance({ action: 'run' }); return; }
    this.unported.add(this.cursor === 1 ? 'battle: PKMN' : 'battle: PACK');
  }

  updateMoves(input) {
    const side = this.battle.sides[0], count = side.moves.filter(Boolean).length;
    const dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
    if (dir === 'up') this.moveCursor = (this.moveCursor + count - 1) % count;
    if (dir === 'down') this.moveCursor = (this.moveCursor + 1) % count;
    if (input.b) { this.mode = 'menu'; return; }
    if (input.a) { this.mode = 'running'; this.advance({ action: 'fight', slot: this.moveCursor }); }
  }

  // ---- drawing ------------------------------------------------------------------------------------------------
  hudPanels() {
    const [player, enemy] = this.battle.sides;
    const out = [];
    const colors = TEXT_PALETTE;
    const texts = [];
    const tiles = [];
    const put = (x, y, n) => tiles.push([x, y, tile(n), colors]);
    // enemy HUD
    texts.push([1, 0, enemy.name]);
    const eg = monGender(enemy.species, enemy.mon.dvs);
    texts.push([9, 1, eg === 'MALE' ? '♂' : eg === 'FEMALE' ? '♀' : ' ']);
    texts.push([eg ? 6 : 5, 1, enemy.level >= 100 ? String(enemy.level) : `:L${enemy.level}`]);
    put(1, 2, 0x6d); put(1, 3, 0x74); for (let x = 2; x < 10; x++) put(x, 3, 0x76); put(10, 3, 0x78);
    // player HUD
    texts.push([10, 7, player.name]);
    const pg = monGender(player.species, player.mon.dvs);
    texts.push([17, 8, pg === 'MALE' ? '♂' : pg === 'FEMALE' ? '♀' : ' ']);
    texts.push([pg ? 14 : 13, 8, player.level >= 100 ? String(player.level) : `:L${player.level}`]);
    put(18, 10, 0x73); put(18, 11, 0x77); for (let x = 10; x < 18; x++) put(x, 11, 0x76); put(9, 11, 0x6f);
    put(18, 9, 0x73);
    const exp = expTiles(expBarPixels(player.mon));
    exp.forEach((t, i) => put(17 - i, 11, t));
    texts.push([11, 10, `${String(this.shown[0]).padStart(3, ' ')}/${String(player.maxHp).padStart(3, ' ')}`]);
    out.push({ colors, tiles, texts });
    // HP bars in their palettes
    for (const [side, x, y, end] of [[1, 2, 2, 0], [0, 10, 9, 1]]) {
      const mon = this.battle.sides[side], pixels = hpPixels(this.shown[side], mon.maxHp), pal = PREDEF_PALETTES[hpColor(pixels)];
      out.push({ colors: pal, tiles: barTiles(pixels, end).map((n, i) => [x + i, y, tile(n), pal]) });
    }
    return out;
  }

  /** What the canvas draws, bottom first. */
  panels() {
    const [player, enemy] = this.battle.sides;
    const out = [{ fill: 0 }];
    out.push({ pic: { ...this.pics.enemy, x: 12 + this.pics.enemy.offX, y: this.pics.enemy.offY } });   // PadFrontpic: smaller pictures sit at the bottom
    out.push({ pic: { ...this.pics.player, x: 2, y: 6 } });
    out.push(...this.hudPanels());
    out.push({ box: [0, 12, 19, 17] });
    if ((this.mode === 'text' || this.mode === 'intro') && this.wait) {
      const { lines, prompt } = textLines(this.wait);
      out.push({ texts: [[1, 14, lines[0]], [1, 16, lines[1]]], prompt });
    }
    if (this.mode === 'menu' || this.mode === 'moves') {
      out.push({ box: [8, 12, 19, 17], texts: [[10, 14, 'FIGHT'], [16, 14, '<PK><MN>'], [10, 16, 'PACK'], [16, 16, 'RUN']],
        cursor: [this.mode === 'menu' ? 9 + 6 * (this.cursor % 2) : 9 + 6 * (this.cursor % 2), 14 + 2 * (this.cursor >> 1), this.mode === 'menu' ? '▶' : '▷'] });
    }
    if (this.mode === 'moves') {
      const moves = player.moves.map((m, i) => (m ? [5, 12 + 2 * i, MOVES[m].name] : [5, 12 + 2 * i, '-']));
      const cur = player.moves[this.moveCursor];
      out.push({ box: [4, 12, 19, 17], texts: [...moves.map(([x, y, t]) => [x + 1, y + 1, t]).slice(0, 4)], cursor: [5, 13 + 2 * this.moveCursor, '▶'] });
      if (cur) out.push({ box: [0, 8, 10, 11], texts: [[1, 9, 'TYPE/'], [2, 10, MOVES[cur].type.replace('_TYPE', '')], [5, 11, `${player.pp[this.moveCursor]}/${MOVES[cur].pp}`]] });
    }
    return out;
  }
}
