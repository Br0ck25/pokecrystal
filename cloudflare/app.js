import { NEW_BARK_TOWN, eventsAt as newBarkEventsAt } from './src/maps/new-bark-town.js';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile } from './src/maps/new-bark-town-blocks.js';
import { ELMS_LAB, elmLabEventsAt } from './src/maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile } from './src/maps/elms-lab-blocks.js';
import { JOHTO_METATILE_TILES } from './src/maps/johto-metatiles.js';
import { JOHTO_TILESET_PNG_BASE64 } from './src/assets/johto-tileset.js';
import { canPreviewEnter } from './src/maps/new-bark-town-movement.js';
import { resolvePreviewWarp } from './src/maps/preview-warps.js';
import { PLAYERS_HOUSE_1F, playersHouse1fEventsAt } from './src/maps/players-house-1f.js';
import { PLAYERS_HOUSE_1F_BLOCK_IDS, getPlayersHouse1FCollisionAtMetatile } from './src/maps/players-house-1f-blocks.js';
import { PLAYERS_HOUSE_2F, playersHouse2fEventsAt } from './src/maps/players-house-2f.js';
import { PLAYERS_HOUSE_2F_BLOCK_IDS, getPlayersHouse2FCollisionAtMetatile } from './src/maps/players-house-2f-blocks.js';
import { ELMS_HOUSE, elmsHouseEventsAt } from './src/maps/elms-house.js';
import { ELMS_HOUSE_BLOCK_IDS, getElmsHouseCollisionAtMetatile } from './src/maps/elms-house-blocks.js';
import { PLAYERS_NEIGHBORS_HOUSE, playersNeighborsHouseEventsAt } from './src/maps/players-neighbors-house.js';
import { PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, getPlayersNeighborsHouseCollisionAtMetatile } from './src/maps/players-neighbors-house-blocks.js';

const canvas = document.querySelector('#map');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const status = document.querySelector('#status');
const source = new Image();
source.src = 'data:image/png;base64,' + JOHTO_TILESET_PNG_BASE64;
const TILE = 16;
const maps = {
  NEW_BARK_TOWN: {
    metadata: NEW_BARK_TOWN,
    blocks: NEW_BARK_TOWN_BLOCK_IDS,
    collisionAt: getNewBarkTownCollisionAtMetatile,
    eventsAt: newBarkEventsAt,
    title: 'New Bark Town',
  },
  ELMS_LAB: {
    metadata: ELMS_LAB,
    blocks: ELMS_LAB_BLOCK_IDS,
    collisionAt: getElmsLabCollisionAtMetatile,
    eventsAt: elmLabEventsAt,
    title: "Professor Elm's Laboratory",
  },
  PLAYERS_HOUSE_1F: { metadata: PLAYERS_HOUSE_1F, blocks: PLAYERS_HOUSE_1F_BLOCK_IDS, collisionAt: getPlayersHouse1FCollisionAtMetatile, eventsAt: playersHouse1fEventsAt, title: "Your House · 1F" },
  PLAYERS_HOUSE_2F: { metadata: PLAYERS_HOUSE_2F, blocks: PLAYERS_HOUSE_2F_BLOCK_IDS, collisionAt: getPlayersHouse2FCollisionAtMetatile, eventsAt: playersHouse2fEventsAt, title: "Your House · 2F" },
  ELMS_HOUSE: { metadata: ELMS_HOUSE, blocks: ELMS_HOUSE_BLOCK_IDS, collisionAt: getElmsHouseCollisionAtMetatile, eventsAt: elmsHouseEventsAt, title: "Professor Elm's House" },
  PLAYERS_NEIGHBORS_HOUSE: { metadata: PLAYERS_NEIGHBORS_HOUSE, blocks: PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, collisionAt: getPlayersNeighborsHouseCollisionAtMetatile, eventsAt: playersNeighborsHouseEventsAt, title: "Neighbor's House (layout placeholder)" },
};
let currentMapId = 'NEW_BARK_TOWN';
const state = { x: 9, y: 8, facing: 'down' };
const keys = new Set();
let lastStep = 0;

function activeMap() { return maps[currentMapId]; }
function resizeCanvasForMap() {
  const d = activeMap().metadata.dimensions;
  canvas.width = d.metatilesWide * TILE;
  canvas.height = d.metatilesHigh * TILE;
}
function setHint(text) {
  status.textContent = text;
  status.dataset.kind = 'hint';
}
function drawMap() {
  const current = activeMap();
  const d = current.metadata.dimensions;
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let by = 0; by < d.blocksHigh; by++) {
    for (let bx = 0; bx < d.blocksWide; bx++) {
      const blockId = current.blocks[by * d.blocksWide + bx];
      const tiles = JOHTO_METATILE_TILES[blockId];
      if (!tiles) continue;
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const id = tiles[ty * 4 + tx];
        const sx = (id % 16) * 8, sy = Math.floor(id / 16) * 8;
        ctx.drawImage(source, sx, sy, 8, 8, bx * 32 + tx * 8, by * 32 + ty * 8, 8, 8);
      }
    }
  }
}
function drawPlayer() {
  const x = state.x * TILE, y = state.y * TILE;
  ctx.fillStyle = '#111827'; ctx.fillRect(x + 3, y + 2, 10, 13);
  ctx.fillStyle = '#f1c7a5'; ctx.fillRect(x + 5, y + 3, 6, 6);
  ctx.fillStyle = '#7b3f21'; ctx.fillRect(x + 4, y + 1, 8, 3);
  ctx.fillStyle = '#b72c38'; ctx.fillRect(x + 4, y + 9, 8, 4);
  ctx.fillStyle = '#284d9b'; ctx.fillRect(x + 4, y + 13, 3, 3); ctx.fillRect(x + 9, y + 13, 3, 3);
  ctx.fillStyle = '#202020';
  if (state.facing === 'down') { ctx.fillRect(x + 6, y + 5, 1, 1); ctx.fillRect(x + 9, y + 5, 1, 1); }
  else if (state.facing === 'left') ctx.fillRect(x + 5, y + 5, 2, 1);
  else if (state.facing === 'right') ctx.fillRect(x + 9, y + 5, 2, 1);
  else ctx.fillRect(x + 6, y + 3, 4, 1);
}
function draw() {
  if (!source.complete || !source.naturalWidth) return;
  drawMap();
  drawPlayer();
}
function blocked(x, y) {
  const d = activeMap().metadata.dimensions;
  return !canPreviewEnter(x, y, d.metatilesWide, d.metatilesHigh, activeMap().collisionAt);
}
function eventsAtFacing() {
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.facing];
  if (!delta) return [];
  return activeMap().eventsAt(state.x + delta[0], state.y + delta[1]);
}
function interact() {
  const event = eventsAtFacing().find(item => item.type === 'background' || item.type === 'object');
  if (!event) {
    setHint('Nothing to interact with here.');
    return;
  }
  if (currentMapId === 'NEW_BARK_TOWN') {
    if (event.type === 'background') {
      status.textContent = event.text || 'A sign.';
      status.dataset.kind = 'dialogue';
      return;
    }
    status.textContent = (event.dialogue || ['…']).join('\n');
    status.dataset.kind = 'dialogue';
    return;
  }
  if (event.type === 'background') {
    status.textContent = event.text || 'There is something here.';
    status.dataset.kind = 'dialogue';
    return;
  }
  if (event.type === 'object') {
    status.textContent = (event.dialogue || [event.script || event.id || '…']).join('\n');
    status.dataset.kind = 'dialogue';
    return;
  }
  // Keep unported lab scripts explicit instead of inventing their stateful behavior.
  const label = event.label || event.script || 'Object';
  status.textContent = label + '\nOriginal script not yet implemented: ' + event.script;
  status.dataset.kind = 'dialogue';
}
function pressB() {
  if (status.dataset.kind === 'dialogue') setHint(activeMap().title + ' · Press A to interact; B closes this text.');
  else setHint('There is nothing to cancel right now.');
}
function transition(warp) {
  const landing = resolvePreviewWarp(currentMapId, warp);
  if (!landing || !maps[landing.mapId]) {
    setHint('This destination has not been ported yet: ' + (warp?.destinationMap || 'unknown'));
    return;
  }
  currentMapId = landing.mapId;
  state.x = landing.x;
  state.y = landing.y;
  state.facing = landing.facing;
  resizeCanvasForMap();
  draw();
  setHint('Entered ' + activeMap().title + '. Map transition is implemented; original story scripts are still in progress.');
}
function step(dx, dy, face) {
  state.facing = face;
  const nx = state.x + dx, ny = state.y + dy;
  if (blocked(nx, ny)) { draw(); return; }
  state.x = nx; state.y = ny;
  const warp = activeMap().metadata.warps.find(w => w.x === nx && w.y === ny);
  if (warp) { transition(warp); return; }
  draw();
  setHint(activeMap().title + ' · ' + (nx + 1) + ', ' + (ny + 1) + ' · Press A to interact');
}
function frame(now) {
  if (now - lastStep > 130) {
    const dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    const dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
    if (dx || dy) {
      lastStep = now;
      step(dx, dy, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace'].includes(e.key)) e.preventDefault();
  if (!e.repeat && [' ', 'Enter', 'z', 'Z', 'e', 'E'].includes(e.key)) { interact(); return; }
  if (!e.repeat && ['x', 'X', 'Escape', 'Backspace'].includes(e.key)) { pressB(); return; }
  keys.add(e.key);
});
document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'a') interact();
    if (button.dataset.action === 'b') pressB();
  });
});
document.querySelectorAll('[data-move]').forEach(button => {
  const key = button.dataset.move;
  const down = event => { event.preventDefault(); keys.add(key); };
  const up = event => { event.preventDefault(); keys.delete(key); };
  button.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, up);
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('blur', () => keys.clear());
source.addEventListener('load', () => {
  resizeCanvasForMap();
  draw();
  setHint('Move with arrows / WASD. Face a sign or person, then press A.');
});
source.addEventListener('error', () => { status.textContent = 'Could not load the source tileset image.'; });
resizeCanvasForMap();
draw();
requestAnimationFrame(frame);
