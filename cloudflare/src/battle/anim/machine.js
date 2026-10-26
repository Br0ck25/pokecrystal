// The battle animation engine, run as the game's own code: the SM83 image built by tools/battle-anim-data.mjs (engine/battle_anims/*.asm and every
// move's script) executes on an interpreter over a small Game Boy memory, with native stand-ins for the routines that live elsewhere (drawing,
// sound, palettes, VRAM transfers) and for the VBlank handler. One call of step() is one displayed frame: the engine runs until it waits for the
// next one (BattleAnimDelayFrame / DelayFrame), then VBlank happens and updates what is shown (BG map in thirds, palettes, OAM, scroll registers),
// the way the hardware does; code that takes longer than a frame, and the routines that wait for several, cost the frames they cost in the game.
import { BATTLE_ANIMS as D } from '../../generated/battle-anims.js';
import { SFX_FRAMES } from '../../generated/sfx.js';
import { Cpu } from './sm83.js';

const EXIT = 0xfff0;                       // where the animation's final `ret` lands
const IO = 0xff00;
const FRAME_CYCLES = 17556;                // M-cycles in a frame
const VBLANK_LINES = 10;                   // lines 144-153 of the 154 each frame have; the visible ones follow
const LINE_CYCLES = 114;
// What VBlank_CutsceneCGB takes (M-cycles, counted from home/video.asm and home/palettes.asm; the base is the sound engine and the handler's own code)
export const TIMING = {
  isr: { base: 2900, bgMap: 630, serveSetup: 40, serveTile: 17, oamDma: 170, palettes: 550 },
  lcdInterrupt: 52,                        // the STAT handler that writes a line's scroll value (hLCDCPointer set), once per visible line
  sfxStart: 0,                             // PlayStereoSFX loads every channel of the effect
  perFrame: 0,                             // the engine's loop code outside the assembled part (BattleAnimDelayFrame's own, the call)
};
const TILES_PER_CYCLE = 8;                 // Request2bpp copies this many tiles a frame
// M-cycles the stand-in routines take in the game (counted from their code in home/; the last three were calibrated against the game's frames)
export const COST = { GetBattleAnimByte: 145, ClearBoxCell: 6, ClearBoxRow: 24, CopyPal: 250, DmgToCgb: 2100, PushLYOverrides: 40, FarCopyByte: 10, UpdateBattleHuds: 12000, DecompressByte: 44 };
const R = D.ram;
const SYM = D.symbols;
const addr = (name) => R[name] ?? SYM[name] ?? D.externals[name] ?? D.constants[name];
const external = (name) => D.externals[name];
const SFX_NAMES = Object.fromEntries(Object.entries(D.constants).filter(([k]) => k.startsWith('SFX_')).map(([k, v]) => [v, k]));

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class AnimMachine {
  constructor({ random = () => Math.floor(Math.random() * 256) } = {}) {
    this.random = random;
    this.mem = new Uint8Array(0x10000);
    this.wramx = Array.from({ length: 8 }, () => new Uint8Array(0x1000));
    this.mem.set(decode(D.rom.data), D.rom.base);
    this.sounds = [];                       // [{ id, frame }] the engine asked for (animation sound effects)
    this.badFrames = [];                    // the frames BattleAnimDelayFrame was called at (to compare timing with the game's)
    this.frame = 0;                         // frames shown so far
    this.extra = 0;                         // cycles the native routines took since the last frame
    this.block = 0;                         // frames to pass before the engine runs again (a routine that waits for several)
    this.t = 0;                             // cycles into the current frame (from the start of VBlank) the engine resumes at
    this.sfxEnd = 0;                        // the frame the last sound effect started so far ends (WaitSFX)
    this.unhooked = new Set();
    const bus = { read: (a) => this.read(a), write: (a, v) => this.write(a, v) };
    this.cpu = new Cpu(bus);
    this.shown = null;
    this.installHooks();
  }

  // ---- memory ----

  get bank() { return (this.mem[0xff70] & 7) || 1; }
  read(a) { return a >= 0xd000 && a < 0xe000 ? this.wramx[this.bank][a - 0xd000] : this.mem[a]; }
  write(a, v) { if (a >= 0xd000 && a < 0xe000) this.wramx[this.bank][a - 0xd000] = v; else if (a >= 0x8000) this.mem[a] = v; }
  r8(name) { return this.read(addr(name)); }
  w8(name, v) { this.write(addr(name), v); }
  r16(name) { const a = addr(name); return this.read(a) | (this.read(a + 1) << 8); }
  w16(name, v) { const a = addr(name); this.write(a, v & 0xff); this.write(a + 1, v >> 8); }
  /** Run fn with WRAM bank 5 (where the animation engine's variables and the palette buffers live) switched in. */
  withBank5(fn) { const old = this.mem[0xff70]; this.mem[0xff70] = 5; try { return fn(); } finally { this.mem[0xff70] = old; } }
  copy(dest, source, n) { for (let i = 0; i < n; i++) this.write(dest + i, this.read(source + i)); }

  // ---- running an animation ----

  /** Start the engine at PlayBattleAnim for animation `id` (a move number or an ANIM_* constant); `turn` is 0 for the player's side. */
  start(id, { turn, param, afterAnim } = {}) {
    if (id !== undefined) this.w16('wFXAnimID', id);
    if (turn !== undefined) this.w8('hBattleTurn', turn);
    if (param !== undefined) this.w8('wBattleAnimParam', param);
    if (afterAnim !== undefined) this.w8('wBattleAfterAnim', afterAnim);
    this.cpu.sp = 0xfdff;                                         // a stack of its own (the unused echo area)
    this.cpu.push(EXIT);
    this.cpu.pc = SYM.PlayBattleAnim;
    this.finished = false;
    this.sounds.length = 0;
    this.showMemory();
  }

  /** What the screen shows before the first VBlank: the BG map, attributes, palettes and OAM as they are in memory. */
  showMemory() {
    const m = this;
    const tiles = new Uint8Array(360), attr = new Uint8Array(360);
    for (let i = 0; i < 360; i++) { tiles[i] = m.mem[R.wTilemap + i]; attr[i] = m.mem[R.wAttrmap + i]; }
    const pals = (name) => m.withBank5(() => Uint8Array.from({ length: 64 }, (_, i) => m.read(R[name] + i)));
    this.shown = { tiles, attr, bg: pals('wBGPals2'), ob: pals('wOBPals2'), oam: this.mem.slice(R.wShadowOAM, R.wShadowOAM + 160), scx: 0, scy: 0, lcd: 0, ly: new Uint8Array(144), bgp: this.mem[IO + 0x47] || 0xe4 };
  }

  /** The engine's side of one frame: run until it waits for VBlank. Returns true when the animation has finished. */
  runFrame() {
    if (this.finished) return true;
    if (this.block > 0) return false;
    const before = this.cpu.cycles;
    this.extra = 0;
    this.cpu.run();
    const work = this.cpu.cycles - before + this.extra + TIMING.perFrame;
    const lcd = this.mem[R.hLCDCPointer] !== 0;
    const end = this.advance(this.t, work, lcd);
    this.block += Math.floor(end / FRAME_CYCLES);                              // VBlanks that came during the work: the wait starts after them
    this.lastWork = work;
    this.arrival = end % FRAME_CYCLES;
    if (this.cpu.pc === EXIT) this.finished = true;
    return this.finished;
  }

  /** Where in the frame `work` cycles of the engine's code end when it starts at `t`; the LCD handler takes its share of every visible line. */
  advance(t, work, lcd) {
    let left = work;
    for (;;) {
      const lineEnd = (Math.floor(t / LINE_CYCLES) + 1) * LINE_CYCLES;
      const visible = t >= VBLANK_LINES * LINE_CYCLES && t < FRAME_CYCLES;
      const rate = visible && lcd ? (LINE_CYCLES - TIMING.lcdInterrupt) / LINE_CYCLES : 1;
      const room = (lineEnd - t) * rate;
      if (left <= room) return t + left / rate;
      left -= room;
      t = lineEnd;
      if (t >= FRAME_CYCLES) return t + left;
    }
  }

  /** VBlank, and the frame it starts. */
  endFrame() {
    this.isr();
    this.frame++;
  }

  /** One displayed frame; true when the animation is over. */
  step() {
    if (this.block > 0) { this.block--; this.endFrame(); return false; }
    const done = this.runFrame();
    this.endFrame();
    return done;
  }

  /** VBlank_CutsceneCGB: scroll registers, then either the palettes or (the rest of the frame's time) the BG map, tiles and OAM. */
  isr() {
    const m = this, s = this.shown;
    s.scx = m.mem[R.hSCX]; s.scy = m.mem[R.hSCY];
    let cost = TIMING.isr.base;
    if (m.mem[R.hCGBPalUpdate]) {
      cost += TIMING.isr.palettes;
      m.withBank5(() => { for (let i = 0; i < 64; i++) { s.bg[i] = m.read(R.wBGPals2 + i); s.ob[i] = m.read(R.wOBPals2 + i); } });
      m.mem[R.hCGBPalUpdate] = 0;
      s.bgp = m.mem[IO + 0x47];
    } else {
      cost += (m.mem[R.hBGMapMode] === 1 || m.mem[R.hBGMapMode] === 2 ? TIMING.isr.bgMap : 0) + TIMING.isr.oamDma;
      this.updateBGMap();
      const tiles = this.vblank();
      if (tiles) cost += TIMING.isr.serveSetup + tiles * TIMING.isr.serveTile;
      s.oam.set(m.mem.subarray(R.wShadowOAM, R.wShadowOAM + 160));
    }
    this.t = cost;
    s.lcd = m.mem[R.hLCDCPointer];
    m.withBank5(() => { for (let y = 0; y < 144; y++) s.ly[y] = m.read(R.wLYOverrides + y); });
  }

  /** UpdateBGMap: a third of the tilemap (or of the attributes) a VBlank. */
  updateBGMap() {
    const m = this, s = this.shown, mode = m.mem[R.hBGMapMode];
    if (mode !== 1 && mode !== 2) return;
    const third = m.mem[R.hBGMapThird];
    const from = third * 120, to = from + 120;
    const source = mode === 1 ? R.wTilemap : R.wAttrmap, target = mode === 1 ? s.tiles : s.attr;
    for (let i = from; i < to; i++) target[i] = m.mem[source + i];
    m.mem[R.hBGMapThird] = (third + 1) % 3;
  }

  /** Serve2bppRequest_VBlank: the queued 2bpp copy; returns the tiles copied. */
  vblank() {
    const size = this.r8('wRequested2bppSize');
    if (size) {
      this.copy(this.r16('wRequested2bppDest'), this.r16('wRequested2bppSource'), size * 16);
      this.w16('wRequested2bppSource', this.r16('wRequested2bppSource') + size * 16);
      this.w16('wRequested2bppDest', this.r16('wRequested2bppDest') + size * 16);
      this.w8('wRequested2bppSize', 0);
    }
    return size;
  }

  // ---- what the screen shows ----

  /** The 40 OAM entries that are on screen: [{ y, x, tile, attr }] in screen pixels (OAM y - 16, x - 8). */
  sprites() {
    const oam = this.shown.oam, out = [];
    for (let i = 0; i < 40; i++) {
      const y = oam[4 * i], x = oam[4 * i + 1];
      if (y === 0 || y >= 160 || x === 0 || x >= 168) continue;
      out.push({ y: y - 16, x: x - 8, tile: oam[4 * i + 2], attr: oam[4 * i + 3] });
    }
    return out;
  }

  // ---- native stand-ins ----

  hook(address, fn) { this.cpu.hooks.set(address, fn); }
  /** Replace a routine: run fn(cpu), then return to the caller. */
  routine(address, fn) { this.hook(address, (cpu) => { const r = fn(cpu); cpu.pc = cpu.pop(); return r; }); }

  installHooks() {
    const m = this;
    const ext = (name, fn) => { if (external(name) !== undefined) m.routine(external(name), fn); };
    const note = (name) => () => { m.unhooked.add(name); };
    // rst FarCall: jump to hl (the callee returns to the caller of the rst)
    m.hook(0x0008, (cpu) => { cpu.pc = cpu.hl; });
    m.hook(EXIT, () => 'stop');
    // a frame boundary
    m.routine(SYM.BattleAnimDelayFrame, () => { m.badFrames.push(m.frame); return 'stop'; });
    ext('DelayFrame', () => 'stop');
    for (const name of ['OpenSRAM', 'CloseSRAM', 'DropEnemySub', 'DropPlayerSub', 'GetSGBLayout', 'Predef', 'GetUnownLetterPredef', 'GetMonFrontpicPredef', 'GetMonBackpicPredef', 'LoadCry', '_PlayCry']) ext(name, note(name));
    // routines that wait for frames: they keep the engine at their address until done
    const wait = (name, step) => { if (external(name) !== undefined) m.hook(external(name), (cpu) => { if (step(cpu)) return 'stop'; cpu.pc = cpu.pop(); return undefined; }); };
    wait('FinishBGMapTransfer', () => {                                                      // until the BG map's current pass has finished
      if (!m.mem[R.hBGMapMode]) return false;
      if (!m.mem[R.hBGMapThird]) { m.mem[R.hBGMapMode] = 0; return false; }
      return true;
    });
    wait('WaitBGMap2', () => {                                                               // mode 2 for 4 frames, then mode 1 for 4
      m.bgWait = (m.bgWait ?? 0) + 1;
      if (m.bgWait === 1) m.mem[R.hBGMapMode] = 2;
      if (m.bgWait === 5) m.mem[R.hBGMapMode] = 1;
      if (m.bgWait <= 8) return true;
      m.bgWait = 0;
      return false;
    });
    wait('WaitSFX', () => m.frame < m.sfxEnd);
    ext('UpdateBattleHuds', () => { m.restoreHuds?.(); m.extra += COST.UpdateBattleHuds; });                                         // BattleAnimRestoreHuds: the screen draws the HUDs again
    ext('CheckBattleScene', (cpu) => { cpu.cy = false; });                                   // battle animations are on
    const sound = (cpu) => {
      const name = SFX_NAMES[cpu.de], frames = SFX_FRAMES[name];
      m.sounds.push({ id: cpu.de, name, frame: m.frame });
      m.sfxEnd = Math.max(m.sfxEnd, m.frame + (frames ?? 0));
      m.extra += TIMING.sfxStart;
    };
    ext('PlaySFX', sound);
    ext('PlayStereoSFX', sound);
    ext('Random', (cpu) => { cpu.a = m.random(); });
    ext('PushLYOverrides', () => {
      if (m.read(addr('hLCDCPointer')) === 0) return;
      m.w16('wRequested2bppSource', addr('wLYOverridesBackup'));
      m.w16('wRequested2bppDest', addr('wLYOverrides'));
      m.w8('wRequested2bppSize', (addr('wLYOverridesEnd') - addr('wLYOverrides')) / 16);
      m.extra += COST.PushLYOverrides;
    });
    ext('ClearBox', (cpu) => {                                                               // c x b blank tiles at hl
      for (let y = 0; y < cpu.b; y++) for (let x = 0; x < cpu.c; x++) m.write(cpu.hl + y * 20 + x, 0x7f);
      m.extra += cpu.b * (COST.ClearBoxRow + cpu.c * COST.ClearBoxCell);
    });
    ext('GetBattleAnimByte', (cpu) => {
      const a = m.r16('wBattleAnimAddress');
      const v = m.read(a);
      m.w16('wBattleAnimAddress', a + 1);
      m.w8('wBattleAnimByte', v);
      cpu.a = v;
      m.extra += COST.GetBattleAnimByte;
    });
    ext('GetBattleAnimPointer', (cpu) => {                                                   // hl -> the animation's script pointer
      const p = m.read(cpu.hl) | (m.read(cpu.hl + 1) << 8);
      m.w16('wBattleAnimAddress', p);
    });
    ext('Request2bpp', (cpu) => { m.copy(cpu.hl, cpu.de, cpu.c * 16); m.block += Math.ceil(cpu.c / TILES_PER_CYCLE) - 1; return 'stop'; });       // a DelayFrame per 8 tiles
    ext('FarCopyBytes', (cpu) => { m.copy(cpu.de, cpu.hl, cpu.bc); m.extra += cpu.bc * COST.FarCopyByte; });
    ext('DecompressRequest2bpp', (cpu) => m.loadAnimGfx(cpu));
    ext('CopyPals', (cpu) => { m.copyPals(cpu); m.extra += cpu.c * COST.CopyPal; });
    ext('DmgToCgbBGPals', (cpu) => { m.dmgToCgbBG(cpu.a); m.extra += COST.DmgToCgb; });
    ext('DmgToCgbObjPals', (cpu) => { m.dmgToCgbObj(cpu.d, cpu.e); m.extra += COST.DmgToCgb; });
  }

  /** LoadBattleAnimGFX: hl = the compressed graphics (a stand-in address), de = VRAM destination, c = tile count. */
  loadAnimGfx(cpu) {
    const label = Object.entries(D.externals).find(([, a]) => a === cpu.hl)?.[0];
    const file = D.gfx.find((g) => g.label === label)?.file;
    const tiles = file ? D.sheets[file] : null;
    if (!tiles) return undefined;
    let dest = cpu.de;
    for (const tile of tiles.slice(0, cpu.c)) {
      for (let y = 0; y < 8; y++) {
        let lo = 0, hi = 0;
        for (let x = 0; x < 8; x++) { const v = tile.charCodeAt(y * 8 + x) - 48; lo = (lo << 1) | (v & 1); hi = (hi << 1) | (v >> 1); }
        this.write(dest++, lo); this.write(dest++, hi);
      }
    }
    this.extra += cpu.c * 16 * COST.DecompressByte;
    this.block += Math.ceil(cpu.c / TILES_PER_CYCLE) - 1;
    return 'stop';
  }

  /** CopyPals: copy c palettes (b = the DMG palette byte that orders their colors) from de to hl. */
  copyPals(cpu) {
    const { b } = cpu;
    let hl = cpu.hl, de = cpu.de;
    for (let pal = 0; pal < cpu.c; pal++) {
      let order = b;
      for (let color = 0; color < 4; color++) {
        const src = de + (order & 3) * 2;
        this.write(hl++, this.read(src)); this.write(hl++, this.read(src + 1));
        order >>= 2;
      }
      de += 8;
    }
    cpu.hl = hl; cpu.de = de;
  }

  dmgToCgbBG(a) {
    this.mem[IO + 0x47] = a;
    this.withBank5(() => { for (let p = 0; p < 8; p++) this.copyPalette(addr('wBGPals2') + p * 8, addr('wBGPals1') + p * 8, a); });
    this.mem[R.hCGBPalUpdate] = 1;
  }

  dmgToCgbObj(obp1, obp0) {
    this.mem[IO + 0x48] = obp0; this.mem[IO + 0x49] = obp1;
    this.withBank5(() => { for (let p = 0; p < 8; p++) this.copyPalette(addr('wOBPals2') + p * 8, addr('wOBPals1') + p * 8, obp0); });
    this.mem[R.hCGBPalUpdate] = 1;
  }

  copyPalette(dest, source, order) {
    for (let color = 0; color < 4; color++) {
      const src = source + ((order >> (2 * color)) & 3) * 2;
      this.write(dest + color * 2, this.read(src)); this.write(dest + color * 2 + 1, this.read(src + 1));
    }
  }
}
