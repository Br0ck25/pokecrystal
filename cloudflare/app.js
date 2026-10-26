// Browser shell: input, the 60 Hz loop and drawing. The game itself lives in src/game; see src/render for drawing.
import { Game } from './src/game/engine.js';
import { browserSaveStore, parseSave } from './src/game/save.js';
import { Intro } from './src/game/intro.js';
import { NewGame } from './src/game/new-game.js';
import { Renderer } from './src/render/canvas.js';
import { integerRenderScale } from './src/maps/viewport.js';
import { GBC_VIEWPORT_WIDTH, GBC_VIEWPORT_HEIGHT } from './src/maps/viewport.js';
import { normalizeKey, getButtonAction } from './src/maps/input-bindings.js';
import { MAPS } from './src/generated/maps.js';

const canvas = document.querySelector('#map');
const status = document.querySelector('#status');
const screen = document.querySelector('.screen');
const renderer = new Renderer(canvas);

function showError(message) {
  status.textContent = message;
  status.dataset.kind = 'error';
  console.error('[Pokémon Crystal]', message);
}
window.addEventListener('error', (event) => showError(event.message || 'A script failed to load.'));
window.addEventListener('unhandledrejection', (event) => showError(event.reason?.message || String(event.reason)));

// Integer scaling: the backing store is an exact multiple of 160x144, shown at exactly that many device pixels.
function resize() {
  const scale = integerRenderScale(screen.clientWidth, window.devicePixelRatio);
  renderer.setScale(scale);
  const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  screen.style.aspectRatio = `${GBC_VIEWPORT_WIDTH} / ${GBC_VIEWPORT_HEIGHT}`;
}
resize();
new ResizeObserver(resize).observe(screen);

// ---- input: held directions (down, up, left, right take priority in that order) and A/B presses -----------------
const held = new Set();
const pressed = { a: false, b: false, start: false, select: false };
const buttons = { a: false, b: false, start: false, select: false };
const DIRECTION_FOR_KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
const tapped = new Set();               // directions pressed since the last frame, so a tap shorter than a frame still counts
const heldDirection = () => ['down', 'up', 'left', 'right'].find((d) => [...held, ...tapped].some((k) => DIRECTION_FOR_KEY[k] === d)) ?? null;

window.addEventListener('keydown', (e) => {
  const key = normalizeKey(e.key);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace'].includes(e.key)) e.preventDefault();
  const action = getButtonAction(key);
  if (action) { if (!e.repeat) pressed[action] = true; buttons[action] = true; return; }
  held.add(key);
  tapped.add(key);
});
window.addEventListener('keyup', (e) => {
  const key = normalizeKey(e.key);
  const action = getButtonAction(key);
  if (action) buttons[action] = false; else held.delete(key);
});
window.addEventListener('blur', () => { held.clear(); for (const name in buttons) buttons[name] = false; });
document.querySelectorAll('[data-action]').forEach((button) => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); pressed[action] = true; buttons[action] = true; });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, () => { buttons[action] = false; });
});
document.querySelectorAll('[data-move]').forEach((button) => {
  const key = button.dataset.move;
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); held.add(key); tapped.add(key); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, (e) => { e.preventDefault(); held.delete(key); });
});

// ---- the game --------------------------------------------------------------------------------------------------
// A new game starts in the player's room (home/... NewGame: PlayersHouse2F at 3,3). Audit hook for tools/reference:
// ?map=ELMS_LAB&x=4&y=6&facing=up&scene=ElmsLab:2 opens a map at a position (after the new-game setup) with scenes set.
const query = new URLSearchParams(window.location.search);
const saveStore = browserSaveStore();
// The title screen and main menu come first; the tools' hooks (?map, ?manual, ?name) go straight into a new game unless ?intro is given.
let intro = query.has('intro') || !['map', 'manual', 'name'].some((k) => query.has(k)) ? new Intro({ saveStore }) : null;
let game = null;
let starting = false;
const HINT = 'Move with the arrow keys or WASD. A: Z, E or Space. B: X or Escape. START: Enter (menu, save). SELECT: Shift.';

function newGame(state) {
  const g = new Game({ mapId: 'PLAYERS_HOUSE_2F', x: 3, y: 3, facing: 'down', saveStore, ...(state ? { state } : {}) });
  g.state.playerId ??= Math.floor(Math.random() * 0x10000);   // wPlayerID: told apart from another save file when saving
  if (query.get('name')) g.state.playerName = query.get('name').toUpperCase().slice(0, 7);   // naming screen is not ported
  return g;
}

/** Leave the main menu: `{ start: 'new' }` or `{ start: 'continue', save }` from intro.update. */
async function beginGame(choice) {
  starting = true;
  game = choice.start === 'continue' ? Game.fromSave(choice.save, { saveStore }) : newGame(choice.state);
  window.game = game;                     // for tools and debugging
  await game.ready;
  await renderer.prepare(game.world);
  intro = null;
  starting = false;
  status.textContent = HINT;
  status.dataset.kind = 'hint';
}

async function start() {
  await renderer.fontReady;
  if (intro) {
    status.textContent = 'Press START (Enter) or A to begin.';
    status.dataset.kind = 'hint';
    requestAnimationFrame(loop);
    return;
  }
  game = newGame();
  window.game = game;
  await game.ready;
  const map = query.get('map');
  if (map && MAPS[map]) {
    for (const pair of (query.get('scene') ?? '').split(',').filter(Boolean)) {
      const [name, id] = pair.split(':');
      game.state.scenes[name] = Number(id);
    }
    const x = Number(query.get('x')), y = Number(query.get('y'));
    if (Number.isInteger(x) && Number.isInteger(y)) await game.enterMap(map, x, y, query.get('facing') ?? 'down');
  }
  await renderer.prepare(game.world);
  status.textContent = HINT;
  status.dataset.kind = 'hint';
  requestAnimationFrame(loop);
}

// ---- save files: the SAVE command stores in the browser; these buttons move that file in and out -------------------
document.querySelector('#export-save').addEventListener('click', () => {
  const text = saveStore.read();
  if (!text) { status.textContent = 'Nothing to export yet: choose SAVE in the START menu first.'; status.dataset.kind = 'hint'; return; }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = `pokemon-crystal-${parseSave(text).state.playerName}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});
const importFile = document.querySelector('#import-file');
document.querySelector('#import-save').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const [file] = importFile.files;
  importFile.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    parseSave(text);                                              // refuse anything that is not a valid save before replacing the game
    saveStore.write(text);
    if (!intro) {
      game = Game.fromSave(text, { saveStore });
      window.game = game;
      await game.ready;
      await renderer.prepare(game.world);
    }
    status.textContent = intro ? 'Save imported: choose CONTINUE.' : `Loaded the save of ${game.state.playerName}.`;
    status.dataset.kind = 'hint';
  } catch (e) { showError(e.message); }
});

// ?manual=1: tools/reference/play drives game.update itself, so the real-time loop must not also advance it.
let manual = query.get('manual') === '1';
window.__manual = (on) => { manual = on; };
window.__intro = () => intro;
// Sprites decode on first use, so draw twice with a pause (tools screenshot a single frame).
window.__draw = async () => { if (intro) { renderer.drawIntro(intro); await new Promise((r) => setTimeout(r, 80)); renderer.drawIntro(intro); return; } await renderer.prepare(game.world); renderer.draw(game); await new Promise((r) => setTimeout(r, 80)); renderer.draw(game); };
/** One frame of whatever is running: the title/introduction screens or the game. */
function tick(input) {
  if (intro) {
    if (starting) return;
    const choice = intro.update(input);
    if (choice?.start === 'new') intro = new NewGame();                    // NEW GAME: the introduction first
    else if (choice) beginGame(choice.state ? { start: 'new', state: choice.state } : choice).catch((e) => showError(e.message));
  } else if (game) game.update(input);
}
window.__step = tick;                  // tools/reference drives the frames itself under ?manual=1
let lastTime = 0;
let accumulator = 0;
let preparedMap = null;
function loop(now) {
  accumulator += Math.min(100, now - (lastTime || now));
  lastTime = now;
  while (!manual && accumulator >= 1000 / 60) {
    accumulator -= 1000 / 60;
    tick({ dir: heldDirection(), a: pressed.a, b: pressed.b, start: pressed.start, select: pressed.select, aHeld: buttons.a, bHeld: buttons.b });
    for (const name in pressed) pressed[name] = false;
    tapped.clear();
  }
  if (intro) { renderer.drawIntro(intro); requestAnimationFrame(loop); return; }
  if (!game) { requestAnimationFrame(loop); return; }
  if (!game.loading && game.world.id !== preparedMap) {
    preparedMap = game.world.id;
    renderer.prepare(game.world).catch((e) => showError(e.message));
  }
  if (!game.loading) {
    renderer.draw(game);
    const lines = game.textboxOpen && game.lastTextLines ? game.lastTextLines.join(' ').trim() : '';
    if (lines && status.textContent !== lines) { status.textContent = lines; status.dataset.kind = 'dialogue'; }
  }
  requestAnimationFrame(loop);
}
start().catch((e) => showError(e.message));
