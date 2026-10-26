// The battle animation engine, run as the game's own code: the SM83 image built by tools/battle-anim-data.mjs (engine/battle_anims/*.asm and every
// move's script) executes on an interpreter over a small Game Boy memory, with native stand-ins for the routines that live elsewhere (drawing,
// sound, palettes, VRAM transfers). One call of step() runs the engine until it asks for the next frame (BattleAnimDelayFrame / DelayFrame).
// What the animation changes is read back from memory: shadow OAM, the tilemap and attributes, VRAM tiles, palettes, scroll registers.
import { BATTLE_ANIMS as D } from '../../generated/battle-anims.js';
import { Cpu } from './sm83.js';

const EXIT = 0xfff0;                       // where the animation's final `ret` lands
const IO = 0xff00;
const R = D.ram;
const SYM = D.symbols;
const addr = (name) => R[name] ?? SYM[name] ?? D.externals[name] ?? D.constants[name];
const external = (name) => D.externals[name];

const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class AnimMachine {
  constructor({ random = () => Math.floor(Math.random() * 256) } = {}) {
    this.random = random;
    this.mem = new Uint8Array(0x10000);
    this.wramx = Array.from({ length: 8 }, () => new Uint8Array(0x1000));
    this.mem.set(decode(D.rom.data), D.rom.base);
    this.sounds = [];                       // [{ id, frame }] the engine asked for (animation sound effects)
    this.frame = 0;
    this.unhooked = new Set();
    const bus = { read: (a) => this.read(a), write: (a, v) => this.write(a, v) };
    this.cpu = new Cpu(bus);
    this.installHooks();
  }

  // ---- memory ----

  get bank() { return (this.mem[0xff70] & 7) || 1; }
  read(a) { return a >= 0xd000 && a < 0xe000 ? this.wramx[this.bank][a - 0xd000] : this.mem[a]; }
  write(a, v) { if (a >= 0xd000 && a < 0xe000) this.wramx[this.bank][a - 0xd000] = v; else if (a >= 0x8000) this.mem[a] = v; }
  /** A byte of WRAM bank 5, where the animation engine's variables live (the bank switches are no-ops for everything else). */
  readIn(bank, a) { return a >= 0xd000 && a < 0xe000 ? this.wramx[bank][a - 0xd000] : this.mem[a]; }
  r8(name) { return this.read(addr(name)); }
  w8(name, v) { this.write(addr(name), v); }
  r16(name) { const a = addr(name); return this.read(a) | (this.read(a + 1) << 8); }
  w16(name, v) { const a = addr(name); this.write(a, v & 0xff); this.write(a + 1, v >> 8); }
  /** Bytes at `a` in WRAM bank 5 (the animation engine's own bank), as the engine addresses them. */
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
  }

  /** Run to the next frame boundary; true when the animation is over. */
  step() {
    if (this.finished) return true;
    if (this.frame > 0) this.vblank();                           // the frame the engine waited for (BattleAnimDelayFrame) happened
    this.cpu.run();
    if (this.cpu.pc === EXIT) this.finished = true;
    this.frame++;
    return this.finished;
  }

  /** What the VBlank handler does between frames: the queued 2bpp copy. */
  vblank() {
    const size = this.r8('wRequested2bppSize');
    if (size) {
      this.copy(this.r16('wRequested2bppDest'), this.r16('wRequested2bppSource'), size * 16);
      this.w8('wRequested2bppSize', 0);
    }
  }

  // ---- what the animation drew ----

  /** The 40 shadow OAM entries that are on screen: [{ y, x, tile, attr }] in screen pixels (OAM y - 16, x - 8). */
  sprites() {
    const base = addr('wShadowOAM'), out = [];
    for (let i = 0; i < 40; i++) {
      const y = this.mem[base + 4 * i], x = this.mem[base + 4 * i + 1];
      if (y === 0 || y >= 160 || x === 0 || x >= 168) continue;
      out.push({ y: y - 16, x: x - 8, tile: this.mem[base + 4 * i + 2], attr: this.mem[base + 4 * i + 3] });
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
    m.routine(SYM.BattleAnimDelayFrame, () => 'stop');
    ext('DelayFrame', () => 'stop');
    for (const name of ['WaitSFX', 'FinishBGMapTransfer', 'WaitBGMap2', 'UpdateBattleHuds', 'OpenSRAM', 'CloseSRAM', 'DropEnemySub', 'DropPlayerSub', 'GetSGBLayout', 'Predef', 'GetUnownLetterPredef', 'GetMonFrontpicPredef', 'GetMonBackpicPredef', 'LoadCry', '_PlayCry']) ext(name, note(name));
    ext('CheckBattleScene', (cpu) => { cpu.cy = false; });                                   // battle animations are on
    ext('PlaySFX', (cpu) => { m.sounds.push({ id: cpu.de, frame: m.frame }); });
    ext('PlayStereoSFX', (cpu) => { m.sounds.push({ id: cpu.de, frame: m.frame }); });
    ext('Random', (cpu) => { cpu.a = m.random(); });
    ext('PushLYOverrides', (cpu) => {
      if (m.read(addr('hLCDCPointer')) === 0) return;
      m.w16('wRequested2bppSource', addr('wLYOverridesBackup'));
      m.w16('wRequested2bppDest', addr('wLYOverrides'));
      m.w8('wRequested2bppSize', (addr('wLYOverridesEnd') - addr('wLYOverrides')) / 16);
      void cpu;
    });
    ext('ClearBox', (cpu) => {                                                               // c x b blank tiles at hl
      for (let y = 0; y < cpu.b; y++) for (let x = 0; x < cpu.c; x++) m.write(cpu.hl + y * 20 + x, 0x7f);
    });
    ext('GetBattleAnimByte', (cpu) => {
      const a = m.r16('wBattleAnimAddress');
      const v = m.read(a);
      m.w16('wBattleAnimAddress', a + 1);
      m.w8('wBattleAnimByte', v);
      cpu.a = v;
    });
    ext('GetBattleAnimPointer', (cpu) => {                                                   // hl -> the animation's script pointer
      const p = m.read(cpu.hl) | (m.read(cpu.hl + 1) << 8);
      m.w16('wBattleAnimAddress', p);
    });
    ext('Request2bpp', (cpu) => { m.copy(cpu.hl, cpu.de, cpu.c * 16); });
    ext('FarCopyBytes', (cpu) => { m.copy(cpu.de, cpu.hl, cpu.bc); });
    ext('DecompressRequest2bpp', (cpu) => { m.loadAnimGfx(cpu); });
    ext('CopyPals', (cpu) => { m.copyPals(cpu); });
    ext('DmgToCgbBGPals', (cpu) => { m.dmgToCgbBG(cpu.a); });
    ext('DmgToCgbObjPals', (cpu) => { m.dmgToCgbObj(cpu.d, cpu.e); });
  }

  /** LoadBattleAnimGFX: hl = the compressed graphics (a stand-in address), de = VRAM destination, c = tile count. */
  loadAnimGfx(cpu) {
    const label = Object.entries(D.externals).find(([, a]) => a === cpu.hl)?.[0];
    const file = D.gfx.find((g) => g.label === label)?.file;
    const tiles = file ? D.sheets[file] : null;
    if (!tiles) return;
    let dest = cpu.de;
    for (const tile of tiles.slice(0, cpu.c)) {
      for (let y = 0; y < 8; y++) {
        let lo = 0, hi = 0;
        for (let x = 0; x < 8; x++) { const v = tile.charCodeAt(y * 8 + x) - 48; lo = (lo << 1) | (v & 1); hi = (hi << 1) | (v >> 1); }
        this.write(dest++, lo); this.write(dest++, hi);
      }
    }
  }

  /** CopyPals: copy c palettes (b = the DMG palette byte that orders their colors) from de to hl. */
  copyPals(cpu) {
    let { b } = cpu, hl = cpu.hl, de = cpu.de;
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
  }

  dmgToCgbObj(obp1, obp0) {
    this.mem[IO + 0x48] = obp0; this.mem[IO + 0x49] = obp1;
    this.withBank5(() => { for (let p = 0; p < 8; p++) this.copyPalette(addr('wOBPals2') + p * 8, addr('wOBPals1') + p * 8, p < 2 ? obp0 : obp1); });
  }

  copyPalette(dest, source, order) {
    for (let color = 0; color < 4; color++) {
      const src = source + ((order >> (2 * color)) & 3) * 2;
      this.write(dest + color * 2, this.read(src)); this.write(dest + color * 2 + 1, this.read(src + 1));
    }
  }
}

