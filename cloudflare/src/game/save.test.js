import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './engine.js';
import { startMenuItems, saveInfoView } from './menu.js';
import { parseSave, serializeSave } from './save.js';
import { createScriptState } from '../script/interpreter.js';

const memoryStore = () => { let text = null; return { read: () => text, write: (t) => { text = t; }, peek: () => text }; };
const newGame = async (store, extra = {}) => {
  const g = new Game({ mapId: 'NEW_BARK_TOWN', x: 5, y: 8, facing: 'left', saveStore: store, ...extra });
  await g.ready;
  return g;
};
const run = (g, frames, input = {}) => { for (let i = 0; i < frames; i++) g.update(input); };
/** Press A (or B) whenever the game waits for a button, until the runner ends. */
const finishFlow = (g, answers = []) => {
  for (let i = 0; i < 3000 && g.runner; i++) {
    const wait = g.runner.wait;
    const yes = wait?.kind === 'yesno';
    g.update({ a: Boolean(wait && (wait.kind === 'button' || yes || (wait.kind === 'text' && wait.ready))), dir: yes && answers[0] === 'no' ? 'down' : null });
    if (yes && answers.length) answers.shift();
  }
};

test('the start menu lists items as StartMenu.SetUpMenuItems does (no dex, no party, no gear at the start)', () => {
  const state = createScriptState();
  assert.deepEqual(startMenuItems(state), ['PACK', 'STATUS', 'SAVE', 'OPTION', 'EXIT']);
  state.engineFlags.add('ENGINE_POKEGEAR'); state.engineFlags.add('ENGINE_POKEDEX'); state.party.push({ species: 'CYNDAQUIL' });
  assert.deepEqual(startMenuItems(state), ['POKEDEX', 'POKEMON', 'PACK', 'POKEGEAR', 'STATUS', 'SAVE', 'OPTION', 'EXIT']);
});

test('START opens the menu, the cursor wraps, B closes it, and the cursor is remembered', async () => {
  const g = await newGame(memoryStore());
  run(g, 1, { start: true });
  assert.equal(g.menu.cursor, 0);
  run(g, 1, { dir: 'up' });
  assert.equal(g.menu.cursor, 4);                       // wraps to EXIT
  run(g, 1, {});
  run(g, 1, { b: true });
  assert.equal(g.menu, null);
  run(g, 1, { start: true });
  assert.equal(g.menu.cursor, 4);
  run(g, 1, { start: true });
  assert.equal(g.menu, null);                           // START closes it too
});

test('SAVE asks, saves, leaves the menu; declining returns to it; Continue restores the game', async () => {
  const store = memoryStore();
  const g = await newGame(store);
  g.state.flags.add('EVENT_GOT_A_POKEMON_FROM_ELM');
  g.state.items.POTION = 3;
  run(g, 1, { start: true });
  for (let i = 0; i < 2; i++) { run(g, 1, { dir: 'down' }); run(g, 1, {}); }
  assert.equal(startMenuItems(g.state)[g.menu.cursor], 'SAVE');
  run(g, 1, { a: true });
  assert.equal(g.savingInfo, true);
  finishFlow(g, ['no']);
  assert.equal(store.peek(), null);
  assert.ok(g.menu && !g.menu.hollow && !g.savingInfo, 'back in the menu');
  run(g, 1, { a: true });
  finishFlow(g);
  assert.equal(g.menu, null);
  assert.ok(store.peek());
  const copy = await Game.fromSave(store.peek(), { saveStore: store });
  await copy.ready;
  assert.deepEqual([copy.world.id, copy.player.x, copy.player.y, copy.player.facing], ['NEW_BARK_TOWN', 5, 8, 'left']);
  assert.equal(copy.state.flags.has('EVENT_GOT_A_POKEMON_FROM_ELM'), true);
  assert.equal(copy.state.items.POTION, 3);
});

test('saving over an existing file asks first (another save file when the player ID differs)', async () => {
  const store = memoryStore();
  const first = await newGame(store, { state: createScriptState({ playerId: 1 }) });
  store.write(serializeSave(first));
  const g = await newGame(store, { state: createScriptState({ playerId: 2 }) });
  run(g, 1, { start: true });
  g.startSave();
  const seen = [];
  for (let i = 0; i < 3000 && g.runner; i++) {
    const wait = g.runner.wait;
    if (wait?.kind === 'text' && wait.ready) seen.push(wait.screens[0].lines.join(' '));
    g.update({ a: Boolean(wait && (wait.kind === 'yesno' || (wait.kind === 'text' && wait.ready))) });
  }
  assert.ok(seen.includes('There is another save file. Is it'), seen.join('|'));
  assert.equal(parseSave(store.read()).state.playerId, 2);
});

test('the save-info box shows badges and play time', () => {
  const state = createScriptState({ playFrames: 3600 * 61 + 5 });
  state.engineFlags.add('ENGINE_ZEPHYRBADGE');
  const texts = saveInfoView(state).texts.map((t) => t.join('@'));
  assert.ok(texts.includes('17@4@ 1'), texts.join('|'));
  assert.ok(texts.includes('13@8@  1<COLON>01'), texts.join('|'));
});

test('damaged or foreign files are refused', () => {
  assert.throws(() => parseSave('nonsense'), /not a save file/);
  assert.throws(() => parseSave('{"version":99}'), /different version/);
  assert.throws(() => parseSave('{"version":1,"mapId":"NOPE"}'), /damaged/);
});
