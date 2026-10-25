import { NEW_BARK_TOWN, eventsAt as newBarkEventsAt } from './src/maps/new-bark-town.js';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile } from './src/maps/new-bark-town-blocks.js';
import { ELMS_LAB, elmLabEventsAt } from './src/maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile } from './src/maps/elms-lab-blocks.js';
import { JOHTO_METATILE_TILES } from './src/maps/johto-metatiles.js';
import { CRYSTAL_OVERWORLD_SPRITES } from './src/assets/overworld-sprites.js';
import { JOHTO_TILESET_PNG_BASE64 } from './src/assets/johto-tileset.js';
import { HOUSE_METATILE_TILES } from './src/maps/house-metatiles.js';
import { LAB_METATILE_TILES } from './src/maps/lab-metatiles.js';
import { PLAYERS_HOUSE_METATILE_TILES } from './src/maps/players-house-metatiles.js';
import { PLAYERS_ROOM_METATILE_TILES } from './src/maps/players-room-metatiles.js';
import { HOUSE_TILESET_PNG_BASE64 } from './src/assets/house-tileset.js';
import { LAB_TILESET_PNG_BASE64 } from './src/assets/lab-tileset.js';
import { PLAYERS_HOUSE_TILESET_PNG_BASE64 } from './src/assets/players_house-tileset.js';
import { PLAYERS_ROOM_TILESET_PNG_BASE64 } from './src/assets/players_room-tileset.js';
import { TILESET_PALETTE_LABELS, CRYSTAL_PALETTES } from './src/maps/tileset-palette-data.js';
import { canPreviewEnterOrWarp } from './src/maps/new-bark-town-movement.js';
import { GBC_VIEWPORT_WIDTH, GBC_VIEWPORT_HEIGHT, getCameraTransform } from './src/maps/viewport.js';
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
let bootErrorReported = false;
function reportBootError(message) {
  bootErrorReported = true;
  if (status) {
    status.dataset.kind = 'dialogue';
    status.textContent = 'The game encountered a startup error. ' + message + ' Refresh the page after the latest deployment finishes.';
  }
  console.error('[Pokémon Crystal preview]', message);
}
window.addEventListener('error', event => reportBootError(event.message || 'A script failed to load.'));
window.addEventListener('unhandledrejection', event => reportBootError(event.reason?.message || String(event.reason || 'An unexpected error occurred.')));
const tileSources = {};
const renderedTilesets = {};
const overworldSpriteImages = {};
for (const [name, base64] of Object.entries(CRYSTAL_OVERWORLD_SPRITES)) {
  const image = new Image();
  image.onload = () => { overworldSpriteImages[name] = image; draw(); };
  image.onerror = () => console.error('[Pokémon Crystal preview] Could not decode source sprite:', name);
  image.src = 'data:image/png;base64,' + base64;
}
const paletteMapKey = { JOHTO: 'johto', HOUSE: 'house', LAB: 'lab', PLAYERS_HOUSE: 'players_house', PLAYERS_ROOM: 'players_room' };
function colorizeTileset(image, tileset) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const paletteKey = paletteMapKey[tileset];
  const tilePalettes = TILESET_PALETTE_LABELS[paletteKey];
  const paletteSet = tileset === 'JOHTO' ? CRYSTAL_PALETTES.day : CRYSTAL_PALETTES.indoor;
  if (!tilePalettes || !paletteSet) return image;
  const colorCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!colorCtx || !canvas.width || !canvas.height) return image;
  colorCtx.drawImage(image, 0, 0);
  const frame = colorCtx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (frame.data[i + 3] === 0) continue;
      const tileIndex = Math.floor(y / 8) * 16 + Math.floor(x / 8);
      const bank = tileIndex >= 96 ? 1 : 0;
      const paletteName = tilePalettes[bank]?.[tileIndex % 96] || 'GRAY';
      const shades = paletteSet[paletteName] || paletteSet.GRAY;
      const luminance = (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
      const shade = Math.max(0, Math.min(3, Math.round((255 - luminance) / 85)));
      const rgb = shades[shade];
      frame.data[i] = rgb[0]; frame.data[i + 1] = rgb[1]; frame.data[i + 2] = rgb[2];
    }
  }
  colorCtx.putImageData(frame, 0, 0);
  return canvas;
}
for (const [tileset, base64] of Object.entries({
  JOHTO: JOHTO_TILESET_PNG_BASE64,
  HOUSE: HOUSE_TILESET_PNG_BASE64,
  LAB: LAB_TILESET_PNG_BASE64,
  PLAYERS_HOUSE: PLAYERS_HOUSE_TILESET_PNG_BASE64,
  PLAYERS_ROOM: PLAYERS_ROOM_TILESET_PNG_BASE64,
})) {
  const image = new Image();
  image.onload = () => {
    try {
      renderedTilesets[tileset] = colorizeTileset(image, tileset);
      draw();
      if (!bootErrorReported && renderedTilesets[activeMap().metadata.tileset]) {
        setHint('Move with arrows / WASD. Face a person or object, then press A.');
      }
    } catch (error) {
      renderedTilesets[tileset] = image;
      draw();
      reportBootError('Palette processing failed; showing the unmodified source tiles. ' + (error?.message || error));
    }
  };
  image.onerror = () => reportBootError('The embedded ' + tileset + ' tileset image could not be decoded.');
  image.src = 'data:image/png;base64,' + base64;
  tileSources[tileset] = image;
}
const metatilesByTileset = {
  JOHTO: JOHTO_METATILE_TILES,
  HOUSE: HOUSE_METATILE_TILES,
  LAB: LAB_METATILE_TILES,
  PLAYERS_HOUSE: PLAYERS_HOUSE_METATILE_TILES,
  PLAYERS_ROOM: PLAYERS_ROOM_METATILE_TILES,
};
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
  PLAYERS_NEIGHBORS_HOUSE: { metadata: PLAYERS_NEIGHBORS_HOUSE, blocks: PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS, collisionAt: getPlayersNeighborsHouseCollisionAtMetatile, eventsAt: playersNeighborsHouseEventsAt, title: "Neighbor's House " },
};
let currentMapId = 'NEW_BARK_TOWN';
const state = { x: 9, y: 8, facing: 'down', starter: null, elmTalked: false };
const keys = new Set();
let lastStep = 0;

function activeMap() { return maps[currentMapId]; }
function resizeCanvasForMap() {
  // Crystal's Game Boy Color display is 160x144 pixels. Keep this viewport fixed
  // on every map and scroll the world behind it instead of shrinking maps to fit.
  canvas.width = GBC_VIEWPORT_WIDTH;
  canvas.height = GBC_VIEWPORT_HEIGHT;
  const screen = document.querySelector('.screen');
  if (screen) screen.style.aspectRatio = `${GBC_VIEWPORT_WIDTH} / ${GBC_VIEWPORT_HEIGHT}`;
}
function setHint(text) {
  status.textContent = text;
  status.dataset.kind = 'hint';
}
function drawMap() {
  const current = activeMap();
  const d = current.metadata.dimensions;
  const tileset = current.metadata.tileset;
  const source = renderedTilesets[tileset];
  const metatiles = metatilesByTileset[tileset];
  if (!source || !metatiles) return;
  for (let by = 0; by < d.blocksHigh; by++) {
    for (let bx = 0; bx < d.blocksWide; bx++) {
      const blockId = current.blocks[by * d.blocksWide + bx];
      const tiles = metatiles[blockId];
      if (!tiles) continue;
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const id = tiles[ty * 4 + tx];
        const sx = (id % 16) * 8, sy = Math.floor(id / 16) * 8;
        ctx.drawImage(source, sx, sy, 8, 8, bx * 32 + tx * 8, by * 32 + ty * 8, 8, 8);
      }
    }
  }
}
function drawSourceSprite(name, x, y, facing = 'down', flip = false) {
  const image = overworldSpriteImages[name];
  if (!image || image.naturalWidth < 16 || image.naturalHeight < 96) return false;
  // The source sheets are six 16x16 poses: down, up, and side, each with
  // alternating walk frames. Static event sprites use frame zero.
  const row = facing === 'up' ? 2 : facing === 'left' || facing === 'right' ? 4 : 0;
  ctx.save();
  if (flip) {
    ctx.translate(x + TILE, y);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
  } else {
    ctx.drawImage(image, 0, row * TILE, TILE, TILE, x, y, TILE, TILE);
  }
  ctx.restore();
  return true;
}
function drawPlayer() {
  const x = state.x * TILE, y = state.y * TILE;
  if (drawSourceSprite('KRIS', x, y, state.facing, state.facing === 'right')) return;
  // Visible fallback if an embedded source sprite fails to decode.
  ctx.fillStyle = '#111827'; ctx.fillRect(x + 3, y + 2, 10, 13);
  ctx.fillStyle = '#f1c7a5'; ctx.fillRect(x + 5, y + 3, 6, 6);
  ctx.fillStyle = '#7b3f21'; ctx.fillRect(x + 4, y + 1, 8, 3);
  ctx.fillStyle = '#b72c38'; ctx.fillRect(x + 4, y + 9, 8, 4);
  ctx.fillStyle = '#284d9b'; ctx.fillRect(x + 4, y + 13, 3, 3); ctx.fillRect(x + 9, y + 13, 3, 3);
}
function drawNpc(object) {
  const x = object.x * TILE, y = object.y * TILE;
  const sourceId = String(object.id || '').toUpperCase();
  if (sourceId.includes('TEACHER') && drawSourceSprite('TEACHER', x, y, 'down')) return;
  if (sourceId.includes('FISHER') && drawSourceSprite('FISHER', x, y, 'down')) return;
  if (sourceId.includes('RIVAL') && drawSourceSprite('RIVAL', x, y, 'right', true)) return;
  const id = String(object.id || object.script || '').toUpperCase();
  if (id.includes('CONSOLE')) {
    ctx.fillStyle = '#24242b'; ctx.fillRect(x + 1, y + 4, 14, 9);
    ctx.fillStyle = '#9aa3af'; ctx.fillRect(x + 3, y + 2, 10, 3);
    ctx.fillStyle = '#cf3547'; ctx.fillRect(x + 4, y + 6, 2, 2);
    ctx.fillStyle = '#4a79d0'; ctx.fillRect(x + 9, y + 6, 2, 2);
    return;
  }
  if (id.includes('DOLL')) {
    ctx.fillStyle = '#553b54'; ctx.fillRect(x + 4, y + 3, 8, 10);
    ctx.fillStyle = id.includes('2') ? '#80a7d7' : '#e7a8ba'; ctx.fillRect(x + 3, y + 5, 10, 6);
    ctx.fillStyle = '#f1d0b0'; ctx.fillRect(x + 5, y + 1, 6, 5);
    ctx.fillStyle = '#30252a'; ctx.fillRect(x + 6, y + 3, 1, 1); ctx.fillRect(x + 9, y + 3, 1, 1);
    return;
  }
  if (id.includes('POKE_BALL')) {
    const color = id.endsWith('1') ? '#d83b45' : id.endsWith('2') ? '#2679cf' : '#66a84f';
    ctx.fillStyle = '#202020'; ctx.fillRect(x + 3, y + 4, 10, 9);
    ctx.fillStyle = '#e6e7e8'; ctx.fillRect(x + 4, y + 3, 8, 5);
    ctx.fillStyle = color; ctx.fillRect(x + 4, y + 8, 8, 4);
    ctx.fillStyle = '#202020'; ctx.fillRect(x + 3, y + 7, 10, 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 7, y + 7, 3, 3);
    return;
  }
  const palette = id.includes('ELM') ? ['#f1c9a5','#d8dce4','#557bba','#7a4b2a']
    : id.includes('AIDE') || id.includes('SCIENTIST') ? ['#efc5a3','#e7e9ed','#b9c3d3','#514f5a']
    : id.includes('OFFICER') || id.includes('COP') ? ['#efc5a3','#263b69','#2d4e86','#202020']
    : id.includes('MOM') || id.includes('WIFE') ? ['#efc5a3','#bd4b6b','#e7d9e8','#65452f']
    : id.includes('DAUGHTER') || id.includes('SON') ? ['#efc5a3','#e8c75d','#4e8a72','#5a3828']
    : id.includes('RIVAL') ? ['#efc5a3','#7d405b','#35343c','#6a4834']
    : ['#efc5a3','#d7d9dc','#548b70','#594332'];
  ctx.fillStyle = '#25232a'; ctx.fillRect(x + 3, y + 1, 10, 14);
  ctx.fillStyle = palette[0]; ctx.fillRect(x + 5, y + 2, 6, 6);
  ctx.fillStyle = palette[3]; ctx.fillRect(x + 4, y + 1, 8, 3);
  ctx.fillStyle = palette[1]; ctx.fillRect(x + 4, y + 8, 8, 5);
  ctx.fillStyle = palette[2]; ctx.fillRect(x + 4, y + 13, 3, 3); ctx.fillRect(x + 9, y + 13, 3, 3);
  ctx.fillStyle = '#272727'; ctx.fillRect(x + 6, y + 5, 1, 1); ctx.fillRect(x + 9, y + 5, 1, 1);
}
function drawObjects() {
  for (const object of activeMap().metadata.objects || []) {
    if (object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starter) continue;
    if (object.id === 'ELMSLAB_OFFICER' && state.starter) continue;
    if (object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter) continue;
    drawNpc(object);
  }
}
function draw() {
  if (!ctx || !activeMap()) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!renderedTilesets[activeMap().metadata.tileset]) {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#202020';
    ctx.font = '12px sans-serif';
    ctx.fillText('Loading map graphics…', 12, 24);
    return;
  }
  const d = activeMap().metadata.dimensions;
  const camera = getCameraTransform(d.metatilesWide, d.metatilesHigh, state.x, state.y);
  ctx.save();
  ctx.translate(camera.originX - camera.cameraX, camera.originY - camera.cameraY);
  drawMap();
  drawObjects();
  drawPlayer();
  ctx.restore();
}
function blocked(x, y) {
  const current = activeMap();
  const d = current.metadata.dimensions;
  return !canPreviewEnterOrWarp(
    x, y, d.metatilesWide, d.metatilesHigh, current.collisionAt, current.metadata.warps,
  );
}
function eventsAtFacing() {
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[state.facing];
  if (!delta) return [];
  return activeMap().eventsAt(state.x + delta[0], state.y + delta[1]);
}
function showDialogue(speaker, text) {
  status.textContent = speaker + "\n" + text;
  status.dataset.kind = 'dialogue';
}
function interact() {
  const event = eventsAtFacing().find(item => item.type === 'background' || item.type === 'object');
  if (!event) {
    setHint('Nothing to interact with here.');
    return;
  }
  if (currentMapId === 'ELMS_LAB' && event.type === 'object' && event.id === 'ELMSLAB_ELM') {
    if (!state.elmTalked) {
      state.elmTalked = true;
      showDialogue('PROF. ELM', "Hi! I'm waiting for you.\nChoose one of the three POKéMON on the table.");
    } else if (!state.starter) {
      showDialogue('PROF. ELM', 'Go ahead! Choose the POKéMON you like best.');
    } else {
      showDialogue('PROF. ELM', 'Take good care of your ' + state.starter + '!');
    }
    return;
  }
  if (currentMapId === 'ELMS_LAB' && event.type === 'object' && event.id?.startsWith('ELMSLAB_POKE_BALL')) {
    if (state.starter) { showDialogue('POKé BALL', 'You already chose ' + state.starter + '.'); return; }
    state.starter = event.id.endsWith('1') ? 'CYNDAQUIL' : event.id.endsWith('2') ? 'TOTODILE' : 'CHIKORITA';
    showDialogue('PROF. ELM', 'You chose ' + state.starter + '!\nTake good care of it.');
    draw();
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
    const sourceTexts = {
      ElmsLabHealingMachine: 'A healing machine for POKéMON.',
      ElmsLabBookshelf: 'A bookshelf full of research books.',
      ElmsLabTravelTip1: 'Travel Tip: Press START to open the menu.',
      ElmsLabTravelTip2: 'Travel Tip: Check your POKéMON status.',
      ElmsLabTravelTip3: 'Travel Tip: You can save your progress from the menu.',
      ElmsLabTravelTip4: 'Travel Tip: Talk to people to learn about POKéMON.',
      ElmsLabTrashcan: 'The trash can is empty.',
      ElmsLabWindow: 'The sunlight streams in through the window.',
      ElmsLabPC: 'The PC is turned on. There are emails from researchers.',
    };
    const message = event.text || sourceTexts[event.script] || 'There is something here.';
    status.textContent = message;
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
  const landing = resolvePreviewWarp(currentMapId, warp, maps);
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
  setHint('Entered ' + activeMap().title + '. Talk to characters and inspect objects with A.');
}
function step(dx, dy, face) {
  state.facing = face;
  const nx = state.x + dx, ny = state.y + dy;
  const occupied = (activeMap().metadata.objects || []).some(object => object.x === nx && object.y === ny
    && !(object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starter)
    && !(object.id === 'ELMSLAB_OFFICER' && state.starter)
    && !(object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter));
  if (blocked(nx, ny) || occupied) { draw(); return; }
  state.x = nx; state.y = ny;
  const warp = activeMap().metadata.warps.find(w => w.x === nx && w.y === ny);
  if (warp) {
    if (currentMapId === 'ELMS_LAB' && !state.starter) {
      showDialogue('PROF. ELM', "Wait! You can't leave without choosing a POKéMON.");
      draw();
      return;
    }
    transition(warp);
    return;
  }
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
// Each source image is embedded in this bundle. There is no single global
// "source" image: every map chooses its own tileset in drawMap().
resizeCanvasForMap();
draw();
setHint('NEW BARK TOWN');
requestAnimationFrame(frame);
