import test from 'node:test';
import assert from 'node:assert/strict';
import { CRYSTAL_OVERWORLD_SPRITES } from './assets/overworld-sprites.js';

test('New Bark Town uses embedded original 16x96 Crystal overworld sprite sheets', () => {
  for (const name of ['KRIS', 'TEACHER', 'FISHER', 'RIVAL']) {
    const encoded = CRYSTAL_OVERWORLD_SPRITES[name];
    assert.ok(encoded, `missing source sprite ${name}`);
    const png = Buffer.from(encoded, 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} PNG signature`);
    assert.equal(png.readUInt32BE(16), 16, `${name} sprite width`);
    assert.equal(png.readUInt32BE(20), 96, `${name} sprite sheet height`);
  }
});
