// A small rgbasm-compatible assembler for the Game Boy (SM83) code and data of the battle animation engine: it reads the disassembly's own
// source files, expands their macros (macros/*.asm), evaluates constants and expressions, and produces machine code, data and symbols.
// Only what those sources use is supported (see the unsupported() errors); a source that needs more fails loudly rather than assembling wrong.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REGS8 = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, '[hl]': 6, a: 7 };
const REGS16 = { bc: 0, de: 1, hl: 2, sp: 3 };
const PUSHPOP = { bc: 0, de: 1, hl: 2, af: 3 };
const CONDS = { nz: 0, z: 1, nc: 2, c: 3 };
const ALU = { add: 0, adc: 1, sub: 2, sbc: 3, and: 4, xor: 5, or: 6, cp: 7 };
const CB = { rlc: 0, rrc: 1, rl: 2, rr: 3, sla: 4, sra: 5, swap: 6, srl: 7 };
const SIMPLE = { nop: 0x00, halt: 0x76, di: 0xf3, ei: 0xfb, daa: 0x27, cpl: 0x2f, scf: 0x37, ccf: 0x3f, rlca: 0x07, rrca: 0x0f, rla: 0x17, rra: 0x1f, reti: 0xd9 };

const NOOP_MACROS = new Set(['table_width', 'assert_table_length', 'vc_hook', 'vc_patch', 'vc_patch_end', 'vc_assert', 'assert_max_width']);
const Q = 256;                          // the fixed-point scale (the Makefile assembles with -Q8)
const unsupported = (what, line) => { throw new Error(`sm83-asm: unsupported ${what} in: ${line}`); };

/** Split on top-level commas (outside brackets, parentheses and strings). */
function splitArgs(s) {
  const out = []; let depth = 0, quote = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') quote = !quote;
    if (!quote) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim() !== '' || out.length) out.push(cur.trim());
  return out;
}

function stripComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    if (line[i] === ';' && !quote) return line.slice(0, i);
  }
  return line;
}

const TOKEN = /\s*(\d+\.\d+|\$[0-9a-fA-F]+|%[01_]+|&[0-7]+|\d[\d_]*|"(?:[^"\\]|\\.)*"|[A-Za-z_.@#][\w.@#]*(?:::|:)?|<<|>>|&&|\|\||==|!=|<=|>=|[-+*/%&|^~!<>()=,\[\]])/y;

export class Assembler {
  constructor(root) {
    this.root = root;
    this.symbols = new Map();                 // name -> { value } (constants) | { address, section } (labels)
    this.macros = new Map();
    this.sections = [];                      // { name, kind, bank, base, bytes: [] }
    this.items = [];                         // pass-1 output
    this.scope = '';                         // last global label
    this.uid = 0;
    this.constValue = 0; this.constInc = 1; this.rs = 0;
    this.section = null;
    this.charmap = new Map();
    this.hookBase = 0xf000;
    for (const [k, v] of Object.entries({ __RGBDS_MAJOR__: 1, __RGBDS_MINOR__: 0, __RGBDS_PATCH__: 4 })) this.setConst(k, v);
  }

  // ---- source reading and macro expansion ----

  read(path) {
    const out = [];
    for (const line of readFileSync(join(this.root, path), 'utf8').split('\n')) {          // a trailing backslash continues the line
      if (out.length && /\\\s*$/.test(out[out.length - 1])) out[out.length - 1] = out[out.length - 1].replace(/\\\s*$/, '') + ' ' + line.trim();
      else out.push(line);
    }
    return out;
  }

  /** Assemble a source file (relative to the repository root) in place. */
  include(path) { this.run(this.read(path), path); }

  run(lines, file = '?') {
    const stack = [{ lines, i: 0, args: [], shift: 0, file }];
    this.exec(stack);
  }

  exec(stack) {
    const frame = stack[stack.length - 1];
    const cond = [];                                     // conditional stack: { active, taken, parent }
    const active = () => cond.every((c) => c.active);
    while (frame.i < frame.lines.length) {
      const raw = frame.lines[frame.i++];
      let line = stripComment(this.substitute(raw, frame)).trim();
      if (!line) continue;
      const word = line.split(/\s+/)[0].replace(/\?$/, '');
      const lw = word.toLowerCase();
      // conditionals
      if (lw === 'if') { const on = active() ? this.truthy(line.slice(2)) : false; cond.push({ active: on, taken: on, parent: active() }); continue; }
      if (lw === 'elif') { const c = cond[cond.length - 1]; const on = c.parent && !c.taken && this.truthy(line.slice(4)); c.active = on; c.taken ||= on; continue; }
      if (lw === 'else') { const c = cond[cond.length - 1]; c.active = c.parent && !c.taken; c.taken = true; continue; }
      if (lw === 'endc') { cond.pop(); continue; }
      if (!active()) { if (lw === 'macro') this.skipBlock(frame, 'macro', 'endm'); else if (lw === 'rept' || lw === 'for') this.skipBlock(frame, 'rept', 'endr'); continue; }
      if (lw === 'macro') { this.defineMacro(line, frame); continue; }
      if (lw === 'rept' || lw === 'for') { this.repeat(line, frame, stack); continue; }
      this.statement(line, frame, stack);
    }
  }

  skipBlock(frame, open, close) {
    let depth = 1;
    while (frame.i < frame.lines.length) {
      const w = stripComment(frame.lines[frame.i++]).trim().split(/\s+/)[0].toLowerCase().replace(/\?$/, '');
      if (w === open || (open === 'rept' && w === 'for')) depth++;
      else if (w === close && --depth === 0) return;
    }
  }

  defineMacro(line, frame) {
    const name = line.split(/\s+/)[1].replace(/\?$/, '');
    const body = [];
    let depth = 1;
    while (frame.i < frame.lines.length) {
      const l = frame.lines[frame.i++];
      const w = stripComment(l).trim().split(/\s+/)[0].toLowerCase().replace(/\?$/, '');
      if (w === 'macro') depth++;
      if (w === 'endm' && --depth === 0) break;
      body.push(l);
    }
    this.macros.set(name.toLowerCase(), body);
  }

  repeat(line, frame, stack) {
    const body = [];
    let depth = 1;
    while (frame.i < frame.lines.length) {
      const l = frame.lines[frame.i++];
      const w = stripComment(l).trim().split(/\s+/)[0].toLowerCase().replace(/\?$/, '');
      if (w === 'rept' || w === 'for') depth++;
      if (w === 'endr' && --depth === 0) break;
      body.push(l);
    }
    const rest = line.replace(/^\w+\??\s*/, '');
    const sub = (variable, values) => {
      for (const v of values) {
        if (variable) this.setConst(variable, v);
        this.exec([{ lines: body, i: 0, macro: frame.macro ?? frame, file: frame.file }]);
      }
    };
    if (/^rept/i.test(line)) sub(null, Array.from({ length: this.evalNow(rest) }, () => 0));
    else {
      const [variable, ...range] = splitArgs(rest);
      const nums = range.map((r) => this.evalNow(r));
      const [start, stop, step] = nums.length === 1 ? [0, nums[0], 1] : nums.length === 2 ? [nums[0], nums[1], 1] : nums;
      const values = [];
      for (let v = start; step > 0 ? v < stop : v > stop; v += step) values.push(v);
      sub(variable, values);
    }
  }

  /** Expand \1.., \#, \@, {symbol}, _NARG in a line. */
  /** EQUS symbols are text macros: every identifier outside a string that names one is replaced by its text. */
  expandEqus(line) {
    if (!this.hasEqus) return line;
    const head = line.match(/^(\s*(?:DEF|REDEF)\s+[\w.]+\s+EQUS\b)(.*)$/i);
    if (head) return head[1] + head[2];
    let out = '', quote = false, i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== '\\') { quote = !quote; out += ch; i++; continue; }
      if (!quote && /[A-Za-z_]/.test(ch) && !/[\w.$]/.test(line[i - 1] ?? ' ')) {
        let j = i; while (j < line.length && /[\w]/.test(line[j])) j++;
        const word = line.slice(i, j), sym = this.symbols.get(word);
        if (sym?.string) { out += sym.value; i = j; continue; }
        out += word; i = j; continue;
      }
      out += ch; i++;
    }
    return out;
  }

  substitute(line, frame) {
    const owner = frame.macro ?? frame;
    if (!owner.args) return this.expandEqus(line);
    const args = owner.args.slice(owner.shift);
    let out = line.replace(/\\(\d|#|@)/g, (m, k) => (k === '#' ? args.join(', ') : k === '@' ? `_${owner.uid ?? 0}` : args[Number(k) - 1] ?? ''));
    out = out.replace(/\b_NARG\b/g, String(args.length));
    out = this.expandEqus(out);
    if (out.includes('{')) {
      out = out.replace(/\{(?:(0?)(\d*)([dxXb]):)?([\w.]+)\}/g, (m, zero, width, type, name) => {
        const sym = this.symbols.get(name);
        if (!sym || sym.value === undefined) return m;
        let text = typeof sym.value === 'number' ? sym.value.toString(type === 'x' ? 16 : type === 'X' ? 16 : type === 'b' ? 2 : 10) : String(sym.value);
        if (type === 'X') text = text.toUpperCase();
        return width ? text.padStart(Number(width), zero ? '0' : ' ') : text;
      });
    }
    return out;
  }

  // ---- statements ----

  statement(line, frame, stack) {
    // label(s)
    let m;
    while ((m = line.match(/^([A-Za-z_.][\w.@#]*)(::|:)(?!:)\s*(.*)$/))) {
      this.label(m[1]);
      line = m[3];
      if (!line) return;
    }
    if (!line) return;
    if (/^\.[\w@#]+$/.test(line)) return this.label(line);                   // a local label may omit its colon
    const parts = line.match(/^(\S+)\s*(.*)$/);
    const op = parts[1].replace(/\?$/, ''), rest = parts[2];
    const lop = op.toLowerCase();
    const args = rest ? splitArgs(rest) : [];
    if (NOOP_MACROS.has(lop)) return undefined;
    if (lop === 'shift') { const owner = frame.macro ?? frame; owner.shift += args.length ? this.evalNow(args[0]) : 1; return; }
    if (this.macros.has(lop)) return this.callMacro(lop, args, stack, frame);
    switch (lop) {
      case 'include': return this.include(args[0].slice(1, -1));
      case 'incbin': {
        const bytes = this.incbin?.(args[0].slice(1, -1));                                       // graphics the build tools make from png files
        if (bytes && args.length === 1) return this.emitData([...bytes]);
        return this.emitData(new Array(this.incbinSize(args)).fill(0));
      }
      case 'section': return this.defineSection(args);
      case 'pushs': this.sectionStack = [...(this.sectionStack ?? []), this.section]; return undefined;
      case 'pops': this.section = this.sectionStack.pop(); return undefined;
      case 'load': case 'endl': case 'assert': case 'static_assert': case 'warn': case 'purge': case 'charmap': case 'newcharmap': case 'setcharmap': case 'pushc': case 'popc': case 'opt': case 'popo': case 'pusho': return undefined;
      case 'fail': return unsupported('fail directive', line);
      case 'def': return this.def(rest);
      case 'redef': return this.def(rest);
      case 'rsreset': this.rs = 0; return undefined;
      case 'rsset': this.rs = this.evalNow(args[0]); return undefined;
      case 'db': case 'dw': case 'dl': case 'ds': return this.data(lop, args, line);
      case 'align': return undefined;
      case 'endsection': return undefined;
      case 'union': (this.unions ??= []).push({ start: this.section.pc, max: this.section.pc }); return undefined;
      case 'nextu': { const u = this.unions[this.unions.length - 1]; u.max = Math.max(u.max, this.section.pc); this.section.pc = u.start; return undefined; }
      case 'endu': { const u = this.unions.pop(); this.section.pc = Math.max(u.max, this.section.pc); return undefined; }
      default: break;
    }
    // "NAME EQU value" / "NAME = value" / "NAME rb n" at statement start were handled as labels? handle `x = y`
    if (/^[\w.]+\s*(=|\+=|-=|\|=|<<=)/.test(line)) return this.def(line);
    return this.instruction(lop, args, line);
  }

  callMacro(name, args, stack, caller) {
    const body = this.macros.get(name);
    const frame = { lines: body, i: 0, args, shift: 0, file: name, uid: ++this.uid };
    this.exec([frame]);
  }

  def(rest) {
    let m = rest.match(/^([\w.#]+)\s+(EQUS)\s+(.*)$/i);
    if (m) { this.hasEqus = true; this.symbols.set(m[1], { value: m[3].trim().replace(/^"|"$/g, ''), string: true }); return undefined; }
    m = rest.match(/^([\w.#]+)(?:\s+(EQU)\s+|\s*(=|\+=|-=|\*=|\/=|%=|\|=|&=|\^=|<<=|>>=)\s*)(.*)$/i);
    if (m) {
      const v = this.evalNow(m[4]);
      const cur = this.symbols.get(m[1])?.value ?? 0;
      const op = (m[2] ?? m[3]).toUpperCase();
      const apply = { '+=': (x, y) => x + y, '-=': (x, y) => x - y, '*=': (x, y) => x * y, '/=': (x, y) => Math.trunc(x / y), '%=': (x, y) => x % y, '|=': (x, y) => x | y, '&=': (x, y) => x & y, '^=': (x, y) => x ^ y, '<<=': (x, y) => x << y, '>>=': (x, y) => x >> y }[op];
      this.setConst(m[1], apply ? apply(cur, v) : v);
      return undefined;
    }
    m = rest.match(/^([\w.#]+)\s+(rb|rw|rl)\s*(.*)$/i);
    if (m) {
      const n = m[3] ? this.evalNow(m[3]) : 1;
      this.setConst(m[1], this.rs);
      this.rs += n * ({ rb: 1, rw: 2, rl: 4 })[m[2].toLowerCase()];
      return undefined;
    }
    return unsupported('DEF form', rest);
  }

  setConst(name, value) { this.symbols.set(name, { value }); }

  label(name) {
    const full = name.startsWith('.') ? this.scope + name : name;
    if (!name.startsWith('.')) this.scope = name;
    if (!this.section) throw new Error(`label ${full} outside a section`);
    this.symbols.set(full, { address: this.section.pc, section: this.section });
    this.items.push({ type: 'label', name: full });
  }

  defineSection(args) {
    // SECTION [UNION|FRAGMENT] "name", TYPE[addr][, BANK[n]]
    const first = args[0].replace(/^(UNION|FRAGMENT)\s+/i, '');
    const name = first.replace(/^"|"$/g, '');
    const union = /^UNION/i.test(args[0]);
    const kind = args[1].split('[')[0].trim().toUpperCase();
    const addr = args[1].includes('[') ? this.evalNow(args[1].slice(args[1].indexOf('[') + 1, args[1].lastIndexOf(']'))) : null;
    const bankArg = args.find((a) => /^BANK/i.test(a));
    const bank = bankArg ? this.evalNow(bankArg.replace(/^BANK\[|\]$/gi, '')) : 0;
    if (this.section) this.section.maxPc = Math.max(this.section.maxPc ?? 0, this.section.pc);
    const found = this.sections.find((s) => s.name === name && s.kind === kind);
    if (found && (union || /FRAGMENT/i.test(args[0]))) { this.section = found; if (union) found.pc = found.base; return; }
    const key = `${kind}:${bank}`;
    const start = { WRAM0: 0xc000, WRAMX: 0xd000, HRAM: 0xff80, VRAM: 0x8000, SRAM: 0xa000, ROM0: 0, ROMX: 0x4000 }[kind] ?? 0;
    const end = Math.max(start, ...this.sections.filter((s) => `${s.kind}:${s.bank}` === key && s.groupEnd !== undefined).map((s) => s.groupEnd), ...this.sections.filter((s) => `${s.kind}:${s.bank}` === key).map((s) => Math.max(s.maxPc ?? 0, s.pc)));
    const sec = { name, kind, union, bank: this.layout?.get(name)?.bank ?? bank, base: addr ?? this.layout?.get(name)?.base ?? end };
    sec.pc = sec.base;
    this.sections.push(sec);
    this.section = sec;
  }

  /** The size of an INCBIN: the file itself, or what the png it is built from gives (2bpp: w*h/4 bytes, 1bpp: w*h/8). Slices (`, start, length`) count. */
  incbinSize(args) {
    const path = args[0].slice(1, -1);
    if (args.length >= 3) return this.evalNow(args[2]);
    if (existsSync(join(this.root, path))) return statSync(join(this.root, path)).size - (args[1] ? this.evalNow(args[1]) : 0);
    const png = path.replace(/\.(2bpp|1bpp)$/, '.png');
    if (png !== path && existsSync(join(this.root, png))) {
      const head = readFileSync(join(this.root, png));
      return (head.readUInt32BE(16) * head.readUInt32BE(20)) / (path.endsWith('.2bpp') ? 4 : 8);
    }
    throw new Error(`sm83-asm: cannot size INCBIN ${path}`);
  }

  data(op, args, line) {
    if (op === 'ds') {
      const n = this.evalNow(args[0]);
      if (!this.isRam()) this.emitData(new Array(n).fill(args[1] === undefined ? 0 : this.evalNow(args[1])));
      else this.section.pc += n;
      return undefined;
    }
    const size = op === 'db' ? 1 : op === 'dw' ? 2 : 4;
    if (this.isRam()) { this.section.pc += size * Math.max(1, args.length); return undefined; }
    for (const a of args) {
      if (op === 'db' && /^"/.test(a)) { this.emitData([...a.slice(1, -1)].map((c) => this.charCode(c))); continue; }
      this.usedExternal = false;
      const value = this.settle(() => this.evaluate(a, true));
      this.items.push({ type: op, expr: a, value, pc: this.section.pc, section: this.section, scope: this.scope, external: this.usedExternal });
      this.section.pc += size;
    }
    return undefined;
  }

  charCode(c) { return this.charmap.get(c) ?? c.charCodeAt(0); }
  isRam() { return ['WRAM0', 'WRAMX', 'HRAM', 'VRAM', 'SRAM'].includes(this.section?.kind); }
  emitData(bytes) { for (const b of bytes) { this.items.push({ type: 'byte', value: b, pc: this.section.pc, section: this.section }); this.section.pc++; } }

  // ---- expressions ----

  truthy(expr) { return Boolean(this.evalNow(expr)); }
  evalNow(expr) { const v = this.evaluate(expr, true); return v; }

  /** Evaluate an rgbasm expression; with `strict` undefined symbols throw, otherwise they raise `Unresolved`. */
  evaluate(expr, strict = true) {
    const toks = [];
    TOKEN.lastIndex = 0;
    const s = expr.trim();
    let pos = 0;
    while (pos < s.length) {
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(s);
      if (!m) throw new Error(`sm83-asm: cannot tokenize "${expr}" at ${s.slice(pos)}`);
      toks.push(m[1]);
      pos = TOKEN.lastIndex;
    }
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const symbolValue = (name) => {
      const key = name.startsWith('.') ? this.scope + name : name;
      if (key === '@') return this.section.pc;
      (this.referenced ??= new Set()).add(key);
      if (key === '_RS') return this.rs;
      const sym = this.symbols.get(key);
      if (!sym) {
        if (strict) throw new Error(`sm83-asm: undefined symbol ${key} in "${expr}"`);
        return this.external(key);
      }
      return sym.value !== undefined ? sym.value : sym.address;
    };
    const fn = {
      LOW: (v) => v & 0xff, HIGH: (v) => (v >> 8) & 0xff, BANK: (v) => this.bankOf(v), BITWIDTH: (v) => (v === 0 ? 0 : 32 - Math.clz32(v)), DEF: undefined,
      SIN: (v) => Math.round(Math.sin((v / Q) * 2 * Math.PI) * Q), COS: (v) => Math.round(Math.cos((v / Q) * 2 * Math.PI) * Q),
      STRLEN: (v) => String(v).length, CHARLEN: (v) => String(v).length, MUL: (a, b) => Math.round((a * b) / Q), DIV: (a, b) => Math.round((a * Q) / b),
    };
    const primary = () => {
      const t = next();
      if (t === undefined) throw new Error(`sm83-asm: truncated expression "${expr}"`);
      if (t === '(') { const v = expression(0); next(); return v; }
      if (t === '-') return -primary();
      if (t === '+') return primary();
      if (t === '~') return ~primary();
      if (t === '!') return primary() ? 0 : 1;
      if (/^\$/.test(t)) return parseInt(t.slice(1), 16);
      if (/^%/.test(t)) return parseInt(t.slice(1).replace(/_/g, ''), 2);
      if (/^&/.test(t)) return parseInt(t.slice(1), 8);
      if (/^\d+\.\d+$/.test(t)) return Math.round(parseFloat(t) * Q);
      if (/^\d/.test(t)) return Number(t.replace(/_/g, ''));
      if (t.startsWith('"')) { const body = t.slice(1, -1); return body.length === 1 ? this.charCode(body) : body; }
      const upper = t.toUpperCase();
      if (peek() === '(' && (fn[upper] || upper === 'DEF')) {
        next();
        if (upper === 'BANK') { const name = next(); next(); const sym = this.symbols.get(name.startsWith('.') ? this.scope + name : name); if (!sym) this.usedExternal = true; return sym?.section?.bank ?? 1; }
        if (upper === 'DEF') { const name = next(); next(); return this.symbols.has(name.startsWith('.') ? this.scope + name : name) ? 1 : 0; }
        const a = [expression(0)];
        while (peek() === ',') { next(); a.push(expression(0)); }
        next();
        return fn[upper](...a);
      }
      return symbolValue(t.replace(/:+$/, ''));
    };
    const prec = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '|': 5, '^': 6, '&': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
    const apply = (op, a, b) => {
      if (a === undefined || b === undefined) return undefined;
      switch (op) {
        case '||': return a || b ? 1 : 0; case '&&': return a && b ? 1 : 0; case '==': return a === b ? 1 : 0; case '!=': return a !== b ? 1 : 0;
        case '<': return a < b ? 1 : 0; case '>': return a > b ? 1 : 0; case '<=': return a <= b ? 1 : 0; case '>=': return a >= b ? 1 : 0;
        case '|': return a | b; case '^': return a ^ b; case '&': return a & b; case '<<': return a << b; case '>>': return a >> b;
        case '+': return typeof a === 'string' || typeof b === 'string' ? `${a}${b}` : a + b; case '-': return a - b; case '*': return a * b;
        case '/': return Math.trunc(a / b); case '%': return a % b; default: return undefined;
      }
    };
    const expression = (min) => {
      let left = primary();
      for (;;) {
        const op = peek();
        const pr = prec[op];
        if (!pr || pr <= min) return left;
        next();
        left = apply(op, left, expression(pr));
      }
    };
    const v = expression(0);
    if (p < toks.length && toks[p] !== ',' && strict) throw new Error(`sm83-asm: trailing tokens in "${expr}"`);
    return v;
  }

  // ---- instructions ----

  instruction(op, args, line) {
    const size = this.encode(op, args, line, null);
    const pc = this.section.pc;
    this.currentPc = pc;
    this.usedExternal = false;
    const bytes = this.settle(() => { const b = []; this.encode(op, args, line, b); return b; });
    this.items.push({ type: 'inst', op, args, line, pc, section: this.section, scope: this.scope, bytes, external: this.usedExternal });
    this.section.pc += size;
  }

  /** Encode an instruction. With `out` null only the size is returned (operands may be unresolved). */
  encode(op, args, line, out) {
    const a = args.map((x) => x.trim());
    const lc = a.map((x) => x.toLowerCase().replace(/\s+/g, ''));
    const emit = (...bytes) => { if (out) out.push(...bytes); return bytes.length; };
    const val = (expr) => (out ? this.resolve(expr) : 0);
    const n8 = (expr) => val(expr) & 0xff;
    const n16 = (expr) => val(expr) & 0xffff;
    const isReg8 = (x) => x in REGS8;
    const bracket = (x) => /^\[.*\]$/.test(x.trim());
    const inner = (x) => x.trim().slice(1, -1).trim();
    if (op in SIMPLE) return emit(SIMPLE[op]);
    switch (op) {
      case 'stop': return emit(0x10, 0x00);
      case 'ret': return a.length ? emit(0xc0 | (CONDS[lc[0]] << 3)) : emit(0xc9);
      case 'rst': return emit(0xc7 | (n8(a[0]) & 0x38));
      case 'jp':
        if (lc[0] === 'hl') return emit(0xe9);
        if (a.length === 2) { const v = n16(a[1]); return emit(0xc2 | (CONDS[lc[0]] << 3), v & 0xff, v >> 8); }
        { const v = n16(a[0]); return emit(0xc3, v & 0xff, v >> 8); }
      case 'call':
        if (a.length === 2) { const v = n16(a[1]); return emit(0xc4 | (CONDS[lc[0]] << 3), v & 0xff, v >> 8); }
        { const v = n16(a[0]); return emit(0xcd, v & 0xff, v >> 8); }
      case 'jr': {
        const target = a.length === 2 ? a[1] : a[0];
        const rel = out ? this.resolve(target) - (this.pcOf() + 2) : 0;
        if (out && (rel < -128 || rel > 127)) throw new Error(`sm83-asm: jr out of range (${rel}) in ${line}`);
        return emit(a.length === 2 ? 0x20 | (CONDS[lc[0]] << 3) : 0x18, rel & 0xff);
      }
      case 'push': return emit(0xc5 | (PUSHPOP[lc[0]] << 4));
      case 'pop': return emit(0xc1 | (PUSHPOP[lc[0]] << 4));
      case 'inc': case 'dec': {
        if (lc[0] in REGS16) return emit((op === 'inc' ? 0x03 : 0x0b) | (REGS16[lc[0]] << 4));
        return emit((op === 'inc' ? 0x04 : 0x05) | (REGS8[lc[0]] << 3));
      }
      case 'add': case 'adc': case 'sub': case 'sbc': case 'and': case 'xor': case 'or': case 'cp': {
        if (op === 'add' && lc[0] === 'hl') return emit(0x09 | (REGS16[lc[1]] << 4));
        if (op === 'add' && lc[0] === 'sp') return emit(0xe8, n8(a[1]));
        const src = a.length === 2 ? a[1] : a[0];
        const ls = src.toLowerCase().replace(/\s+/g, '');
        if (isReg8(ls)) return emit(0x80 | (ALU[op] << 3) | REGS8[ls]);
        return emit(0xc6 | (ALU[op] << 3), n8(src));
      }
      case 'rlc': case 'rrc': case 'rl': case 'rr': case 'sla': case 'sra': case 'swap': case 'srl':
        return emit(0xcb, (CB[op] << 3) | REGS8[lc[0]]);
      case 'bit': case 'res': case 'set': return emit(0xcb, ({ bit: 0x40, res: 0x80, set: 0xc0 })[op] | ((out ? this.resolve(a[0]) : 0) << 3) | REGS8[lc[1]]);
      case 'ldh': {
        if (lc[0] === 'a' && lc[1] === '[c]') return emit(0xf2);
        if (lc[0] === '[c]') return emit(0xe2);
        if (lc[0] === 'a') return emit(0xf0, n8(inner(a[1])));
        return emit(0xe0, n8(inner(a[0])));
      }
      case 'ld': return this.encodeLd(a, lc, emit, n8, n16, val, line, bracket, inner, isReg8);
      default: return unsupported(`instruction ${op}`, line);
    }
  }

  encodeLd(a, lc, emit, n8, n16, val, line, bracket, inner, isReg8) {
    const [d, s] = lc;
    if (isReg8(d) && isReg8(s)) return emit(0x40 | (REGS8[d] << 3) | REGS8[s]);
    if (d === 'a' && ['[bc]', '[de]', '[hli]', '[hl+]', '[hld]', '[hl-]'].includes(s)) return emit(({ '[bc]': 0x0a, '[de]': 0x1a, '[hli]': 0x2a, '[hl+]': 0x2a, '[hld]': 0x3a, '[hl-]': 0x3a })[s]);
    if (s === 'a' && ['[bc]', '[de]', '[hli]', '[hl+]', '[hld]', '[hl-]'].includes(d)) return emit(({ '[bc]': 0x02, '[de]': 0x12, '[hli]': 0x22, '[hl+]': 0x22, '[hld]': 0x32, '[hl-]': 0x32 })[d]);
    if (d === 'sp' && s === 'hl') return emit(0xf9);
    if (d === 'hl' && /^sp[+-]/.test(s)) return emit(0xf8, n8(a[1].replace(/^sp/i, '')));
    if (d in REGS16) { const v = n16(a[1]); return emit(0x01 | (REGS16[d] << 4), v & 0xff, v >> 8); }
    if (isReg8(d) && !bracket(a[1])) return emit(0x06 | (REGS8[d] << 3), n8(a[1]));
    if (d === 'a' && bracket(a[1])) { const v = n16(inner(a[1])); return emit(0xfa, v & 0xff, v >> 8); }
    if (s === 'a' && bracket(a[0])) { const v = n16(inner(a[0])); return emit(0xea, v & 0xff, v >> 8); }
    if (d === '[nn]') return unsupported('ld', line);
    if (bracket(a[0]) && s === 'sp') { const v = n16(inner(a[0])); return emit(0x08, v & 0xff, v >> 8); }
    return unsupported('ld form', line);
  }

  bankOf() { return 1; }

  pcOf() { return this.currentPc; }

  /** A symbol the assembled sources do not define (another bank's code, say): it gets an address of its own in the hook area. */
  external(name) {
    this.externals ??= new Map();
    if (!this.externals.has(name)) this.externals.set(name, this.hookBase + this.externals.size * 4);
    this.usedExternal = true;
    return this.externals.get(name);
  }

  /** Evaluate an operand expression in pass 2. */
  resolve(expr) {
    const v = this.evaluate(expr, this.immediate);
    return typeof v === 'number' ? v : 0;
  }

  /** Try to settle an operand right away (the way rgbasm does: a DEF'd variable may change later); null when it needs a later label. */
  settle(fn) {
    this.immediate = true;
    try { return fn(); } catch (e) { if (/undefined symbol/.test(e.message)) return null; throw e; } finally { this.immediate = false; }
  }

  // ---- output ----

  /** Pass 2: evaluate every operand and lay the bytes of the ROM sections out. */
  link() {
    const image = new Map();            // address -> byte, per ROM section (flat)
    const out = { bytes: new Uint8Array(0x10000), written: new Uint8Array(0x10000), external: new Uint8Array(0x10000) };
    const put = (address, bytes) => { bytes.forEach((b, i) => { out.bytes[address + i] = b; out.written[address + i] = 1; out.external[address + i] = this.usedExternal ? 1 : 0; }); };
    let scope = '';
    for (const item of this.items) {
      if (item.type === 'label') { if (!item.name.includes('.')) scope = item.name; this.scope = scope; continue; }
      if (item.scope !== undefined) this.scope = item.scope;
      this.currentPc = item.pc;
      this.usedExternal = Boolean(item.external);
      if (item.type === 'byte') put(item.pc, [item.value & 0xff]);
      else if (item.type === 'db' || item.type === 'dw' || item.type === 'dl') {
        const v = item.value ?? this.resolve(item.expr);
        const n = item.type === 'db' ? 1 : item.type === 'dw' ? 2 : 4;
        put(item.pc, Array.from({ length: n }, (_, i) => (v >> (8 * i)) & 0xff));
      } else if (item.type === 'inst') { let bytes = item.bytes; if (!bytes) { bytes = []; this.encode(item.op, item.args, item.line, bytes); } put(item.pc, bytes); }
    }
    void image;
    return out;
  }
}

/**
 * Place the RAM sections the way the linker script (layout.link) does: `sizes` maps a section name to its size in bytes.
 * Returns name -> { kind, bank, base } for the WRAM0, WRAMX and HRAM groups.
 */
export function layoutFromLink(linkText, sizes) {
  const out = new Map();
  let group = null, next = 0;
  const starts = { WRAM0: 0xc000, WRAMX: 0xd000, HRAM: 0xff80 + 10 };            // the OAM DMA routine sits first in HRAM
  for (const raw of linkText.split('\n')) {
    const line = raw.replace(/;.*/, '').trim();
    if (!line) continue;
    const head = line.match(/^(WRAM0|WRAMX|HRAM|ROM0|ROMX|VRAM|SRAM|OAM)\b\s*(\$?\w+)?$/);
    if (head) { group = { kind: head[1], bank: head[2] ? Number(head[2]) : 0 }; next = starts[group.kind] ?? 0; continue; }
    if (!group || !(group.kind in starts)) continue;
    let m;
    if ((m = line.match(/^org\s+\$([0-9a-f]+)$/i))) next = parseInt(m[1], 16);
    else if ((m = line.match(/^align\s+(\d+)$/))) next = Math.ceil(next / 2 ** Number(m[1])) * 2 ** Number(m[1]);
    else if ((m = line.match(/^"(.*)"$/))) { out.set(m[1], { kind: group.kind, bank: group.bank, base: next }); next += sizes.get(m[1]) ?? 0; }
  }
  return out;
}

export { splitArgs };
void dirname;
