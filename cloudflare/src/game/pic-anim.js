// A Pokémon's front picture animating (engine/gfx/pic_animation.asm). The script is a list of commands from gfx/pokemon/<mon>/anim.asm:
//   [n, duration]   show animation frame n (0 = the base picture) for duration calls (scaled by the speed)
//   ['setrepeat', n] / ['dorepeat', command index] / ['end']
// AnimateFrontpic runs one "call" of the setup script per loop, a frame each. Placing an animation frame that replaces many tiles takes
// the CPU past the VBlank, so that call takes two frames (measured against PIDGEY: a flap of 14 calls takes 17 frames, the 1-tile frame 3
// takes none extra); so does the Setup scene.
const HEAVY_TILES = 4;
const SETUP_FRAMES = 3;
const WAIT_CALLS = 18;                                  // PokeAnim_SetWait

// pokeanim lists: the scenes of each ANIM_MON_* in order (the final Finish is implied)
export const POKE_ANIMS = {
  slow: ['StereoCry', 'Setup2', 'Play'],
  normal: ['StereoCry', 'Setup', 'Play'],
  menu: ['CryNoWait', 'Setup', 'Play', 'SetWait', 'Wait', 'Idle', 'Play'],
  evolve: ['Idle', 'Play', 'SetWait', 'Wait', 'CryNoWait', 'Setup', 'Play'],
  hatch: ['Idle', 'Play', 'CryNoWait', 'Setup', 'Play', 'SetWait', 'Wait', 'Idle', 'Play'],
  hof: ['CryNoWait', 'Setup', 'Play', 'SetWait', 'Wait', 'Idle', 'Play'],
};

/** How many 8x8 tiles of animation frame n + 1 differ from the base picture (the bits of the bitmask the real game applies). */
function tilesDiffering(pic, n) {
  const size = pic.size, frame = pic.frames[n];
  let count = 0;
  for (let ty = 0; ty < size / 8; ty++) {
    for (let tx = 0; tx < size / 8; tx++) {
      let differs = false;
      for (let y = 0; y < 8 && !differs; y++) for (let x = 0; x < 8; x++) { const i = (ty * 8 + y) * size + tx * 8 + x; if (frame[i] !== pic.front[i]) { differs = true; break; } }
      if (differs) count++;
    }
  }
  return count;
}

/** PokeAnim_GetDuration: a * (1 + speed / 16). */
const duration = (d, speed) => d + ((d * speed) >> 4);

export class PicAnimation {
  /** pic: { anim, idle } script lists; mode: a POKE_ANIMS key; cry(kind) is told when a scene starts the cry. */
  constructor({ pic, mode = 'normal', cry = () => {} }) {
    this.pic = pic;
    this.scenes = [...POKE_ANIMS[mode], 'Finish'];
    this.cry = cry;
    this.scene = 0;
    this.script = pic.anim;
    this.speed = 0;
    this.frame = 0;                                     // the animation frame being shown
    this.pc = 0; this.repeat = 0; this.counter = 0; this.waiting = false; this.wait = 0;
    this.done = false;
    this.busy = 0;                                      // frames the current call still takes
    this.heavy = [0, ...pic.frames.map((_, i) => tilesDiffering(pic, i))];
  }

  /** One game frame: runs as many calls as are due. */
  update() {
    if (this.done) return;
    if (this.busy > 0) { this.busy--; return; }
    this.call();
  }

  next() { this.scene++; }

  /** SetUpPokeAnim: one call of the current scene. */
  call() {
    switch (this.scenes[this.scene]) {
      case 'StereoCry': this.cry('stereo'); this.next(); break;
      case 'CryNoWait': this.cry('nowait'); this.next(); break;
      case 'Setup': this.start(this.pic.anim, 0); this.busy = SETUP_FRAMES - 1; break;
      case 'Setup2': this.start(this.pic.anim, 4); this.busy = SETUP_FRAMES - 1; break;
      case 'Idle': this.start(this.pic.idle, 0); break;
      case 'SetWait': this.wait = WAIT_CALLS; this.next(); this.call(); break;
      case 'Wait': if (--this.wait === 0) this.next(); break;
      case 'Play':
        this.play();
        if (this.ended) { this.frame = 0; this.next(); }
        break;
      case 'Finish': this.frame = 0; this.done = true; break;
      default: throw new Error(`pic animation scene ${this.scenes[this.scene]}`);
    }
  }

  start(script, speed) { this.script = script; this.speed = speed; this.pc = 0; this.repeat = 0; this.waiting = false; this.ended = false; this.next(); }

  /** PokeAnim_DoAnimScript for one call. */
  play() {
    if (this.waiting) { this.counter--; if (this.counter === 0) this.waiting = false; return; }
    for (;;) {
      const [command, parameter] = this.script[this.pc++];
      if (command === 'end') { this.ended = true; return; }
      if (command === 'setrepeat') { this.repeat = parameter; continue; }
      if (command === 'dorepeat') {
        if (this.repeat === 0) return;
        if (--this.repeat === 0) return;
        this.pc = parameter;
        continue;
      }
      this.frame = command;
      if (this.heavy[command] >= HEAVY_TILES) this.busy = 1;
      this.counter = duration(parameter, this.speed);
      if (--this.counter !== 0) this.waiting = true;
      return;
    }
  }

  /** Palette-index pixels of the picture to draw: the base, or animation frame n (frames[n - 1]). */
  pixels(pic = this.pic) { return this.frame === 0 ? pic.front : pic.frames[this.frame - 1]; }
}
