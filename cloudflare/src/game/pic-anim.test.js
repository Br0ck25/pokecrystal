import test from 'node:test';
import assert from 'node:assert/strict';
import { PicAnimation } from './pic-anim.js';
import { PIC } from '../generated/pokemon/PIDGEY.js';

test('PIDGEY normal animation: base for the setup, frame 3, the base, then three flaps, 66-odd calls', () => {
  const shown = [];
  const a = new PicAnimation({ pic: PIC });
  let frames = 0;
  while (!a.done && frames < 500) { a.update(); frames++; shown.push(a.frame); }
  assert.ok(a.done);
  assert.ok(frames > 75 && frames < 90, `took ${frames} frames`);
  assert.equal(shown[0], 0);
  assert.ok(shown.includes(3) && shown.includes(1) && shown.includes(2));
  const runs = shown.filter((f, i) => f !== shown[i - 1]);
  assert.deepEqual(runs.slice(0, 5), [0, 3, 0, 1, 2]);
});

test('slow animation is a quarter longer per frame than normal', () => {
  const length = (mode) => { const a = new PicAnimation({ pic: PIC, mode }); let n = 0; while (!a.done) { a.update(); n++; } return n; };
  assert.ok(length('slow') > length('normal'));
});
