// The battle transition (engine/battle/battle_transition.asm DoBattleTransition): the screen flashes (a different outro depending on the
// cave and on the lead's level), a Poké Ball overlay for trainers, then black. One call of the jumptable is one frame, so this is a
// generator that yields once per frame and leaves what the screen shows in `view`:
//   bgp    four shades (color index -> shade), applied to the background only; null = untouched
//   pal7   every background tile uses the trainer-battle palette (trainers only)
//   cells  20x18 tiles the transition wrote over the map: 0 = map, 1 = BATTLETRANSITION_SQUARE, 2 = BATTLETRANSITION_BLACK
//   scx    per-scanline background scroll (the wavy outro), or null
//   sprites 'all' | 'fighters' (RespawnPlayerAndOpponent: only the player and the opponent) | 'none'
//   black  the whole screen is black
// The frame numbers are measured from the real game (first change 24 frames after BattleIntro starts, flash from frame 28 ...).
import { BATTLE_TRANSITION as T } from '../generated/battle-transition.js';

const WIDTH = 20, HEIGHT = 18;
const SQUARE = 1, BLACK = 2;
const IDLE_FRAMES = 23, WILD_IDLE_FRAMES = 22;     // before StartTrainerBattle_DetermineWhichAnimation runs (a frame less for a wild Pokémon: measured)
const BALL_FRAMES = 3;                   // LoadPokeBallGraphics: palette load, tilemap copy, jumptable delay
const FLASH_STAGES = 3;
const SPIN_STEP_FRAMES = 3;              // two DelayFrames and the loop's own
const SCATTER_TILES_PER_FRAME = 12, SCATTER_FRAMES = 0x10;
const SINE_END = 0x60;
const BLACK_GAP = 92;                    // black until the battle's own graphics are up (measured, trainer battle)

/** Which of the four outros: cave or not, and "stronger" when the lead is three or more levels under the opponent's last-seen level. */
export function transitionKind({ environment, leadLevel, enemyLevel }) {
  const cave = environment === 'CAVE' || environment === 'ENVIRONMENT_5' || environment === 'DUNGEON';
  const stronger = leadLevel + 3 < enemyLevel;                                 // the ROM compares with wEnemyMonLevel, which is stale here (a known bug)
  return { cave, stronger };
}

/** calc_sine_wave: d * sin(a * pi / 32) with a a 6-bit signed phase. */
export function sineWave(phase, amplitude) {
  const a = phase & 63;
  const value = (amplitude * T.sine[a & 31]) >> 8;
  return a < 32 ? value : -value;
}

export class BattleTransition {
  constructor({ trainer, cave, stronger, random }) {
    Object.assign(this, { trainer, cave, stronger, random });
    this.view = { bgp: null, pal7: false, cells: new Uint8Array(WIDTH * HEIGHT), scx: null, sprites: 'all', black: false };
    this.frames = this.run();
  }

  /** One frame; true once the black gap has passed and the battle can show. */
  update() { return this.frames.next().done; }

  * wait(n) { for (let i = 0; i < n; i++) yield; }

  * run() {
    const v = this.view;
    yield* this.wait(this.trainer ? IDLE_FRAMES : WILD_IDLE_FRAMES);
    yield;                                                                     // DetermineWhichAnimation
    if (this.trainer) {
      v.pal7 = true;
      T.ball.forEach((row, y) => [...row].forEach((bit, x) => { if (bit === 'X') v.cells[(1 + y) * WIDTH + 2 + x] = SQUARE; }));
      yield* this.wait(BALL_FRAMES);
    } else yield;
    yield;                                                                     // SetUpBGMap
    for (let stage = 0; stage < FLASH_STAGES; stage++) {
      for (let counter = 0; counter <= 2 * (T.flash.length - 1); counter++) {
        if (counter >> 1 < T.flash.length - 1) v.bgp = T.flash[counter >> 1];
        yield;
      }
    }
    v.bgp = null;
    yield;                                                                     // NextScene
    if (this.cave && this.stronger) yield* this.zoom();
    else if (this.cave) yield* this.wavy();
    else if (this.stronger) yield* this.speckle();
    else yield* this.spin();
    v.sprites = 'none';                                                        // StartTrainerBattle_Finish: ClearSprites
    yield;
    v.black = true;
    yield* this.wait(BLACK_GAP);
  }

  respawn() { this.view.sprites = 'fighters'; }

  * spin() {
    const v = this.view;
    this.respawn();
    yield;
    for (const q of T.spin) {
      const right = q.quadrant & 1, lower = q.quadrant >> 1;
      const data = T.wedges[q.wedge];
      let at = q.y * WIDTH + q.x, i = 0;
      for (;;) {
        const start = at;
        for (let n = data[i++]; n > 0; n--) { if (at >= 0 && at < v.cells.length) v.cells[at] = BLACK; at += right ? 1 : -1; }
        at = start + (lower ? -WIDTH : WIDTH);
        if (data[i] === -1) break;
        const shift = data[i++];
        if (shift) at += right ? -shift : shift;
      }
      yield* this.wait(SPIN_STEP_FRAMES);
    }
    yield* this.wait(4);                                                       // the end call: three DelayFrames and the loop's
  }

  * speckle() {
    const v = this.view;
    this.respawn();
    yield;
    for (let call = 0; call < SCATTER_FRAMES; call++) {
      for (let n = 0; n < SCATTER_TILES_PER_FRAME; n++) {
        for (;;) {
          let y, x;
          do y = this.random(); while (y >= HEIGHT);
          do x = this.random(); while (x >= WIDTH);
          if (v.cells[y * WIDTH + x] === BLACK) continue;                      // already blacked out: sample again
          v.cells[y * WIDTH + x] = BLACK;
          break;
        }
      }
      yield;
    }
    yield* this.wait(4);
  }

  * wavy() {
    const v = this.view;
    this.respawn();
    yield;
    let counter = 0, offset = 0;
    while (counter < SINE_END) {
      const amplitude = counter;
      counter += offset++;
      v.scx = Array.from({ length: 144 }, (_, line) => sineWave(2 * line, amplitude));
      yield;
    }
    v.scx = null;
    yield;                                                                     // the call that ends it
  }

  * zoom() {
    const v = this.view;
    this.respawn();
    for (const box of T.zoom) {
      for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) v.cells[(box.y + y) * WIDTH + box.x + x] = BLACK;
      yield* this.wait(4);                                                     // WaitBGMap
    }
    yield;
  }
}
