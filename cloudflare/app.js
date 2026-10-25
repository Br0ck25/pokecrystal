import { NEW_BARK_TOWN, eventsAt as newBarkEventsAt } from './src/maps/new-bark-town.js';
import { NEW_BARK_TOWN_BLOCK_IDS, getNewBarkTownCollisionAtMetatile } from './src/maps/new-bark-town-blocks.js';
import { ELMS_LAB, elmLabEventsAt } from './src/maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabCollisionAtMetatile } from './src/maps/elms-lab-blocks.js';
import { JOHTO_METATILE_TILES } from './src/maps/johto-metatiles.js';
import { CRYSTAL_OVERWORLD_SPRITES } from './src/assets/overworld-sprites.js';
import { CRYSTAL_EXTRA_SPRITES } from './src/assets/source-sprites.js';
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
import { getLabStarter, getLabStarterBallId, getLabStarterPrompt, mustBlockLabExit } from './src/maps/starter-selection.js';
import { shouldStartElmOpeningScene, canCancelPendingScene, ELM_OPENING_MOVEMENT } from './src/maps/scene-progression.js';
import { resolveSceneObjectPosition, isSceneObjectVisible } from './src/maps/scene-object-state.js';
import { getCardinalStep, getSpriteFrameRow } from './src/maps/movement-input.js';
import { getSourceSpriteForObject } from './src/maps/npc-sprite-map.js';
import { formatSourceText } from './src/maps/source-text.js';
import { advanceRadioSequence } from './src/maps/radio-sequence.js';
import { createDialoguePages } from './src/maps/dialogue-pages.js';
import { normalizeKey, getButtonAction } from './src/maps/input-bindings.js';
import { formatYesNoChoice, moveYesNoChoice } from './src/maps/yes-no-menu.js';
import { getNewBarkTownObjectDialogue } from './src/maps/new-bark-town-dialogue.js';
import { storeMomChoice, beginMomPhoneQuestion } from './src/maps/mom-intro-state.js';

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
const starterImages = {};
for (const [name, base64] of Object.entries({ CYNDAQUIL: CRYSTAL_EXTRA_SPRITES.CYNDAQUIL, TOTODILE: CRYSTAL_EXTRA_SPRITES.TOTODILE, CHIKORITA: CRYSTAL_EXTRA_SPRITES.CHIKORITA })) {
  const image = new Image();
  image.onload = () => { starterImages[name] = image; draw(); };
  image.onerror = () => console.error('[Pokémon Crystal preview] Could not decode starter art:', name);
  image.src = 'data:image/png;base64,' + base64;
}
for (const [name, base64] of Object.entries({ ...CRYSTAL_OVERWORLD_SPRITES, ...Object.fromEntries(Object.entries(CRYSTAL_EXTRA_SPRITES).filter(([name]) => ['ELM','MOM','SCIENTIST','OFFICER','POKE_BALL','POKEFAN_F','COOLTRAINER_F','BUG_CATCHER'].includes(name))) })) {
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
let currentMapId = 'PLAYERS_HOUSE_2F';
const state = { x: 3, y: 3, facing: 'up', starter: null, starterBall: null, elmTalked: false, labIntroComplete: false, pendingStarter: null, labIntroStage: 0, starterReveal: null, starterReceiptStage: 0, starterLevel: null, starterHeldItem: null, elmPhoneAdded: false, choiceYes: true, choiceNeedsConfirm: false, momIntroActive: false, momIntroStage: 0, momChoiceYes: true, momDstChoiceYes: true, momPhoneChoiceYes: true, momX: 7, pokegear: false, townTeacherStage: null, townTeacherX: 6, townTeacherY: 8, townTeacherStartY: 8, rivalX: 3, rivalY: 2, rivalStage: 0, initialRadioListened: false, radioStage: 0, labExitWarningStage: null };
const keys = new Set();
let lastStep = 0;
let walkFrame = 0;
let scriptedMovement = null;
let dialoguePages = [];
let dialoguePageIndex = 0;
let dialogueSpeaker = '';
let dialogueDismissOnA = false;

function activeMap() { return maps[currentMapId]; }
function objectPosition(object) {
  if (currentMapId === 'PLAYERS_HOUSE_1F' && object.id === 'MOM' && Number.isInteger(state.momX)) return { x: state.momX, y: object.y };
  if (currentMapId === 'NEW_BARK_TOWN' && object.id === 'NEWBARKTOWN_TEACHER' && Number.isInteger(state.townTeacherX)) return { x: state.townTeacherX, y: state.townTeacherY };
  if (currentMapId === 'NEW_BARK_TOWN' && object.id === 'NEWBARKTOWN_RIVAL') return { x: state.rivalX, y: state.rivalY };
  return resolveSceneObjectPosition(currentMapId, object, state) || { x: object.x, y: object.y };
}
function resizeCanvasForMap() {
  // Crystal's Game Boy Color display is 160x144 pixels. Keep this viewport fixed
  // on every map and scroll the world behind it instead of shrinking maps to fit.
  canvas.width = GBC_VIEWPORT_WIDTH;
  canvas.height = GBC_VIEWPORT_HEIGHT;
  const screen = document.querySelector('.screen');
  if (screen) screen.style.aspectRatio = `${GBC_VIEWPORT_WIDTH} / ${GBC_VIEWPORT_HEIGHT}`;
}
function setHint(text) {
  dialoguePages = [];
  dialoguePageIndex = 0;
  dialogueSpeaker = '';
  dialogueDismissOnA = false;
  status.textContent = formatSourceText(text);
  status.dataset.kind = 'hint';
  draw();
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
function drawSourceSprite(name, x, y, facing = 'down', flip = false, animate = false) {
  const image = overworldSpriteImages[name];
  if (!image || image.naturalWidth < 16 || image.naturalHeight < 96) return false;
  // The source sheets are six 16x16 poses: down, up, and side, each with
  // alternating walk frames. Static event sprites use frame zero.
  const row = getSpriteFrameRow(facing, animate ? walkFrame : 0);
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
  if (drawSourceSprite('KRIS', x, y, state.facing, state.facing === 'right', true)) return;
  // Visible fallback if an embedded source sprite fails to decode.
  ctx.fillStyle = '#111827'; ctx.fillRect(x + 3, y + 2, 10, 13);
  ctx.fillStyle = '#f1c7a5'; ctx.fillRect(x + 5, y + 3, 6, 6);
  ctx.fillStyle = '#7b3f21'; ctx.fillRect(x + 4, y + 1, 8, 3);
  ctx.fillStyle = '#b72c38'; ctx.fillRect(x + 4, y + 9, 8, 4);
  ctx.fillStyle = '#284d9b'; ctx.fillRect(x + 4, y + 13, 3, 3); ctx.fillRect(x + 9, y + 13, 3, 3);
}
function drawNpc(object) {
  const x = object.x * TILE, y = object.y * TILE;
  const sourceSprite = getSourceSpriteForObject(object);
  const facing = object.facing || 'down';
  if (sourceSprite && drawSourceSprite(sourceSprite, x, y, facing, facing === 'right')) return;
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
  if (id.includes('POKE_BALL') && drawSourceSprite('POKE_BALL', x, y, 'down')) return;
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
    if (!isSceneObjectVisible(currentMapId, object, state)) continue;
    const position = objectPosition(object);
    let facing = object.facing || 'down';
    if (object.id === 'MOM' && state.momIntroActive) facing = 'right';
    if (object.id === 'ELMSLAB_ELM') {
      facing = state.labIntroComplete ? 'down' : (state.labIntroStage === 3 ? 'down' : 'right');
    }
    if (object.id === 'NEWBARKTOWN_TEACHER' && state.townTeacherStage !== null) {
      facing = state.townTeacherStage === 0 ? 'left' : state.townTeacherStage === 1 ? 'right' : 'left';
    }
    if (object.id === 'NEWBARKTOWN_RIVAL' && state.rivalStage > 0) {
      facing = state.rivalStage === 1 ? 'left' : 'down';
    }
    drawNpc({ ...object, ...position, facing });
  }
}
function drawStarterPreview() {
  const previewSpecies = state.pendingStarter && state.pendingStarter !== 'LAB_INTRO' ? state.pendingStarter : state.starterReveal;
  if (!previewSpecies) return;
  const image = starterImages[previewSpecies];
  ctx.save();
  ctx.fillStyle = '#f5f4e9';
  ctx.fillRect(38, 26, 84, 76);
  ctx.strokeStyle = '#273e4a';
  ctx.lineWidth = 2;
  ctx.strokeRect(39, 27, 82, 74);
  ctx.fillStyle = '#263e4b';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(previewSpecies, 80, 37);
  if (image && image.naturalWidth >= 40 && image.naturalHeight >= 40) {
    // Crystal front sprites are 40px wide, with animation frames stacked vertically.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, 40, 40, 56, 42, 48, 48);
  } else {
    ctx.fillText('Loading art…', 80, 70);
  }
  ctx.restore();
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
  drawStarterPreview();
  drawDialogueBox();
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
  const x = state.x + delta[0], y = state.y + delta[1];
  // Event metadata stores original coordinates, but source callbacks can move
  // objects at runtime (notably Elm during the opening scene). Never allow an
  // interaction with an NPC's stale, pre-callback coordinate.
  const current = activeMap();
  const events = current.eventsAt(x, y).filter(event => {
    if (event.type !== 'object') return true;
    const object = (current.metadata.objects || []).find(candidate => candidate.id === event.id);
    if (!object) return true;
    const position = objectPosition(object);
    return position.x === x && position.y === y;
  });
  for (const object of current.metadata.objects || []) {
    if (!isSceneObjectVisible(currentMapId, object, state)) continue;
    const position = objectPosition(object);
    if (position.x !== x || position.y !== y) continue;
    if (object.id === 'ELMSLAB_OFFICER' && state.starter) continue;
    if (object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter) continue;
    if (object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starterBall === object.id) continue;
    if (!events.some(event => event.type === 'object' && event.id === object.id)) {
      events.push({ type: 'object', ...object, x, y });
    }
  }
  return events;
}
function showDialogue(speaker, text, dismissOnA = false) {
  dialogueSpeaker = formatSourceText(speaker);
  dialogueDismissOnA = dismissOnA;
  dialoguePages = createDialoguePages(formatSourceText(text));
  dialoguePageIndex = 0;
  status.textContent = dialogueSpeaker + "\n" + dialoguePages[0].join("\n");
  status.dataset.kind = 'dialogue';
  draw();
}
function advanceDialoguePage() {
  if (status.dataset.kind !== 'dialogue' || dialoguePageIndex >= dialoguePages.length - 1) return false;
  dialoguePageIndex += 1;
  status.textContent = dialogueSpeaker + "\n" + dialoguePages[dialoguePageIndex].join("\n");
  draw();
  return true;
}
function drawDialogueBox() {
  if (status.dataset.kind !== 'dialogue') return;
  const x = 3, y = 96, w = canvas.width - 6, h = 45;
  ctx.save();
  ctx.fillStyle = '#f8f8f0'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#18202a'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = '#7a8790'; ctx.lineWidth = 1; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = '#17232a'; ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const formattedText = formatSourceText(status.textContent);
  if (formattedText !== status.textContent) status.textContent = formattedText;
  const raw = status.textContent.split('\n');
  const speaker = raw.shift() || '';
  ctx.font = 'bold 7px monospace'; ctx.fillText(speaker.slice(0, 28), x + 8, y + 6);
  ctx.font = '7px monospace';
  const lines = [];
  for (const paragraph of raw) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (next.length > 33 && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
  }
  lines.slice(0, 3).forEach((lineText, i) => ctx.fillText(lineText, x + 8, y + 16 + i * 8));
  ctx.restore();
}
function interact() {
  if (scriptedMovement) return;
  if (advanceDialoguePage()) return;
  // NewBarkTownRivalScript performs the shove immediately after the second
  // text is dismissed; it is not a third interaction prompt in the source.
  if (currentMapId === 'NEW_BARK_TOWN' && state.rivalStage === 2 && status.dataset.kind === 'dialogue') {
    const pushedY = state.y + 1;
    if (!blocked(state.x, pushedY)) state.y = pushedY;
    state.rivalX = Math.min(NEW_BARK_TOWN.dimensions.metatilesWide - 1, state.rivalX + 1);
    state.rivalStage = 0;
    state.facing = 'up';
    setHint('The rival shoves past you and slips back into the shadows.');
    draw();
    return;
  }
  if (dialogueDismissOnA && status.dataset.kind === 'dialogue') {
    setHint(activeMap().title + ' · Press A to interact; B closes dialogue.');
    return;
  }
  if (state.townTeacherStage !== null) {
    if (state.townTeacherStage === 0) {
      // NewBarkTown_TeacherStopsYouScene1/2: the teacher runs left to the
      // player before delivering the warning. Keep the source's four/five-step
      // destination but advance the movement as a deterministic scene beat.
      state.townTeacherX = state.townTeacherStartY === 8 ? 2 : 1;
      state.townTeacherY = state.townTeacherStartY;
      state.townTeacherStage = 1;
      state.facing = 'right';
      showDialogue('TEACHER', "What do you think you're doing?");
      return;
    }
    if (state.townTeacherStage === 1) {
      // The source script follows the teacher back to its starting column.
      state.townTeacherX = 6;
      state.townTeacherY = state.townTeacherStartY;
      state.x = 5;
      state.y = state.townTeacherStartY;
      state.facing = 'left';
      state.townTeacherStage = 2;
      showDialogue('TEACHER', "It's dangerous to go out without a POKéMON! Wild POKéMON jump out of the grass on the way to the next town.");
      draw();
      return;
    }
    state.townTeacherStage = null;
    state.townTeacherX = 6;
    state.townTeacherY = 8;
    setHint('The teacher brought you back. Professor Elm is waiting in his lab.');
    draw();
    return;
  }
  if (state.labExitWarningStage !== null) {
    state.labExitWarningStage = null;
    setHint('Choose one of the three POKéMON on the table first.');
    return;
  }
  if (state.momIntroActive) {
    if (state.momIntroStage === 0) {
      state.momIntroStage = 1;
      state.pokegear = true;
      showDialogue('MOM', "POKéMON GEAR, or just POKéGEAR. It's essential if you want to be a good trainer. Oh, the day of the week isn't set. You mustn't forget that!");
      return;
    }
    if (state.momIntroStage === 1) {
      state.momIntroStage = 2;
      state.momDstChoiceYes = true;
      state.momPhoneChoiceYes = true;
      state.momChoiceYes = true;
      showDialogue('MOM', "Is it Daylight Saving Time now?\n\n" + formatYesNoChoice(true));
      return;
    }
    if (state.momIntroStage === 2) {
      beginMomPhoneQuestion(state);
      showDialogue('MOM', "Come home to adjust your clock for Daylight Saving Time. By the way, do you know how to use the PHONE?\n\n" + formatYesNoChoice(state.momPhoneChoiceYes));
      return;
    }
    if (state.momIntroStage === 3) {
      state.momIntroStage = 4;
      showDialogue('MOM', state.momPhoneChoiceYes
        ? "Don't you just turn the POKéGEAR on and select the PHONE icon?"
        : "I'll read the instructions. Turn the POKéGEAR on and select the PHONE icon.");
      return;
    }
    if (state.momIntroStage === 4) {
      state.momIntroStage = 5;
      showDialogue('MOM', "Phone numbers are stored in memory. Just choose a name you want to call. Gee, isn't that convenient?");
      return;
    }
    state.momIntroActive = false;
    state.momIntroStage = 0;
    state.momX = 7;
    setHint('Mom gave you the POKéGEAR. Professor Elm is waiting at the lab.');
    return;
  }
  if (state.starterReveal) { state.starterReveal = null; draw(); }
  if (state.starterReceiptStage === 1) {
    state.starterReceiptStage = 2;
    showDialogue('POKéMON', '<PLAYER> received ' + state.starter + '!');
    return;
  }
  if (state.starterReceiptStage === 2) {
    state.starterReceiptStage = 3;
    showDialogue('PROF. ELM', "MR. POKéMON lives a little bit beyond CHERRYGROVE, the next city over. It's almost a direct route there, so you can't miss it. But just in case, here's my phone number. Call me if anything comes up!");
    return;
  }
  if (state.starterReceiptStage === 3) {
    state.starterReceiptStage = 4;
    state.elmPhoneAdded = true;
    showDialogue('SYSTEM', '<PLAYER> got ELM\'s phone number.');
    return;
  }
  if (state.starterReceiptStage === 4) {
    state.starterReceiptStage = 5;
    showDialogue('PROF. ELM', "If your POKéMON is hurt, you should heal it with this machine. Feel free to use it anytime.");
    return;
  }
  if (state.starterReceiptStage === 5) {
    state.starterReceiptStage = 6;
    showDialogue('PROF. ELM', "<PLAYER>, I'm counting on you!");
    return;
  }
  if (state.starterReceiptStage === 6) {
    state.starterReceiptStage = 0;
    setHint('Your partner is ready. You can now leave the lab.');
    return;
  }
  if (state.pendingStarter) {
    if (!canCancelPendingScene(state.pendingStarter) && state.pendingStarter === 'LAB_INTRO') {
      if (state.labIntroStage === 0) {
        if (!state.choiceYes) {
          showDialogue('PROF. ELM', "But… Please, I need your help!\n\n" + formatYesNoChoice(true));
          return;
        }
        state.labIntroStage = 1;
        showDialogue('PROF. ELM', "Thanks, <PLAYER>!\n\nYou're a great help!");
        return;
      }
      if (state.labIntroStage === 1) {
        state.labIntroStage = 2;
        showDialogue('PROF. ELM', "When I announce my findings, I'm sure we'll delve a bit deeper into the many mysteries of POKéMON.\n\nYou can count on it!");
        return;
      }
      if (state.labIntroStage === 2) {
        state.labIntroStage = 3;
        showDialogue('PROF. ELM', "Oh, hey! I got an e-mail!\n\n<……><……><……>\nHm… Uh-huh…\n\nOkay…");
        return;
      }
      if (state.labIntroStage === 3) {
        state.labIntroStage = 4;
        showDialogue('PROF. ELM', "Hey, listen. I have an acquaintance called MR. POKéMON. He keeps finding weird things and raving about his discoveries.\n\nAnyway, I just got an e-mail from him saying that this time it's real. It is intriguing, but we're busy with our POKéMON research…\n\nWait! I know! <PLAYER>, can you go in our place?");
        return;
      }
      state.pendingStarter = null;
      state.labIntroStage = 0;
      state.labIntroComplete = true;
      showDialogue('PROF. ELM', "I want you to raise one of the POKéMON contained in these BALLS. You'll be that POKéMON's first partner, <PLAYER>!\n\nGo on. Pick one!");
      return;
    }
    if (state.choiceNeedsConfirm) {
      state.choiceNeedsConfirm = false;
      showDialogue('PROF. ELM', `${state.pendingStarter}?\n\n${state.choiceYes ? formatYesNoChoice(true) : formatYesNoChoice(false)}\nPress A to confirm.`);
      return;
    }
    if (state.choiceYes) {
      state.starter = state.pendingStarter;
      state.starterReveal = state.starter;
      state.starterBall = getLabStarterBallId(state.starter);
      state.starterLevel = getLabStarter(state.starterBall)?.level ?? 5;
      state.starterHeldItem = 'BERRY';
      state.starterReceiptStage = 1;
      state.pendingStarter = null;
      showDialogue('PROF. ELM', "I think that's a great POKéMON too!");
      draw();
    } else {
      state.pendingStarter = null;
      showDialogue('PROF. ELM', "Think it over carefully.\n\nYour partner is important.");
      draw();
    }
    return;
  }
  const event = eventsAtFacing().find(item => item.type === 'background' || item.type === 'object');
  if (!event) {
    setHint('Nothing to interact with here.');
    return;
  }
  if (event.type === 'background' && event.kind === 'radio') {
    const radio = advanceRadioSequence({
      starter: state.starter,
      listened: state.initialRadioListened,
      stage: state.radioStage,
    });
    state.initialRadioListened = radio.listened;
    state.radioStage = radio.stage;
    showDialogue('RADIO', radio.text, radio.listened);
    return;
  }
  if (currentMapId === 'ELMS_LAB' && event.type === 'object' && event.id === 'ELMSLAB_ELM') {
    if (!state.labIntroComplete) {
      state.elmTalked = true;
      state.pendingStarter = 'LAB_INTRO';
      state.labIntroStage = 0;
      state.choiceYes = true;
      showDialogue('PROF. ELM', "<PLAYER>! There you are!\n\nI needed to ask you a favor.\n\nI'm conducting new POKéMON research right now. I was wondering if you could help me with it, <PLAYER>.\n\nYou see… I'm writing a paper that I want to present at a conference. But there are some things I don't quite understand yet. So!\n\nI'd like you to raise a POKéMON that I recently caught.\n\n▶ YES\n  NO");
    } else if (!state.starter) {
      showDialogue('PROF. ELM', "I want you to raise one of the POKéMON contained in these BALLS. You'll be that POKéMON's first partner! Go on. Pick one!");
    } else {
      showDialogue('PROF. ELM', 'ELM: Take good care of your ' + state.starter + '!');
    }
    return;
  }
  if (currentMapId === 'ELMS_LAB' && event.type === 'object' && event.id?.startsWith('ELMSLAB_POKE_BALL')) {
    if (!state.labIntroComplete) { showDialogue('PROF. ELM', 'ELM: Talk to me first. I need to explain your errand.'); return; }
    if (state.starter) { showDialogue('POKé BALL', 'It contains a POKéMON caught by PROF. ELM. You already chose ' + state.starter + '.'); return; }
    const starterData = getLabStarter(event.id);
    if (!starterData) { showDialogue('POKé BALL', 'The contents of this BALL are unknown.'); return; }
    const starter = starterData.species;
    state.pendingStarter = starter;
    state.choiceYes = true;
    state.choiceNeedsConfirm = false;
    showDialogue('PROF. ELM', getLabStarterPrompt(starter) + '\n\n' + formatYesNoChoice(true));
    draw();
    return;
  }
  if (currentMapId === 'NEW_BARK_TOWN' && event.type === 'object' && event.id === 'NEWBARKTOWN_RIVAL') {
    if (!state.starter) {
      setHint('The rival has not appeared yet.');
      return;
    }
    if (state.rivalStage === 0) {
      state.rivalStage = 1;
      showDialogue('RIVAL', '…\n\nSo this is the famous ELM POKéMON LAB…');
      return;
    }
    if (state.rivalStage === 1) {
      state.rivalStage = 2;
      showDialogue('RIVAL', '…What are you staring at?');
      return;
    }
    // Source script: shove the player one step down, then have the rival
    // move one step right. Use collision data so the scripted movement cannot
    // place the player inside a wall.
    const pushedY = state.y + 1;
    if (!blocked(state.x, pushedY)) state.y = pushedY;
    state.rivalX = Math.min(NEW_BARK_TOWN.dimensions.metatilesWide - 1, state.rivalX + 1);
    state.rivalStage = 0;
    state.facing = 'up';
    setHint('The rival shoves past you and slips back into the shadows.');
    draw();
    return;
  }
  if (currentMapId === 'NEW_BARK_TOWN') {
    if (event.type === 'background') {
      showDialogue('SIGN', event.text || 'A sign.', true);
      return;
    }
    const dialogue = currentMapId === 'NEW_BARK_TOWN' ? getNewBarkTownObjectDialogue(event, state) : (event.dialogue || ['…']);
    showDialogue(event.id || '…', dialogue.join('\n'), true);
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
    showDialogue(event.kind === 'pc' ? 'PC' : 'OBJECT', message, true);
    return;
  }
  if (event.type === 'object') {
    if (currentMapId === 'PLAYERS_HOUSE_1F' && event.id === 'MOM') {
      // Source: maps/PlayersHouse1F.asm, MomScript (.GotAPokemon / default).
      const lines = state.starter
        ? ["So, what was PROF. ELM's errand?", '…', 'That does sound challenging.', 'But, you should be proud that people rely on you.']
        : ['PROF. ELM is waiting for you.', 'Hurry up, baby!'];
      showDialogue('MOM', lines.join('\n'), true);
      return;
    }
    showDialogue(event.id || '…', (event.dialogue || [event.script || event.id || '…']).join('\n'), true);
    return;
  }
  // Keep unported lab scripts explicit instead of inventing their stateful behavior.
  const label = event.label || event.script || 'Object';
  showDialogue(label, 'Original script not yet implemented: ' + event.script, true);
}
function pressB() {
  if (scriptedMovement) return;
  if (state.starterReveal) { state.starterReveal = null; draw(); }
  if (state.momIntroActive) { state.momIntroActive = false; state.momIntroStage = 0; setHint('Talk to Mom again if you need to.'); return; }
  if (state.pendingStarter === 'LAB_INTRO') {
    // Source ElmsLab.asm loops until the player agrees; B cannot skip the opening scene.
    state.choiceYes = true;
    state.labIntroStage = 0;
    showDialogue('PROF. ELM', "<PLAYER>! There you are!\n\nI needed to ask you a favor.\n\nI'm conducting new POKéMON research right now. I was wondering if you could help me with it, <PLAYER>.\n\nYou see… I'm writing a paper that I want to present at a conference. But there are some things I don't quite understand yet. So!\n\nI'd like you to raise a POKéMON that I recently caught.\n\n▶ YES\n  NO");
    return;
  }
  if (state.pendingStarter) { state.pendingStarter = null; state.choiceNeedsConfirm = false; setHint('Choice cancelled. Face a character or object and press A.'); return; }
  if (status.dataset.kind === 'dialogue') setHint(activeMap().title + ' · Press A to interact; B closes this text.');
  else setHint('There is nothing to cancel right now.');
}
function startScriptedMovement(directions, onComplete) {
  scriptedMovement = { directions: [...directions], index: 0, onComplete };
  keys.clear();
  lastStep = 0;
}
function advanceScriptedMovement(now) {
  if (!scriptedMovement || now - lastStep <= 130) return;
  lastStep = now;
  const move = scriptedMovement.directions[scriptedMovement.index++];
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[move];
  if (delta) {
    state.x += delta[0];
    state.y += delta[1];
    state.facing = move;
    walkFrame = walkFrame === 0 ? 1 : 0;
  }
  draw();
  if (scriptedMovement.index >= scriptedMovement.directions.length) {
    const complete = scriptedMovement.onComplete;
    scriptedMovement = null;
    if (typeof complete === 'function') complete();
  }
}
function transition(warp) {
  const previousMapId = currentMapId;
  const landing = resolvePreviewWarp(currentMapId, warp, maps);
  if (!landing || !maps[landing.mapId]) {
    setHint('This destination has not been ported yet: ' + (warp?.destinationMap || 'unknown'));
    return;
  }
  currentMapId = landing.mapId;
  const beginsElmOpening = shouldStartElmOpeningScene({ mapId: currentMapId, previousMapId, starter: state.starter, labIntroComplete: state.labIntroComplete });
  if (currentMapId === 'ELMS_LAB' && previousMapId !== 'ELMS_LAB' && !state.starter) { state.labIntroComplete = false; state.elmTalked = false; }
  state.x = landing.x;
  state.y = landing.y;
  state.facing = landing.facing;
  resizeCanvasForMap();
  draw();
  if (beginsElmOpening) {
    // Source: ElmsLab_WalkUpToElmMovement is seven UP steps, then turn left.
    // Keep the player at the real warp landing and animate the source movement.
    state.pendingStarter = 'LAB_INTRO';
    state.labIntroStage = 0;
    state.choiceYes = true;
    startScriptedMovement(ELM_OPENING_MOVEMENT, () => {
      state.facing = 'left';
      showDialogue('PROF. ELM', "<PLAYER>! There you are!\n\nI needed to ask you a favor.\n\nI'm conducting new POKéMON research right now. I was wondering if you could help me with it, <PLAYER>.\n\nYou see… I'm writing a paper that I want to present at a conference. But there are some things I don't quite understand yet. So!\n\nI'd like you to raise a POKéMON that I recently caught.\n\n▶ YES\n  NO");
    });
    return;
  }
  setHint('Entered ' + activeMap().title + '. Talk to characters and inspect objects with A.');
}
function step(dx, dy, face) {
  if (state.pendingStarter === 'LAB_INTRO' && state.labIntroStage === 0) {
    if (dialoguePageIndex < dialoguePages.length - 1) return;
    state.choiceYes = moveYesNoChoice(state.choiceYes, dx, dy);
    showDialogue('PROF. ELM', `Will you help PROF. ELM?\n\n${state.choiceYes ? formatYesNoChoice(true) : formatYesNoChoice(false)}\nPress A to confirm.`);
    return;
  }
  if (state.pendingStarter === 'LAB_INTRO') return;
  if (state.pendingStarter) {
    if (dialoguePageIndex < dialoguePages.length - 1) return;
    state.choiceYes = moveYesNoChoice(state.choiceYes, dx, dy);
    state.choiceNeedsConfirm = false;
    const starter = state.pendingStarter;
    showDialogue('PROF. ELM', getLabStarterPrompt(starter) + '\n\n' + (state.choiceYes ? formatYesNoChoice(true) : formatYesNoChoice(false)));
    return;
  }
  if (state.momIntroActive) {
    if (dialoguePageIndex < dialoguePages.length - 1) return;
    if (state.momIntroStage === 2 || state.momIntroStage === 3) {
      const choice = state.momIntroStage === 2 ? state.momDstChoiceYes : state.momPhoneChoiceYes;
      storeMomChoice(state, state.momIntroStage, moveYesNoChoice(choice, dx, dy));
      const options = state.momChoiceYes ? formatYesNoChoice(true) : formatYesNoChoice(false);
      const prompt = state.momIntroStage === 2
        ? 'Is it Daylight Saving Time now?'
        : 'Come home to adjust your clock for Daylight Saving Time. By the way, do you know how to use the PHONE?';
      showDialogue('MOM', prompt + '\n\n' + options);
    }
    return;
  }
  if (status.dataset.kind === 'dialogue') return;
  state.facing = face;
  if (state.townTeacherStage !== null || state.labExitWarningStage !== null) return;
  const oldX = state.x, oldY = state.y;
  const nx = state.x + dx, ny = state.y + dy;
  const occupied = (activeMap().metadata.objects || []).some(object => { if (!isSceneObjectVisible(currentMapId, object, state)) return false; const position = objectPosition(object); return position.x === nx && position.y === ny
    && !(object.id?.startsWith('ELMSLAB_POKE_BALL') && state.starter)
    && !(object.id === 'ELMSLAB_OFFICER' && state.starter)
    && !(object.id === 'ELMSLAB_ELMS_AIDE' && !state.starter); });
  if (blocked(nx, ny) || occupied) { draw(); return; }
  state.x = nx; state.y = ny;
  walkFrame = walkFrame === 0 ? 1 : 0;
  if (currentMapId === 'NEW_BARK_TOWN' && !state.starter && ((nx === 1 && ny === 8) || (nx === 1 && ny === 9))) {
    state.townTeacherStage = 0;
    state.townTeacherStartY = ny;
    state.townTeacherX = 6;
    state.townTeacherY = 8;
    showDialogue('TEACHER', 'Wait, <PLAY_G>!');
    draw();
    return;
  }
  const labExitEvent = activeMap().metadata.coordinateEvents?.find(event => event.script === 'LabTryToLeaveScript' && event.x === nx && event.y === ny);
  if (currentMapId === 'ELMS_LAB' && labExitEvent && state.labIntroComplete && !state.starter) {
    // Source coordinate scripts LabTryToLeaveScript run before the door warp.
    state.x = oldX;
    state.y = oldY;
    state.labExitWarningStage = 0;
    showDialogue('PROF. ELM', "Wait! You can't leave without choosing a POKéMON.");
    return;
  }
  if (currentMapId === 'PLAYERS_HOUSE_1F' && (nx === 8 || nx === 9) && ny === 4 && !state.pokegear) {
    // Crystal has two separate coordinate scripts: from the left Mom turns
    // toward the player; from the right she steps one tile toward them.
    state.momX = nx === 9 ? 8 : 7;
    state.facing = 'left';
    state.momIntroActive = true;
    state.momIntroStage = 0;
    showDialogue('MOM', "Oh, <PLAYER>…! Our neighbor, PROF. ELM, was looking for you. He said he wanted you to do something for him.\n\nOh! I almost forgot! Your POKéMON GEAR is back from the repair shop. Here you go!");
    draw();
    return;
  }
  const warp = activeMap().metadata.warps.find(w => w.x === nx && w.y === ny);
  if (warp) {
    if (currentMapId === 'ELMS_LAB' && mustBlockLabExit(state.starter)) {
      state.x = oldX; state.y = oldY;
      state.labExitWarningStage = 0;
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
  if (scriptedMovement) {
    advanceScriptedMovement(now);
    requestAnimationFrame(frame);
    return;
  }
  if (now - lastStep > 130) {
    const dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    const dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
    if (dx || dy) {
      lastStep = now;
      // Crystal movement is four-directional: never advance diagonally when two keys overlap.
      const movement = getCardinalStep(dx, dy);
      if (movement) step(movement.dx, movement.dy, movement.facing);
    }
  }
  requestAnimationFrame(frame);
}
window.addEventListener('keydown', e => {
  const key = normalizeKey(e.key);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Backspace'].includes(e.key)) e.preventDefault();
  const action = getButtonAction(key);
  if (!e.repeat && action === 'a') { interact(); return; }
  if (!e.repeat && action === 'b') { pressB(); return; }
  keys.add(key);
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
window.addEventListener('keyup', e => keys.delete(normalizeKey(e.key)));
window.addEventListener('blur', () => keys.clear());
// Each source image is embedded in this bundle. There is no single global
// "source" image: every map chooses its own tileset in drawMap().
resizeCanvasForMap();
draw();
setHint('Your Room · 2F — walk to the stairs and go downstairs.');
requestAnimationFrame(frame);
