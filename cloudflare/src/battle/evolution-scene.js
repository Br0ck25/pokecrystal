// EvolutionAnimation (engine/movie/evolution_animation.asm): the old picture, then its silhouette flashing against the new one's faster and faster,
// the new picture in its colors with balls of light flying out of it, and its animation. Frame counts are from the real game (t = frames since the
// routine started). The screen around it (the text box and its texts) is the battle screen's.
import { EVOLUTION_BUBBLES } from '../generated/battle-ui.js';
import { PREDEF_PALETTES } from '../generated/intro.js';
import { BATTLE_ANIMS } from '../generated/battle-anims.js';
import { PicAnimation } from '../game/pic-anim.js';
import { sine } from './sprite-sine.js';

const PIC_X = 7, PIC_Y = 2, SIDE = 56;                      // the 7x7 tiles at hlcoord 7, 2
const SHOWN = 33;                                           // the old picture appears (it is loaded after the screen is cleared)
const SILHOUETTE = 151;                                     // GetSGBLayout with c = TRUE: the blackout palette
const SEQUENCE = 154;                                       // AnimationSequence: wait c frames, flash b times, b = 1.., c = 14, 12 ... 2
const REPLACE_FRAMES = 4;                                   // ReplaceFrontpic ends in WaitBGMap, 4 frames
const BALLS_AT = 4;                                         // PlayEvolvedSFX comes this many frames after the new picture is in color
const BALL_CALLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 33, 35, 37, 39, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75];    // when each AnimateBallsOfLight runs (the load of the balls themselves slows it down)
const BALL_SLOTS = 10;                                      // NUM_SPRITE_ANIM_STRUCTS
const BALL_CENTER = [88, 72];                               // depixel 9, 11: the OAM coordinates (x, y) the balls move around
const BALL_SPAWN_ITERATIONS = 32;
const CANCEL_END = 8;                                       // frames from the B press to the end of the canceled evolution
const BALL_FRAMES = [[4, 3], [0, 3], [4, 3]];               // the ball's frameset: the small tile, the large one (2x2), the small one again forever; 3 calls each
const LARGE_TILE_OFFSETS = [[-8, -8], [0, -8], [-8, 0], [0, 0]];
const OBJECT_PALETTES = BATTLE_ANIMS.objectPalettes;        // PAL_BATTLE_OB_GRAY ... BROWN, in slots 2-7

/** The picture with every row reversed: the evolution screen loads its pictures right-aligned (wBoxAlignment) and they come out mirrored. */
function mirror(pic) {
  const flip = (px) => px.match(new RegExp(`.{${pic.size}}`, 'g')).map((row) => [...row].reverse().join('')).join('');
  return { ...pic, pixels: flip(pic.pixels), front: pic.front && flip(pic.front), frames: pic.frames?.map(flip), offX: 7 - pic.size / 8 - (pic.offX ?? 0) };
}

/** A picture as the 56x56 raster of the 7x7 tiles it sits in. */
function raster(pic) {
  const out = new Array(SIDE * SIDE).fill('0');
  for (let y = 0; y < pic.size; y++) for (let x = 0; x < pic.size; x++) out[(y + (pic.offY ?? 0) * 8) * SIDE + x + (pic.offX ?? 0) * 8] = pic.pixels[y * pic.size + x];
  return out;
}

export class EvolutionScene {
  /**
   * oldPic / newPic: decoded front pictures of the two species; force: the player cannot stop it; oldSlots: the object palettes 0 and 1 the battle left;
   * vblank: the game's frame counter when the routine starts (it picks the balls' colors).
   */
  constructor({ oldPic, newPic, force = false, oldSlots = [], vblank = 0 }) {
    this.pics = { old: mirror(oldPic), new: mirror(newPic) };
    this.rasters = { old: raster(this.pics.old), new: raster(this.pics.new) };
    this.force = force;
    this.vblank = vblank;
    this.oldSlots = oldSlots;
    this.t = 0;
    this.canceled = false;
    this.done = false;
    this.cancelAt = null;
    this.flashes = this.schedule();
    this.slots = new Array(BALL_SLOTS).fill(null);
    this.balls = null;                                      // { t0, calls }
    this.ballCall = 0;
    this.last = [];
    this.phase = 0;
    this.counter = 0;
    this.anim = null;
  }

  /** The times of ReplaceFrontpic calls: [t, picture shown from then], and the end of the sequence. */
  schedule() {
    const events = [];
    let t = SEQUENCE;
    this.waits = [];
    for (let b = 1, c = 14; c > 0; b++, c -= 2) {
      this.waits.push([t, t + c]);                           // WaitFrames_CheckPressedB polls B every frame of these
      t += c;
      for (let i = 0; i < b; i++) { events.push([t, 'new']); t += REPLACE_FRAMES; events.push([t, 'old']); t += REPLACE_FRAMES; }
    }
    events.push([t, 'new']);
    this.endOfSequence = t + REPLACE_FRAMES;
    return events;
  }

  /** The picture ('old' | 'new' | null) the tilemap holds at frame t. */
  shownPic(t) {
    if (t < SHOWN) return null;
    let shown = 'old';
    for (const [at, pic] of this.flashes) { if (t > at) shown = pic; else break; }
    return shown;
  }

  /** One frame; `input` has bHeld. */
  update(input = {}) {
    if (this.done) return true;
    this.t++;
    const t = this.t;
    if (this.cancelAt !== null) { if (t >= this.cancelAt + CANCEL_END) this.done = true; return this.done; }
    if (!this.force && input.bHeld && this.waits.some(([from, to]) => t > from && t <= to)) { this.canceled = true; this.cancelAt = t; return false; }
    if (t >= this.endOfSequence + BALLS_AT) this.stepBalls(t - (this.endOfSequence + BALLS_AT));
    return this.done;
  }

  /** The routine after the sequence: balls of light for 64 calls, then the new picture's animation. */
  stepBalls(n) {
    if (this.anim) { this.anim.update(); if (this.anim.done) this.done = true; return; }
    while (this.ballCall < BALL_CALLS.length && BALL_CALLS[this.ballCall] <= n) {
      this.animateBalls();
      this.ballCall++;
    }
    if (this.ballCall >= BALL_CALLS.length && n > BALL_CALLS[BALL_CALLS.length - 1]) {
      this.slots.fill(null);
      this.anim = new PicAnimation({ pic: this.pics.new, mode: 'evolve' });
    }
  }

  /** GenerateBallOfLight (two of them every second call while the counter runs) and PlaySpriteAnimations for every ball. */
  animateBalls() {
    const call = this.ballCall;
    this.last = [];
    this.phase = (((this.vblank + this.t) & 0b1110) >> 1) + 2 & 7;
    if (call < BALL_SPAWN_ITERATIONS) {
      const counter = call;
      if (counter % 2 === 0) for (const e of [0, 0x10]) this.spawn(((counter + 1) & 0b1110) * 2 + e);
    }
    for (let i = 0; i < BALL_SLOTS; i++) {
      const ball = this.slots[i];
      if (!ball) continue;
      if (ball.var1 >= 0x80) { this.slots[i] = null; this.frame(ball); this.last.push(ball); continue; }      // SpriteAnimFunc_RevealNewMon: the ball is done, but is drawn once more
      const d = ball.var1;
      ball.var1 += 8;
      ball.index ^= 0x20;
      ball.yOffset = sine(d, ball.index);
      ball.xOffset = sine(d, ball.index + 16);
      this.frame(ball);
    }
  }

  spawn(index) {
    const free = this.slots.indexOf(null);
    if (free < 0) return;
    this.slots[free] = { index, var1: 0x10, xOffset: 0, yOffset: 0, frame: -1, duration: 0 };
  }

  /** GetSpriteAnimFrame: each entry of the frameset lasts 3 calls, the last one forever. */
  frame(ball) {
    if (ball.duration > 0) { ball.duration--; return; }
    ball.frame = Math.min(ball.frame + 1, BALL_FRAMES.length - 1);
    ball.duration = BALL_FRAMES[ball.frame][1] - 1;
  }

  /** The object palette slot (0-7) as the screen has it. */
  slotColors(slot) {
    if (slot >= 2) return OBJECT_PALETTES[slot - 2];
    return this.oldSlots[slot] ?? OBJECT_PALETTES[0];
  }

  /** What the canvas draws on the top of the screen. */
  panels() {
    const out = [];
    const t = this.t;
    const shown = this.canceled && this.cancelAt !== null ? 'old' : this.shownPic(t);
    const silhouette = t >= SILHOUETTE && (this.canceled ? false : t < this.endOfSequence);
    if (this.anim && !this.anim.done) out.push({ pic: { ...this.pics.new, pixels: this.anim.pixels(this.pics.new), x: PIC_X + (this.pics.new.offX ?? 0), y: PIC_Y + (this.pics.new.offY ?? 0) } });
    else if (shown) {
      const pic = this.pics[shown];
      out.push({ pic: { ...pic, ...(silhouette ? { palette: PREDEF_PALETTES.BLACKOUT } : {}), x: PIC_X + (pic.offX ?? 0), y: PIC_Y + (pic.offY ?? 0) } });
    }
    const sprites = this.sprites(shown ? this.rasters[shown] : null);
    if (sprites.length) out.push({ sprites });
    return out;
  }

  /** The balls' sprites: each of the 8 pixel tile blocks, the large ones behind the picture's colored pixels (OAM priority). */
  sprites(back) {
    if (!this.ballCall) return [];
    const out = [];
    for (const ball of [...this.slots, ...this.last]) {
      if (!ball) continue;
      const [tile, ] = BALL_FRAMES[ball.frame];
      const large = tile === 0;
      const entries = large
        ? LARGE_TILE_OFFSETS.map(([dx, dy], i) => ({ dx, dy, digits: EVOLUTION_BUBBLES.large[i], priority: true }))
        : [{ dx: -4, dy: -4, digits: EVOLUTION_BUBBLES.small, priority: false }];
      for (const { dx, dy, digits, priority } of entries) {
        const x = ((BALL_CENTER[0] + ball.xOffset + dx) & 255) - 8, y = ((BALL_CENTER[1] + ball.yOffset + dy) & 255) - 16;
        out.push({ bitmap: { w: 8, h: 8, pixels: priority && back ? this.behind(digits, x, y, back) : digits }, colors: this.slotColors(this.phase), x, y });
      }
    }
    return out;
  }

  /** The tile's pixels with those over a colored picture pixel made see-through (OAM priority: the background shows over the object). */
  behind(digits, x, y, back) {
    let out = '';
    for (let i = 0; i < 64; i++) {
      const px = x + (i % 8) - PIC_X * 8, py = y + Math.floor(i / 8) - PIC_Y * 8;
      const hidden = px >= 0 && px < SIDE && py >= 0 && py < SIDE && back[py * SIDE + px] !== '0';
      out += hidden ? '0' : digits[i];
    }
    return out;
  }
}
