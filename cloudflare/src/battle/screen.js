// The battle screen: runs a Battle (battle.js) and shows what it yields, as panels for the canvas renderer.
// Layout from engine/battle/core.asm (DrawPlayerHUD, DrawEnemyHUD, BattleMenu) and trainer_huds.asm (HUD borders).
// Not ported yet: the battle transition, the sliding intro, move animations, the PKMN and PACK menus, exp bar animation.
import { HUD_TILES, BALL_TILES, BALL_PALETTE } from '../generated/battle-ui.js';
import { PREDEF_PALETTES } from '../generated/intro.js';
import { TEXT_PALETTE } from '../generated/font.js';
import { POKEMON } from '../generated/pokemon.js';
import { MOVES } from '../generated/moves.js';
import { SCRIPTS as TEXT } from '../generated/scripts/_text.js';
import { renderText } from '../script/text.js';
import { startTextWait, stepTextWait, textLines } from '../script/textwait.js';
import { directionRepeat } from '../game/menu.js';
import { PartyScreen } from '../game/party.js';
import { PackScreen } from '../game/pack.js';
import { NamingScreen } from '../game/naming.js';
import { hpPixels, hpColor, displayName } from '../game/party.js';
import { monGender } from '../script/gender.js';
import { expAtLevel } from '../script/mon.js';

const HP_BAR_TILES = 6;
// The trainer's picture, in tiles moved left after each step of SlideBattlePicOut (measured from the real game; it is gone after the sixth).
const SLIDE_SHIFTS = [1, 3, 4, 6, 7, 9];
const tile = (n) => HUD_TILES[n];
// BattleIntroSlidingPics and what follows, in frames from the first one (measured from the real game, a trainer battle): the pictures
// slide in for 73 frames as silhouettes (the enemy from the left, the player's back as sprites from the right, 2 pixels a frame), then
// the colors load, the Poké Ball rows of the HUDs appear and the text starts.
// The text rows reach the screen when the VBlank copies their third of the tilemap, every third frame (measured: frame 262 + 3n of the
// transition), whatever the printing speed in between.
const TEXT_COPY_PHASE = 1;
const INPUT_LATENCY = 3;
const ARROW_FRAMES = 18;                  // the ▼ shows this long, then hides as long (the blink loop runs at CPU speed, so it is not a round 16)
const SLIDE_FRAMES = 73, COLOR_AT = 81, BALLS_AT = 120, BORDERS_AT = 122, TEXT_AT = 121;

/** hpBarTiles for a bar of `pixels` pixels (DrawBattleHPBar): 6 tiles, then the end tile. */
function barTiles(pixels, end) {
  const out = [];
  let left = pixels;
  for (let i = 0; i < HP_BAR_TILES; i++) { const n = Math.min(8, left); left -= n; out.push(n === 8 ? 0x6a : 0x62 + n); }
  return [0x60, 0x61, ...out, 0x6b + end];
}

/** The experience bar of the player's Pokémon: 8 tiles of PlaceExpBar, 64 pixels. */
export function expBarPixels(mon) {
  const base = expAtLevel(mon.species, mon.level), next = expAtLevel(mon.species, mon.level + 1);
  const range = next - base, remaining = next - mon.exp;
  return Math.max(0, Math.min(64, 64 - Math.floor((remaining * 64) / range)));
}
export function expTiles(pixels) {
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
  constructor({ battle, pics, intro, playerName = '', state = null, trainer = false }) {
    this.battle = battle;
    this.state = state;
    this.pics = pics;
    this.gen = battle.run();
    this.frame = 0;
    this.inputs = Array.from({ length: INPUT_LATENCY }, () => ({}));
    this.t = 0;                                                        // frames since the screen appeared (the first white frame)
    this.mode = 'enter';
    this.wait = startTextWait(renderText(intro, { block: (l) => TEXT[l], vars: {}, playerName, rivalName: '' }));
    this.result = null;
    this.shown = { 0: battle.sides[0].hp, 1: battle.sides[1].hp };       // HP the digits show
    this.px = { 0: hpPixels(battle.sides[0].hp, battle.sides[0].maxHp), 1: hpPixels(battle.sides[1].hp, battle.sides[1].maxHp) };   // pixels the bars show
    this.held = { lastDir: null, repeat: 0 };
    this.cursor = 0;
    this.moveCursor = 0;
    this.unported = new Set();
    this.hpAnim = null;
    this.timer = 0;
    this.pending = null;
    this.enemyGone = false;
    this.enemyHud = false;                                             // DrawEnemyHUD has run
    this.slide = 0;                                                    // steps of the trainer's slide out of the screen
    this.trainerGone = false;
    this.trainerBattle = trainer;
    this.enemyPic = pics.enemy;                                        // the trainer's picture until its first Pokémon is sent out
    this.slideEnemy = false;                                           // which picture the slide moves
    this.enemySlide = 0;
    this.sentOut = false;                                              // the player's Pokémon replaces the trainer picture after "Go!"
  }

  /** One frame; returns the battle's result when it is over, else null. */
  update(input) {
    this.frame++;
    this.inputs.push(input);                                           // the game reads the buttons INPUT_LATENCY frames after they go down (measured)
    const result = this.step(this.inputs.shift());
    if (this.frame % 3 === TEXT_COPY_PHASE && this.wait) this.copied = { wait: this.wait, index: this.wait.index, chars: this.wait.chars };
    return result;
  }

  step(input) {
    switch (this.mode) {
      case 'enter':
        if (++this.t >= TEXT_AT) this.mode = 'intro';
        break;
      case 'intro':
        if (this.t < BORDERS_AT) this.t++;
        if (stepTextWait(this.wait, input)) this.advance();
        break;
      case 'text':
        if (stepTextWait(this.wait, input)) this.advance();
        break;
      case 'wait':
        if (--this.timer <= 0) this.advance();
        break;
      case 'slide':                                                 // SlideBattlePicOut: a step every 3 frames, 22 frames in all (measured)
        if (this.timer % 3 === 0 && this.timer / 3 < SLIDE_SHIFTS.length) this[this.slideEnemy ? 'enemySlide' : 'slide'] = SLIDE_SHIFTS[this.timer / 3];
        if (++this.timer >= 22) { if (this.slideEnemy) this.enemyGone = true; else this.trainerGone = true; this.advance(); }
        break;
      case 'hp': this.stepHp(); break;
      case 'menu': this.updateMenu(input); break;
      case 'yesno': this.updateYesNo(input); break;
      case 'party': this.updateParty(input); break;
      case 'pack': this.updatePack(input); break;
      case 'naming': { const done = this.naming.update(input); if (done) { this.mode = 'running'; this.advance(done.name); } break; }
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
      if (value.enemyHud) { this.enemyHud = true; continue; }
      if (value.slideOut) { this.slide = 0; this.slideEnemy = false; this.timer = 0; this.mode = 'slide'; return; }
      if (value.enemyTrainerOut) { this.enemySlide = 0; this.slideEnemy = true; this.timer = 0; this.mode = 'slide'; return; }
      if (value.enemySendOut) {                                        // the next Pokémon replaces the trainer's picture (or the one before it)
        const side = this.battle.sides[1];
        this.enemyPic = this.pics.enemyMons[value.species];
        this.enemyGone = false; this.enemySlide = 0;
        this.shown[1] = side.hp; this.px[1] = hpPixels(side.hp, side.maxHp);
        continue;
      }
      if (value.enemyHudClear) { this.enemyHud = false; this.ballsGone = this.frame; continue; }
      if (value.trainerSlideIn) { this.enemyPic = this.pics.enemy; this.enemyGone = false; this.enemyHud = false; this.enemySlide = 0; continue; }
      if (value.trainerWinText || value.trainerLossText) {
        const commands = value.trainerWinText ? this.battle.trainerInfo.win : this.battle.trainerInfo.loss;
        if (!commands) continue;
        this.wait = startTextWait(renderText(commands, { block: (l) => TEXT[l], vars: {}, playerName: this.state?.playerName ?? '', rivalName: '' }));
        this.mode = 'text';
        return;
      }
      if (value.anim !== undefined) { this.unported.add(`battle animation: ${value.anim}`); this.timer = value.frames ?? 20; this.mode = 'wait'; return; }
      if (value.hp !== undefined) { this.hpAnim = value; this.mode = 'hp'; return; }
      if (value.ask === 'action') { this.mode = 'menu'; this.wait = null; return; }
      if (value.sendOut !== undefined) { this.sentOut = true; this.playerSpecies = value.species; continue; }
      if (value.faint !== undefined) { if (value.faint === 0) { this.sentOut = false; this.trainerGone = true; } else this.enemyGone = true; this.timer = 40; this.mode = 'wait'; return; }
      if (value.recall !== undefined || value.hudClear !== undefined) { this.sentOut = false; this.trainerGone = true; continue; }
      if (value.ask === 'yesno') { this.yesno = 0; this.mode = 'yesno'; return; }
      if (value.ask === 'nickname') { this.naming = new NamingScreen({ mon: { species: value.species, name: POKEMON[value.species].name, gender: 'MALE' } }); this.mode = 'naming'; return; }
      if (value.ask === 'party') { this.openParty(value.forced); return; }
      if (value.exp || value.levelUp) continue;
      this.unported.add(`battle event: ${JSON.stringify(Object.keys(value))}`);
    }
  }

  /** AnimateHPBar: the bar moves one pixel every 2 frames; the digits follow. */
  stepHp() {
    const a = this.hpAnim, side = a.hp, max = this.battle.sides[side].maxHp;
    const from = hpPixels(a.from, max), to = hpPixels(a.to, max);
    if (this.px[side] === to) { this.shown[side] = a.to; this.advance(); return; }
    if (this.frame % 2) return;
    this.px[side] += to > from ? 1 : -1;
    this.shown[side] = Math.round(a.from + ((a.to - a.from) * (this.px[side] - from)) / (to - from));
  }

  openParty(forced) {
    const battle = this.battle;
    this.partyScreen = new PartyScreen({ party: battle.party, partyCursor: battle.party.indexOf(battle.sides[0].mon) + 1 }, { battle: { forced, active: battle.party.indexOf(battle.sides[0].mon) } });
    this.partyForced = forced;
    this.mode = 'party';
  }

  updateParty(input) {
    if (!this.partyScreen.update(input)) return;
    const { chosen } = this.partyScreen;
    for (const u of this.partyScreen.unported) this.unported.add(u);
    this.partyScreen = null;
    if (this.partyForced) { this.mode = 'running'; this.advance(chosen); return; }
    if (chosen === null) { this.mode = 'menu'; return; }
    this.mode = 'running';
    this.advance({ action: 'switch', index: chosen });
  }

  updatePack(input) {
    if (!this.packScreen.update(input)) return;
    const { chosen } = this.packScreen;
    for (const u of this.packScreen.unported) this.unported.add(u);
    this.packScreen = null;
    if (chosen === null) { this.mode = 'menu'; return; }
    this.mode = 'running';
    this.advance({ action: 'item', item: chosen });
  }

  updateYesNo(input) {
    const dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
    if (dir) this.yesno ^= 1;
    if (input.b) { this.yesno = 1; }
    if (input.a || input.b) { const yes = this.yesno === 0 && !input.b; this.mode = 'running'; this.advance(yes); }
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
    if (this.cursor === 1) this.openParty(false);
    else { this.packScreen = new PackScreen(this.state, { battle: true }); this.mode = 'pack'; }
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
    const level = (x, y, n) => { if (n >= 100) texts.push([x, y, String(n)]); else { put(x, y, 0x6e); texts.push([x + 1, y, String(n)]); } };    // PrintLevel: <LV>, then the digits left-aligned
    // enemy HUD (DrawEnemyHUD runs once the "appeared" text is done)
    const eh = this.enemyHud && !this.enemyGone;
    if (eh) texts.push([1, 0, enemy.name]);
    const eg = monGender(enemy.species, enemy.mon.dvs);
    if (eh) texts.push([9, 1, eg === 'MALE' ? '♂' : eg === 'FEMALE' ? '♀' : ' ']);
    if (eh) { level(eg ? 6 : 5, 1, enemy.level); put(1, 2, 0x6d); put(1, 3, 0x74); for (let x = 2; x < 10; x++) put(x, 3, 0x76); put(10, 3, 0x78); }
    if (!this.sentOut) return eh ? this.finishHud(out, colors, texts, tiles) : this.partyBalls(out, colors, tiles, texts, put);   // ShowPlayerMonsRemaining, until DrawEnemyHUD
    // player HUD
    texts.push([10, 7, player.name]);
    const pg = monGender(player.species, player.mon.dvs);
    texts.push([17, 8, pg === 'MALE' ? '♂' : pg === 'FEMALE' ? '♀' : ' ']);
    level(pg ? 14 : 13, 8, player.level);
    put(18, 10, 0x73); put(18, 11, 0x77); for (let x = 10; x < 18; x++) put(x, 11, 0x76); put(9, 11, 0x6f);
    put(18, 9, 0x73);
    const exp = expTiles(expBarPixels(player.mon));
    exp.forEach((t, i) => put(17 - i, 11, t));
    texts.push([11, 10, `${String(this.shown[0]).padStart(3, ' ')}/${String(player.maxHp).padStart(3, ' ')}`]);
    return this.finishHud(out, colors, texts, tiles);
  }

  /** DrawPlayerPartyIconHUDBorder + StageBallTilesData: one ball per party slot, 6 slots. */
  partyBalls(out, colors, tiles, texts, put) {
    const gone = this.ballsGone === undefined ? -1 : this.frame - this.ballsGone;     // ClearBox of both HUDs: the balls first, the enemy's border a frame later, the player's after that
    if (gone < 2) { put(18, 10, 0x73); put(18, 11, 0x5c); for (let x = 10; x < 18; x++) put(x, 11, 0x76); put(9, 11, 0x6f); }
    const balls = [0, 1, 2, 3, 4, 5].map((i) => { const m = this.battle.party[i]; return !m ? 3 : m.hp === 0 ? 2 : m.status ? 1 : 0; });
    const ballTiles = gone >= 0 ? [] : balls.map((b, i) => [11 + i, 10, BALL_TILES[b], BALL_PALETTE]);
    if (this.trainerBattle && !this.enemyHud) {                         // ShowOTTrainerMonsRemaining: the trainer's party, right to left from column 8
      const bordered = this.t >= BORDERS_AT || (this.mode !== 'enter' && this.mode !== 'intro');   // the enemy's border comes two frames after the balls
      if (bordered && gone < 1) { put(1, 2, 0x6d); put(1, 3, 0x74); for (let x = 2; x < 10; x++) put(x, 3, 0x76); put(10, 3, 0x78); }
      const party = this.battle.enemyParty;
      if (gone < 0) for (let i = 0; i < 6; i++) { const m = party[i]; ballTiles.push([8 - i, 2, BALL_TILES[!m ? 3 : (m === this.battle.sides[1].mon ? this.battle.sides[1].hp : m.hp) === 0 ? 2 : m.status ? 1 : 0], BALL_PALETTE]); }
    }
    out.push({ colors, tiles, texts }, { colors: BALL_PALETTE, tiles: ballTiles });
    return out;
  }

  finishHud(out, colors, texts, tiles) {
    out.push({ colors, tiles, texts });
    // HP bars in their palettes
    for (const [side, x, y, end] of [...(this.enemyHud && !this.enemyGone ? [[1, 2, 2, 0]] : []), ...(this.sentOut ? [[0, 10, 9, 1]] : [])]) {
      const pixels = this.px[side], pal = PREDEF_PALETTES[hpColor(pixels)];
      out.push({ colors: pal, tiles: barTiles(pixels, end).map((n, i) => [x + i, y, tile(n), pal]) });
    }
    return out;
  }

  /** The text as the last tilemap copy left it. */
  shownText() {
    const c = this.copied, w = this.wait;
    return c && c.wait === w && c.index === w.index ? { ...w, chars: c.chars } : w;
  }

  /** What the canvas draws, bottom first. */
  panels() {
    const [player, enemy] = this.battle.sides;
    const out = [{ fill: 0 }];
    const entering = this.t < BORDERS_AT && (this.mode === 'enter' || this.mode === 'intro');
    const k = Math.min(this.t, SLIDE_FRAMES - 1), gray = entering && this.t < COLOR_AT ? { palette: PREDEF_PALETTES.BLACKOUT } : {};
    const enemyX = entering ? 12 + this.enemyPic.offX - (144 - 2 * k) / 8 : 12 + this.enemyPic.offX + this.enemySlide;
    const playerX = entering ? (k < SLIDE_FRAMES - 1 ? 160 - 2 * (k + 1) : 16) / 8 : this.sentOut ? 2 : 2 - this.slide;
    if (!this.enemyGone) out.push({ pic: { ...this.enemyPic, ...gray, x: enemyX, y: this.enemyPic.offY } });
    if (this.sentOut || !this.trainerGone) out.push({ pic: { ...(this.sentOut ? this.pics.playerMons[this.playerSpecies] : this.pics.player), ...gray, x: playerX, y: 6 } });
    if (!entering || this.t >= BALLS_AT) out.push(...this.hudPanels());
    out.push({ box: [0, 12, 19, 17] });
    if ((this.mode === 'text' || this.mode === 'intro') && this.wait) {
      const { lines, prompt, shift } = textLines(this.shownText());
      if (prompt) this.readyAt ??= this.frame; else this.readyAt = undefined;
      out.push({ texts: [[1, 14 + shift, lines[0]], [1, 16 + shift, lines[1]]], promptNow: prompt && (this.frame - this.readyAt) % (2 * ARROW_FRAMES) < ARROW_FRAMES });
    }
    if (this.mode === 'party') return this.partyScreen.panels();
    if (this.mode === 'pack') return this.packScreen.panels();
    if (this.mode === 'naming') return this.naming.panels();
    if (this.mode === 'yesno') out.push({ box: [14, 7, 19, 11], texts: [[16, 8, 'YES'], [16, 10, 'NO']], cursor: [15, 8 + 2 * this.yesno, '▶'] });
    if (this.mode === 'menu' || this.mode === 'moves') {
      out.push({ box: [8, 12, 19, 17], texts: [[10, 14, 'FIGHT'], [16, 14, '<PK><MN>'], [10, 16, 'PACK'], [16, 16, 'RUN']],
        cursor: [this.mode === 'menu' ? 9 + 6 * (this.cursor % 2) : 9 + 6 * (this.cursor % 2), 14 + 2 * (this.cursor >> 1), this.mode === 'menu' ? '▶' : '▷'] });
    }
    if (this.mode === 'moves') {
      const cur = player.moves[this.moveCursor];
      out.push({ box: [4, 12, 19, 17], texts: [0, 1, 2, 3].map((i) => [6, 13 + i, player.moves[i] ? MOVES[player.moves[i]].name : '-']), cursor: [5, 13 + this.moveCursor, '▶'] });
      if (cur) out.push({ box: [0, 8, 10, 12], texts: [[1, 9, 'TYPE/'], [2, 10, MOVES[cur].type.replace('_TYPE', '')], [5, 11, `${player.pp[this.moveCursor]}/${MOVES[cur].pp}`]] });
    }
    return out;
  }
}
