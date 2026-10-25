import test from 'node:test';
import assert from 'node:assert/strict';
import { Intro, TITLE_TIMER, clockView } from './intro.js';
import { titleFrame } from '../render/title-frame.js';
import { Game } from './engine.js';
import { serializeSave } from './save.js';

const memoryStore = (text = null) => ({ read: () => text, write: (t) => { text = t; } });
const run = (intro, frames, input = {}) => { let out = null; for (let i = 0; i < frames; i++) out = intro.update(input) ?? out; return out; };
const savedText = async () => {
  const g = new Game({ mapId: 'NEW_BARK_TOWN', x: 5, y: 8, facing: 'left' });
  await g.ready;
  g.state.playerName = 'GOLD';
  return serializeSave(g);
};

test('the entrance slides the logo in 4 pixels a frame and drops the crystal 2 a frame (28 frames), then the window shows', () => {
  const intro = new Intro();
  run(intro, 27);
  assert.equal(intro.title.scx, 112 - 4 * 27);
  run(intro, 1);
  assert.equal(intro.title.scx, 0);
  assert.equal(intro.title.crystalY, 6 + 16);
  assert.equal(intro.title.windowShown, false);
  run(intro, 2);
  assert.equal(intro.title.windowShown, true);
});

test('Suicune changes frame every 8 frames through four frames', () => {
  const intro = new Intro();
  const seen = [];
  for (let i = 0; i < 40; i++) { intro.update({}); seen.push(intro.title.suicune); }
  assert.deepEqual([seen[0], seen[7], seen[8], seen[16], seen[24], seen[32]], [0, 0, 1, 2, 3, 0]);
});

test('A or START leaves the title for the main menu; NEW GAME and OPTION only without a save', () => {
  const intro = new Intro({ saveStore: memoryStore() });
  run(intro, 40);
  assert.equal(intro.stage, 'title');
  run(intro, 1, { start: true });
  assert.equal(intro.stage, 'menu');
  assert.deepEqual(intro.menuItems(), ['NEW GAME', 'OPTION']);
  assert.deepEqual(run(intro, 1, { a: true }), { start: 'new' });
});

test('with a save the menu offers CONTINUE first; its info box waits 20 frames, B goes back, A loads', async () => {
  const text = await savedText();
  const intro = new Intro({ saveStore: memoryStore(text) });
  run(intro, 40, {});
  run(intro, 1, { a: true });
  assert.deepEqual(intro.menuItems(), ['CONTINUE', 'NEW GAME', 'OPTION']);
  run(intro, 1, { a: true });
  assert.equal(intro.stage, 'confirm');
  assert.equal(run(intro, 10, { a: true }), null);          // too early: the info box is still appearing
  run(intro, 11, {});
  run(intro, 1, { b: true });
  assert.equal(intro.stage, 'menu');
  run(intro, 1, { a: true });
  run(intro, 21, {});
  assert.deepEqual(run(intro, 1, { a: true }), { start: 'continue', save: text });
});

test('B in the main menu returns to the title screen; the title restarts after its timer', () => {
  const intro = new Intro();
  run(intro, 40);
  run(intro, 1, { a: true });
  run(intro, 1, { b: true });
  assert.equal(intro.stage, 'title');
  assert.equal(intro.title.scene, 'entrance');
  run(intro, 30);
  run(intro, TITLE_TIMER + 2);
  assert.equal(intro.title.scene, 'entrance');
});

test('the title picture shows the logo, Suicune and the copyright line (source images and palettes)', () => {
  const intro = new Intro();
  run(intro, 40);
  const frame = titleFrame(intro.titleState());
  const lit = (x0, y0, x1, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (frame[(y * 160 + x) * 4] + frame[(y * 160 + x) * 4 + 1] + frame[(y * 160 + x) * 4 + 2] > 0) n++; return n; };
  assert.ok(lit(0, 10, 160, 70) > 3000, 'logo');
  assert.ok(lit(40, 80, 120, 130) > 800, 'Suicune');
  assert.ok(lit(10, 136, 150, 144) > 100, 'copyright');
});

test('the main menu clock reads like MainMenu_PrintCurrentTimeAndDay', () => {
  assert.deepEqual(clockView(new Date(2026, 9, 25, 15, 5)).texts, [[1, 15, 'SUNDAY'], [4, 16, 'DAY 3:05']]);
  assert.deepEqual(clockView(new Date(2026, 9, 27, 0, 30)).texts, [[1, 15, 'TUESDAY'], [4, 16, 'NITE 12:30']]);
});
