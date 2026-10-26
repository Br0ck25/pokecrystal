import test from 'node:test';
import assert from 'node:assert/strict';
import { Assembler } from '../../../tools/sm83-asm.mjs';

const assemble = (lines) => {
  const a = new Assembler('/nonexistent');
  a.defineSection(['"t"', 'ROMX[$4000]']);
  a.run(lines);
  const out = a.link();
  return { a, bytes: [...out.bytes.subarray(0x4000, a.section.pc)] };
};

test('instructions encode as on the hardware, with forward labels and local labels', () => {
  const { bytes } = assemble([
    'Start:', '\tld a, [hli]', '\tld hl, Data', '.loop', '\tdec b', '\tjr nz, .loop', '\tcall Start', '\tldh [$ff80], a', '\tbit 7, [hl]', '\tsrl a', 'Data:', '\tdw Data', '\tdb 1, 2',
  ]);
  assert.deepEqual(bytes, [0x2a, 0x21, 0x10, 0x40, 0x05, 0x20, 0xfd, 0xcd, 0x00, 0x40, 0xe0, 0x80, 0xcb, 0x7e, 0xcb, 0x3f, 0x10, 0x40, 1, 2]);
});

test('macros expand with arguments, shift and rept, and DEF variables keep the value they had', () => {
  const { bytes } = assemble([
    'MACRO bytes', '\trept _NARG', '\t\tdb \\1', '\t\tshift', '\tendr', 'ENDM',
    '\tbytes 3, 4, 5',
    'DEF x = 7', '\tdb x', 'DEF x = 9', '\tdb x',
    'MACRO flags', '\tDEF f = \\1', '\tif _NARG > 1', '\t\tDEF f |= 1 << (\\2 + 1)', '\tendc', '\tdb f', 'ENDM',
    '\tflags 6', '\tflags 6, 1',
  ]);
  assert.deepEqual(bytes, [3, 4, 5, 7, 9, 6, 6 | 4]);
});

test('constants: const_def style counters and fixed-point sine tables (-Q8)', () => {
  const { bytes } = assemble(['\tdw sin(1 * 0.5 / 32)', '\tdb LOW($1234), HIGH($1234), (3 + 4) * 2']);
  assert.deepEqual(bytes, [25, 0, 0x34, 0x12, 14]);
});
