// Browser shell: input, the 60 Hz loop and drawing. The game itself lives in src/game; see src/render for drawing.
import { Game } from './src/game/engine.js';
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
const pressed = { a: false, b: false };
const buttons = { a: false, b: false };
const DIRECTION_FOR_KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
const heldDirection = () => ['down', 'up', 'left', 'right'].find((d) => [...held].some((k) => DIRECTION_FOR_KEY[k] === d)) ?? null;

window.addEventListener('keydown', (e) => {
  const key = normalizeKey(e.key);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace'].includes(e.key)) e.preventDefault();
  const action = getButtonAction(key);
  if (action) { if (!e.repeat) pressed[action] = true; buttons[action] = true; return; }
  held.add(key);
});
window.addEventListener('keyup', (e) => {
  const key = normalizeKey(e.key);
  const action = getButtonAction(key);
  if (action) buttons[action] = false; else held.delete(key);
});
window.addEventListener('blur', () => { held.clear(); buttons.a = buttons.b = false; });
document.querySelectorAll('[data-action]').forEach((button) => {
  const action = button.dataset.action;
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); pressed[action] = true; buttons[action] = true; });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, () => { buttons[action] = false; });
});
document.querySelectorAll('[data-move]').forEach((button) => {
  const key = button.dataset.move;
  button.addEventListener('pointerdown', (e) => { e.preventDefault(); held.add(key); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, (e) => { e.preventDefault(); held.delete(key); });
});

// ---- the game --------------------------------------------------------------------------------------------------
// A new game starts in the player's room (home/... NewGame: PlayersHouse2F at 3,3). Audit hook for tools/reference:
// ?map=ELMS_LAB&x=4&y=6&facing=up&scene=ElmsLab:2 opens a map at a position (after the new-game setup) with scenes set.
const query = new URLSearchParams(window.location.search);
const game = new Game({ mapId: 'PLAYERS_HOUSE_2F', x: 3, y: 3, facing: 'down' });
window.game = game;                     // for tools and debugging
if (query.get('name')) game.state.playerName = query.get('name').toUpperCase().slice(0, 7);   // naming screen is not ported

async function start() {
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
  status.textContent = 'Move with the arrow keys or WASD. A: Z, E, Enter or Space. B: X or Escape.';
  status.dataset.kind = 'hint';
  requestAnimationFrame(loop);
}

// ?manual=1: tools/reference/play drives game.update itself, so the real-time loop must not also advance it.
let manual = query.get('manual') === '1';
window.__manual = (on) => { manual = on; };
// Sprites decode on first use, so draw twice with a pause (tools screenshot a single frame).
window.__draw = async () => { await renderer.prepare(game.world); renderer.draw(game); await new Promise((r) => setTimeout(r, 80)); renderer.draw(game); };
let lastTime = 0;
let accumulator = 0;
let preparedMap = null;
function loop(now) {
  accumulator += Math.min(100, now - (lastTime || now));
  lastTime = now;
  while (!manual && accumulator >= 1000 / 60) {
    accumulator -= 1000 / 60;
    game.update({ dir: heldDirection(), a: pressed.a, b: pressed.b, aHeld: buttons.a, bHeld: buttons.b });
    pressed.a = pressed.b = false;
  }
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
