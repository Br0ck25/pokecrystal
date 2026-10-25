import test from 'node:test';
import assert from 'node:assert/strict';
import { decompressCrystalLz, decodeGameBoy2bppTiles } from './graphics.js';

test('Crystal LZ decodes literal, iterate, alternate and zero commands', () => {
  const input = Uint8Array.from([
    0x02, 0x10, 0x20, 0x30, // literal length 3
    0x22, 0x7f,              // iterate length 3
    0x41, 0xaa, 0x55,        // alternate length 2
    0x62,                    // zeros length 3
    0xff,
  ]);
  assert.deepEqual([...decompressCrystalLz(input)], [
    0x10, 0x20, 0x30, 0x7f, 0x7f, 0x7f, 0xaa, 0x55, 0, 0, 0,
  ]);
});

test('Crystal LZ supports overlapping repeat and bit-flip lookbacks', () => {
  const repeat = Uint8Array.from([0x01, 0xaa, 0xbb, 0x83, 0x81, 0xff]);
  assert.deepEqual([...decompressCrystalLz(repeat)], [0xaa, 0xbb, 0xaa, 0xbb, 0xaa, 0xbb]);
  const flip = Uint8Array.from([0x00, 0x01, 0xa0, 0x80, 0xff]);
  assert.deepEqual([...decompressCrystalLz(flip)], [0x01, 0x80]);
});

test('Crystal LZ rejects missing terminators, truncated payloads and oversized output', () => {
  assert.throws(() => decompressCrystalLz(Uint8Array.from([0x00, 0x11])), /terminator/);
  assert.throws(() => decompressCrystalLz(Uint8Array.from([0x03, 0x11, 0xff])), /Truncated/);
  assert.throws(() => decompressCrystalLz(Uint8Array.from([0x22, 0x11, 0xff]), { maxOutputBytes: 2 }), /safety limit/);
});

test('2bpp decoder reads Game Boy bitplanes in MSB-first order', () => {
  const tile = new Uint8Array(16);
  tile[0] = 0b10000001;
  tile[1] = 0b01000010;
  const decoded = decodeGameBoy2bppTiles(tile);
  assert.equal(decoded.tileCount, 1);
  assert.equal(decoded.pixels[0], 1);
  assert.equal(decoded.pixels[1], 2);
  assert.equal(decoded.pixels[6], 2);
  assert.equal(decoded.pixels[7], 1);
  assert.throws(() => decodeGameBoy2bppTiles(new Uint8Array(15)), /multiple of 16/);
});
