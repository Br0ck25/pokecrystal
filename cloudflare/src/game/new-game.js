// NEW GAME: the boy-or-girl screen, Prof. Oak's speech and the player's name, then the room (engine/menus/intro_menu.asm
// NewGame, OakSpeech, NamePlayer and engine/menus/init_gender.asm). Frame-stepped like Game; update(input) returns
// null, or { state } when the introduction is over.
// Not ported: setting the clock (the device's time is used instead), music and the Wooper cry.
import { renderText } from '../script/text.js';
import { startTextWait, stepTextWait, textLines } from '../script/textwait.js';
import { SCRIPTS as sharedText } from '../generated/scripts/_text.js';
import { GENDER_SCREEN, PLAYER_NAMES, SHRINK, PREDEF_PALETTES } from '../generated/intro.js';
import { createScriptState } from '../script/interpreter.js';
import { directionRepeat } from './menu.js';
import { NamingScreen } from './naming.js';

const DIPLOMA = PREDEF_PALETTES.DIPLOMA;
// home/fade.asm: BGP shade tables, color index -> shade, 8 frames a step.
const FADE_TO_BLACK = [[0, 1, 2, 3], [1, 2, 3, 3], [2, 3, 3, 3], [3, 3, 3, 3]];              // RotateFourPalettesLeft
const FADE_FROM_BLACK = [[3, 3, 3, 3], [2, 3, 3, 3], [1, 2, 3, 3], [0, 1, 2, 3]];            // RotateFourPalettesRight
const FADE_TO_WHITE = [[0, 0, 1, 2], [0, 0, 0, 1], [0, 0, 0, 0]];                            // RotateThreePalettesRight
const FADE_FROM_WHITE = [[0, 0, 0, 1], [0, 0, 1, 2], [0, 1, 2, 3]];                          // RotateThreePalettesLeft
const PIC_FADE_IN = [[0, 1, 1, 1], [0, 2, 2, 2], [0, 3, 3, 3], [0, 2, 3, 3], [0, 1, 3, 3], [0, 1, 2, 3]];   // IntroFadePalettes

export class NewGame {
  constructor({ playerId = Math.floor(Math.random() * 0x10000) } = {}) {
    this.kind = 'panels';
    this.frame = 0;
    this.playerId = playerId;
    this.gender = 'MALE';
    this.name = '';
    this.bgp = null;                       // color index -> shade remap while the screen fades
    this.view = { bg: 'white', pic: null, text: null, menu: null, naming: null, sprite: null };
    this.flow = this.run();
    this.wait = null;
    this.result = null;
    this.held = { lastDir: null, repeat: 0 };
  }

  update(input = {}) {
    this.frame++;
    for (let guard = 0; guard < 100; guard++) {
      if (!this.wait) {
        const next = this.flow.next();
        if (next.done) return { state: this.finalState() };
        this.wait = next.value;
      }
      if (this.step(this.wait, input)) { this.wait = null; input = {}; } else return null;
    }
    return null;
  }

  /** One frame of the current wait; true when it is over (the flow then continues in the same frame). */
  step(wait, input) {
    if (wait.frames !== undefined) return --wait.frames < 0;
    if (wait.text) {
      if (this.view.text?.screens !== wait.text) this.view.text = startTextWait(wait.text);
      return stepTextWait(this.view.text, input);
    }
    if (wait.menu) {
      const m = wait.menu;
      const dir = directionRepeat(this.held, input.dir === 'up' || input.dir === 'down' ? input.dir : null);
      if (dir) m.cursor = (m.cursor + (dir === 'up' ? -1 : 1) + m.items.length) % m.items.length;
      return Boolean(input.a);
    }
    if (wait.naming) {
      const done = this.view.naming.update(input);
      if (done) { this.result = done.name; return true; }
      return false;
    }
    throw new Error('unknown wait');
  }

  say(label) {
    return renderText([['text_far', label]], { block: (l) => sharedText[l], vars: {}, playerName: this.name || 'CHRIS', rivalName: '???' });
  }

  *fade(steps, frames = 8) {
    for (const step of steps) { this.bgp = step; yield { frames }; }
  }

  *run() {
    const v = this.view;
    // --- the boy-or-girl screen (InitGender) ---
    v.bg = 'gender';
    yield { frames: 8 };
    yield { text: this.say('_AreYouABoyOrAreYouAGirlText') };
    v.menu = { box: [6, 4, 12, 9], items: ['Boy', 'Girl'], cursor: 0 };
    yield { menu: v.menu };
    this.gender = v.menu.cursor === 0 ? 'MALE' : 'FEMALE';
    v.menu = null;
    yield { frames: 10 };
    // --- OakSpeech (InitClock is skipped) ---
    yield* this.fade(FADE_TO_BLACK);
    v.bg = 'white'; v.text = null;
    yield* this.fade(FADE_FROM_BLACK);
    yield* this.fade(FADE_TO_WHITE);
    this.bgp = null;
    yield* this.oakPic('POKEMON_PROF', '_OakText1');
    yield* this.fade(FADE_TO_WHITE);
    this.clear();
    // Wooper wipes in from the right
    v.pic = { species: 'WOOPER', clipX: 112 };
    this.bgp = null;
    for (let x = 112; x >= 0; x -= 8) { v.pic.clipX = x; yield { frames: 0 }; }
    v.pic.clipX = 0;
    const wooper = this.say('_OakText2');
    wooper[wooper.length - 1].wait = 'prompt';                       // the cry, then PromptButton (_OakText3)
    yield { text: wooper };
    yield { text: this.say('_OakText4') };
    yield* this.fade(FADE_TO_WHITE);
    this.clear();
    yield* this.oakPic('POKEMON_PROF', '_OakText5');
    yield* this.fade(FADE_TO_WHITE);
    this.clear();
    // the player's picture, then the name
    v.pic = { trainer: this.gender === 'FEMALE' ? 'KRIS' : 'CHRIS', x: 6 };
    yield* this.fade(PIC_FADE_IN, 10);
    this.bgp = null;
    yield { text: this.say('_OakText6') };
    yield* this.namePlayer();
    this.bgp = null;
    yield { text: this.say('_OakText7') };
    yield* this.shrink();
  }

  clear() { Object.assign(this.view, { pic: null, text: null, bg: 'white' }); }

  /** Intro_PrepTrainerPic and Intro_RotatePalettesLeftFrontpic, then the text. */
  *oakPic(trainer, label) {
    this.view.pic = { trainer, x: 6 };
    yield* this.fade(PIC_FADE_IN, 10);
    this.bgp = null;
    yield { text: this.say(label) };
  }

  *namePlayer() {
    const v = this.view;
    for (let x = 6; x <= 13; x++) { v.pic.x = x; yield { frames: 1 }; }       // MovePlayerPicRight
    const names = PLAYER_NAMES[this.gender === 'FEMALE' ? 'female' : 'male'];
    v.menu = { box: [0, 0, 10, 11], items: ['NEW NAME', ...names], cursor: 0, title: [2, ' NAME '] };
    yield { menu: v.menu };
    const choice = v.menu.cursor;
    v.menu = null;
    if (choice > 0) {
      this.name = names[choice - 1];
      for (let x = 13; x >= 6; x--) { v.pic.x = x; yield { frames: 1 }; }     // MovePlayerPicLeft
      return;
    }
    v.naming = new NamingScreen({ gender: this.gender });
    v.text = null;
    const savedPic = v.pic;
    v.pic = null;
    yield { naming: true };
    v.naming = null;
    this.name = this.result || names[0];                                       // InitName: an empty name becomes CHRIS or KRIS
    v.pic = savedPic; v.pic.x = 6;
    yield* this.fade(FADE_TO_WHITE);
    yield* this.fade(FADE_FROM_WHITE);
    this.bgp = null;
  }

  /** ShrinkPlayer: the picture shrinks to the overworld sprite (two frames 8 frames apart), 50 frames, fade out. */
  *shrink() {
    const v = this.view;
    yield { frames: 8 };
    v.pic = { shrink: 0, x: 6 }; v.text = null;
    yield { frames: 8 };
    v.pic = { shrink: 1, x: 6 };
    yield { frames: 8 };
    v.pic = null;
    yield { frames: 3 };
    v.sprite = true;
    yield { frames: 50 };
    yield* this.fade(FADE_TO_WHITE);
    v.sprite = null;
  }

  finalState() {
    return createScriptState({ playerName: this.name, playerGender: this.gender, playerId: this.playerId });
  }

  /** Panels for the renderer (render/canvas.js drawPanels), bottom first. */
  panels() {
    const v = this.view;
    if (v.naming) return v.naming.panels();
    const out = [];
    const colors = v.bg === 'gender' ? GENDER_SCREEN.palette : DIPLOMA;
    out.push({ fill: v.bg === 'gender' ? Number(GENDER_SCREEN.pixels[0]) : 0, colors });      // the blue tile fills the gender screen
    if (v.pic) out.push({ colors: DIPLOMA, pic: this.picSpec(v.pic) });
    if (v.sprite) out.push({ colors: DIPLOMA, sprites: [{ sprite: this.gender === 'FEMALE' ? 'SPRITE_KRIS' : 'SPRITE_CHRIS', palette: this.gender === 'FEMALE' ? 'BLUE' : 'RED', row: 0, x: 64, y: 60 }] });
    if (v.text) {
      const { lines, prompt } = textLines(v.text);
      out.push({ colors, box: [0, 12, 19, 17], texts: [[1, 14, lines[0]], [1, 16, lines[1]]], prompt });
    }
    if (v.menu) {
      const m = v.menu;
      const [l, t] = m.box;
      out.push({ colors, box: m.box, texts: [...m.items.map((item, i) => [l + 2, t + 2 + 2 * i, item]), ...(m.title ? [[l + m.title[0], t, m.title[1]]] : [])], cursor: [l + 1, t + 2 + 2 * m.cursor, '▶'] });
    }
    return out;
  }

  picSpec(pic) {
    if (pic.species) return { species: pic.species, x: 6, y: 4, clipX: pic.clipX };
    if (pic.trainer) return { trainer: pic.trainer, x: pic.x, y: 4 };
    return { trainer: this.gender === 'FEMALE' ? 'KRIS' : 'CHRIS', pixels: SHRINK[pic.shrink], x: pic.x, y: 4 };
  }
}
