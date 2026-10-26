// An SM83 (Game Boy CPU) interpreter, just large enough to run the battle animation engine's own code (engine/battle_anims/*.asm, assembled by
// tools/sm83-asm.mjs). `bus` supplies read(address) and write(address, value); `hooks` maps an address to a native routine that stands in for
// the code there (it runs instead of the instruction at that address, and may stop the run). No timing is modelled: callers count frames.

const MASK = 0xff;

// M-cycles of each opcode (taken conditional jumps, calls and returns add their extra in step()); the 0xcb table is 2, 4 for (hl), 3 for bit n,(hl).
const CYCLES = (() => {
  const t = new Array(256).fill(1);
  const set = (list, n) => list.forEach((op) => { t[op] = n; });
  for (let op = 0x40; op < 0x80; op++) t[op] = (op & 7) === 6 || ((op >> 3) & 7) === 6 ? 2 : 1;
  for (let op = 0x80; op < 0xc0; op++) t[op] = (op & 7) === 6 ? 2 : 1;
  set([0x01, 0x11, 0x21, 0x31], 3); t[0xc3] = 4; t[0xfa] = 4; t[0xea] = 4;
  set([0x02, 0x12, 0x22, 0x32, 0x0a, 0x1a, 0x2a, 0x3a, 0x03, 0x13, 0x23, 0x33, 0x0b, 0x1b, 0x2b, 0x3b, 0x09, 0x19, 0x29, 0x39, 0xe2, 0xf2, 0xf9], 2);
  set([0x06, 0x0e, 0x16, 0x1e, 0x26, 0x2e, 0x3e, 0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe], 2);
  t[0x36] = 3; t[0x34] = 3; t[0x35] = 3; t[0x08] = 5; t[0xe0] = 3; t[0xf0] = 3; t[0xe8] = 4; t[0xf8] = 3;
  set([0x18, 0x20, 0x28, 0x30, 0x38], 2);                       // jr: 3 when taken
  set([0xc2, 0xca, 0xd2, 0xda], 3);                             // jp cc: 4 when taken
  set([0xc4, 0xcc, 0xd4, 0xdc], 3); t[0xcd] = 6;                // call cc: 6 when taken
  set([0xc0, 0xc8, 0xd0, 0xd8], 2); set([0xc9, 0xd9], 4);       // ret cc: 5 when taken
  set([0xc5, 0xd5, 0xe5, 0xf5], 4); set([0xc1, 0xd1, 0xe1, 0xf1], 3);
  set([0xc7, 0xcf, 0xd7, 0xdf, 0xe7, 0xef, 0xf7, 0xff], 4); t[0xe9] = 1; t[0xcb] = 0;
  return t;
})();


export class Cpu {
  constructor(bus) {
    this.bus = bus;
    this.a = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.z = false; this.n = false; this.hc = false; this.cy = false;
    this.sp = 0xfffe; this.pc = 0;
    this.hooks = new Map();
    this.stopped = false;
    this.cycles = 0;                                  // M-cycles executed (a frame is 17556)
  }

  get hl() { return (this.h << 8) | this.l; }
  set hl(v) { this.h = (v >> 8) & MASK; this.l = v & MASK; }
  get bc() { return (this.b << 8) | this.c; }
  set bc(v) { this.b = (v >> 8) & MASK; this.c = v & MASK; }
  get de() { return (this.d << 8) | this.e; }
  set de(v) { this.d = (v >> 8) & MASK; this.e = v & MASK; }
  get af() { return (this.a << 8) | (this.z ? 0x80 : 0) | (this.n ? 0x40 : 0) | (this.hc ? 0x20 : 0) | (this.cy ? 0x10 : 0); }
  set af(v) { this.a = (v >> 8) & MASK; this.z = Boolean(v & 0x80); this.n = Boolean(v & 0x40); this.hc = Boolean(v & 0x20); this.cy = Boolean(v & 0x10); }

  read(a) { return this.bus.read(a & 0xffff); }
  write(a, v) { this.bus.write(a & 0xffff, v & MASK); }
  fetch() { const v = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }
  push(v) { this.sp = (this.sp - 1) & 0xffff; this.write(this.sp, v >> 8); this.sp = (this.sp - 1) & 0xffff; this.write(this.sp, v & MASK); }
  pop() { const lo = this.read(this.sp); this.sp = (this.sp + 1) & 0xffff; const hi = this.read(this.sp); this.sp = (this.sp + 1) & 0xffff; return lo | (hi << 8); }

  getReg(i) {
    switch (i) { case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e; case 4: return this.h; case 5: return this.l; case 6: return this.read(this.hl); default: return this.a; }
  }
  setReg(i, v) {
    v &= MASK;
    switch (i) { case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break; case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.write(this.hl, v); break; default: this.a = v; }
  }
  getRR(i) { return i === 0 ? this.bc : i === 1 ? this.de : i === 2 ? this.hl : this.sp; }
  setRR(i, v) { v &= 0xffff; if (i === 0) this.bc = v; else if (i === 1) this.de = v; else if (i === 2) this.hl = v; else this.sp = v; }
  cond(i) { return i === 0 ? !this.z : i === 1 ? this.z : i === 2 ? !this.cy : this.cy; }

  alu(op, v) {
    const a = this.a;
    switch (op) {
      case 0: { const r = a + v; this.hc = (a & 15) + (v & 15) > 15; this.cy = r > 255; this.a = r & MASK; this.z = this.a === 0; this.n = false; break; }
      case 1: { const c = this.cy ? 1 : 0; const r = a + v + c; this.hc = (a & 15) + (v & 15) + c > 15; this.cy = r > 255; this.a = r & MASK; this.z = this.a === 0; this.n = false; break; }
      case 2: { const r = a - v; this.hc = (a & 15) < (v & 15); this.cy = r < 0; this.a = r & MASK; this.z = this.a === 0; this.n = true; break; }
      case 3: { const c = this.cy ? 1 : 0; const r = a - v - c; this.hc = (a & 15) < (v & 15) + c; this.cy = r < 0; this.a = r & MASK; this.z = this.a === 0; this.n = true; break; }
      case 4: this.a = a & v; this.z = this.a === 0; this.n = false; this.hc = true; this.cy = false; break;
      case 5: this.a = a ^ v; this.z = this.a === 0; this.n = false; this.hc = false; this.cy = false; break;
      case 6: this.a = a | v; this.z = this.a === 0; this.n = false; this.hc = false; this.cy = false; break;
      default: { const r = a - v; this.z = (r & MASK) === 0; this.n = true; this.hc = (a & 15) < (v & 15); this.cy = r < 0; }
    }
  }

  cb() {
    const op = this.fetch(), r = op & 7, bit = (op >> 3) & 7;
    this.cycles += r !== 6 ? 2 : (op >> 6) === 1 ? 3 : 4;
    const v = this.getReg(r);
    switch (op >> 6) {
      case 1: this.z = (v & (1 << bit)) === 0; this.n = false; this.hc = true; return;
      case 2: this.setReg(r, v & ~(1 << bit)); return;
      case 3: this.setReg(r, v | (1 << bit)); return;
      default: break;
    }
    let out;
    switch (bit) {
      case 0: out = ((v << 1) | (v >> 7)) & MASK; this.cy = Boolean(v & 0x80); break;                      // rlc
      case 1: out = ((v >> 1) | (v << 7)) & MASK; this.cy = Boolean(v & 1); break;                         // rrc
      case 2: out = ((v << 1) | (this.cy ? 1 : 0)) & MASK; this.cy = Boolean(v & 0x80); break;             // rl
      case 3: out = ((v >> 1) | (this.cy ? 0x80 : 0)) & MASK; this.cy = Boolean(v & 1); break;              // rr
      case 4: out = (v << 1) & MASK; this.cy = Boolean(v & 0x80); break;                                  // sla
      case 5: out = (v >> 1) | (v & 0x80); this.cy = Boolean(v & 1); break;                               // sra
      case 6: out = ((v << 4) | (v >> 4)) & MASK; this.cy = false; break;                                // swap
      default: out = v >> 1; this.cy = Boolean(v & 1);                                                    // srl
    }
    this.z = out === 0; this.n = false; this.hc = false;
    this.setReg(r, out);
  }

  /** Execute one instruction (or the native hook standing in for it). Returns 'stop' when a hook asked the run to end. */
  step() {
    const hook = this.hooks.get(this.pc);
    if (hook) { const r = hook(this); return r === 'stop' ? 'stop' : undefined; }
    const op = this.fetch();
    this.cycles += CYCLES[op];
    if (op === 0x00) return undefined;
    if ((op & 0xc0) === 0x40) {                                                   // ld r, r
      if (op === 0x76) throw new Error('sm83: halt');
      this.setReg((op >> 3) & 7, this.getReg(op & 7));
      return undefined;
    }
    if ((op & 0xc0) === 0x80) { this.alu((op >> 3) & 7, this.getReg(op & 7)); return undefined; }
    switch (op) {
      case 0x01: case 0x11: case 0x21: case 0x31: this.setRR(op >> 4, this.fetch16()); break;
      case 0x02: this.write(this.bc, this.a); break;
      case 0x12: this.write(this.de, this.a); break;
      case 0x22: this.write(this.hl, this.a); this.hl = this.hl + 1; break;
      case 0x32: this.write(this.hl, this.a); this.hl = this.hl - 1; break;
      case 0x0a: this.a = this.read(this.bc); break;
      case 0x1a: this.a = this.read(this.de); break;
      case 0x2a: this.a = this.read(this.hl); this.hl = this.hl + 1; break;
      case 0x3a: this.a = this.read(this.hl); this.hl = this.hl - 1; break;
      case 0x03: case 0x13: case 0x23: case 0x33: this.setRR(op >> 4, this.getRR(op >> 4) + 1); break;
      case 0x0b: case 0x1b: case 0x2b: case 0x3b: this.setRR(op >> 4, this.getRR(op >> 4) - 1); break;
      case 0x09: case 0x19: case 0x29: case 0x39: {
        const hl = this.hl, v = this.getRR(op >> 4), r = hl + v;
        this.n = false; this.hc = (hl & 0xfff) + (v & 0xfff) > 0xfff; this.cy = r > 0xffff; this.hl = r;
        break;
      }
      case 0x04: case 0x0c: case 0x14: case 0x1c: case 0x24: case 0x2c: case 0x34: case 0x3c: {
        const r = (op >> 3) & 7, v = this.getReg(r), out = (v + 1) & MASK;
        this.z = out === 0; this.n = false; this.hc = (v & 15) === 15; this.setReg(r, out);
        break;
      }
      case 0x05: case 0x0d: case 0x15: case 0x1d: case 0x25: case 0x2d: case 0x35: case 0x3d: {
        const r = (op >> 3) & 7, v = this.getReg(r), out = (v - 1) & MASK;
        this.z = out === 0; this.n = true; this.hc = (v & 15) === 0; this.setReg(r, out);
        break;
      }
      case 0x06: case 0x0e: case 0x16: case 0x1e: case 0x26: case 0x2e: case 0x36: case 0x3e: this.setReg((op >> 3) & 7, this.fetch()); break;
      case 0x07: this.a = ((this.a << 1) | (this.a >> 7)) & MASK; this.cy = Boolean(this.a & 1); this.z = false; this.n = false; this.hc = false; break;
      case 0x0f: this.cy = Boolean(this.a & 1); this.a = ((this.a >> 1) | (this.a << 7)) & MASK; this.z = false; this.n = false; this.hc = false; break;
      case 0x17: { const c = this.cy ? 1 : 0; this.cy = Boolean(this.a & 0x80); this.a = ((this.a << 1) | c) & MASK; this.z = false; this.n = false; this.hc = false; break; }
      case 0x1f: { const c = this.cy ? 0x80 : 0; this.cy = Boolean(this.a & 1); this.a = (this.a >> 1) | c; this.z = false; this.n = false; this.hc = false; break; }
      case 0x08: { const a = this.fetch16(); this.write(a, this.sp & MASK); this.write(a + 1, this.sp >> 8); break; }
      case 0x10: this.fetch(); break;
      case 0x18: { const e = this.fetch(); this.pc = (this.pc + (e << 24 >> 24)) & 0xffff; this.cycles += 1; break; }
      case 0x20: case 0x28: case 0x30: case 0x38: { const e = this.fetch(); if (this.cond((op >> 3) & 3)) { this.pc = (this.pc + (e << 24 >> 24)) & 0xffff; this.cycles += 1; } break; }
      case 0x27: {                                                                                    // daa
        let a = this.a;
        if (!this.n) { if (this.cy || a > 0x99) { a += 0x60; this.cy = true; } if (this.hc || (a & 15) > 9) a += 6; }
        else { if (this.cy) a -= 0x60; if (this.hc) a -= 6; }
        this.a = a & MASK; this.z = this.a === 0; this.hc = false;
        break;
      }
      case 0x2f: this.a ^= MASK; this.n = true; this.hc = true; break;
      case 0x37: this.cy = true; this.n = false; this.hc = false; break;
      case 0x3f: this.cy = !this.cy; this.n = false; this.hc = false; break;
      case 0xc0: case 0xc8: case 0xd0: case 0xd8: if (this.cond((op >> 3) & 3)) { this.pc = this.pop(); this.cycles += 3; } break;
      case 0xc9: this.pc = this.pop(); break;
      case 0xd9: this.pc = this.pop(); break;
      case 0xc1: case 0xd1: case 0xe1: this.setRR((op >> 4) & 3, this.pop()); break;
      case 0xf1: this.af = this.pop() & 0xfff0; break;
      case 0xc5: case 0xd5: case 0xe5: this.push(this.getRR((op >> 4) & 3)); break;
      case 0xf5: this.push(this.af); break;
      case 0xc2: case 0xca: case 0xd2: case 0xda: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.pc = a; this.cycles += 1; } break; }
      case 0xc3: this.pc = this.fetch16(); break;
      case 0xe9: this.pc = this.hl; break;
      case 0xc4: case 0xcc: case 0xd4: case 0xdc: { const a = this.fetch16(); if (this.cond((op >> 3) & 3)) { this.push(this.pc); this.pc = a; this.cycles += 3; } break; }
      case 0xcd: { const a = this.fetch16(); this.push(this.pc); this.pc = a; break; }
      case 0xc6: case 0xce: case 0xd6: case 0xde: case 0xe6: case 0xee: case 0xf6: case 0xfe: this.alu((op >> 3) & 7, this.fetch()); break;
      case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff: this.push(this.pc); this.pc = op & 0x38; break;
      case 0xcb: this.cb(); break;
      case 0xe0: this.write(0xff00 + this.fetch(), this.a); break;
      case 0xf0: this.a = this.read(0xff00 + this.fetch()); break;
      case 0xe2: this.write(0xff00 + this.c, this.a); break;
      case 0xf2: this.a = this.read(0xff00 + this.c); break;
      case 0xea: this.write(this.fetch16(), this.a); break;
      case 0xfa: this.a = this.read(this.fetch16()); break;
      case 0xe8: { const e = this.fetch() << 24 >> 24, sp = this.sp; this.z = false; this.n = false; this.hc = (sp & 15) + (e & 15) > 15; this.cy = (sp & 0xff) + (e & 0xff) > 0xff; this.sp = (sp + e) & 0xffff; break; }
      case 0xf8: { const e = this.fetch() << 24 >> 24, sp = this.sp; this.z = false; this.n = false; this.hc = (sp & 15) + (e & 15) > 15; this.cy = (sp & 0xff) + (e & 0xff) > 0xff; this.hl = sp + e; break; }
      case 0xf9: this.sp = this.hl; break;
      case 0xf3: case 0xfb: break;
      default: throw new Error(`sm83: unimplemented opcode $${op.toString(16)} at $${((this.pc - 1) & 0xffff).toString(16)}`);
    }
    return undefined;
  }

  /** Run until a hook stops the run or `limit` instructions have executed. Returns the number of instructions run. */
  run(limit = 5_000_000) {
    let n = 0;
    while (n < limit) {
      n++;
      if (this.step() === 'stop') return n;
    }
    throw new Error(`sm83: ran ${limit} instructions without stopping (pc=$${this.pc.toString(16)})`);
  }
}
