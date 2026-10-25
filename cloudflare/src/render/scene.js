// Turns the engine state into a list of things to draw (pure; the canvas code lives in canvas.js).
import { DIRECTIONS } from '../game/engine.js';
import { SPRITES } from '../generated/sprites.js';
import { objectPaletteIndex, spriteFrame, PLAYER_SPRITE } from '../maps/object-sprites.js';
import { tileLength, takeTiles } from '../script/text.js';
import { startMenuView, saveInfoView } from '../game/menu.js';
import { PLAYER_SCREEN_X, PLAYER_SCREEN_Y, SPRITE_Y_OFFSET } from '../maps/viewport.js';

const TILE = 16;

/** Pixel position of an actor, moving smoothly through its current step (1 px per frame at walking speed). */
export function actorPixels(actor) {
  let x = actor.x * TILE, y = actor.y * TILE;
  const step = actor.step;
  if (step?.kind === 'walk') {
    const d = DIRECTIONS[actor.facing];
    const progress = Math.round((step.frame / step.frames) * TILE);
    x += d.dx * progress; y += d.dy * progress;
  }
  return { x, y };
}

/**
 * Pose of an actor (measured against the game): standing for the first 8 frames of a square and the walking pose for
 * the last 8, the mirrored walking pose on alternate squares; a turn shows the walking pose.
 */
export function actorFrame(actor) {
  const step = actor.step;
  let pose = 0;
  if (step?.kind === 'turn') pose = 1;
  else if (step?.kind === 'walk' && step.frame >= step.frames / 2) pose = actor.parity ? 3 : 1;
  return spriteFrame(actor.facing, pose);
}

function spriteEntry(game, spriteConst, paletteIndex, actor) {
  const sheet = SPRITES[spriteConst];
  let { row, mirror } = actorFrame(actor);
  if ((row + 1) * TILE > sheet.height) ({ row, mirror } = spriteFrame(actor.facing, 0));   // STANDING / STILL sheets have fewer frames
  if ((row + 1) * TILE > sheet.height) row = 0;
  const { x, y } = actorPixels(actor);
  return { sprite: spriteConst, paletteIndex, row, mirror, x, y: y + SPRITE_Y_OFFSET, tileY: actor.y };
}

/** What the screen shows right now. Coordinates are map pixels; subtract the camera for screen pixels. */
export function describeScene(game) {
  const player = actorPixels(game.player);
  const camera = { x: player.x - PLAYER_SCREEN_X, y: player.y - PLAYER_SCREEN_Y };
  // Lower OAM slots are drawn on top, and the player is slot 0, so draw the objects from the last to the first.
  const sprites = game.visibleObjects().slice().reverse().map((o) => {
    const def = o.def;
    return spriteEntry(game, game.spriteOf(def), objectPaletteIndex({ sprite: game.spriteOf(def), palette: def.palette }), o);
  });
  sprites.push(spriteEntry(game, PLAYER_SPRITE, objectPaletteIndex({ sprite: PLAYER_SPRITE, palette: '0' }), game.player));
  const wait = game.runner?.wait;
  let textbox = null;
  if (game.textboxOpen) {
    textbox = { lines: ['', ''], prompt: false };
    if (wait?.kind === 'text') {
      const screen = wait.screens[wait.index];
      const first = takeTiles(screen.lines[0], wait.chars);
      const second = takeTiles(screen.lines[1], wait.chars - tileLength(screen.lines[0]));
      textbox.lines = [first, second];
      textbox.prompt = wait.ready && screen.wait !== null;
    } else if (wait?.kind === 'button') {
      textbox.lines = game.lastTextLines ?? ['', ''];
      textbox.prompt = true;
    } else if (game.lastTextLines) textbox.lines = game.lastTextLines;
  }
  const yesno = wait?.kind === 'yesno' ? { cursor: wait.cursor, left: wait.x, top: 7, right: wait.x + 5, bottom: 11 } : null;
  const panels = [];                                                    // boxes of text drawn under the dialogue box
  if (game.menu) panels.push(startMenuView(game.state, game.menu.cursor, game.menu.hollow));
  if (game.savingInfo) panels.push(saveInfoView(game.state));
  return { camera, sprites, panels, textbox, yesno, fade: game.fade, mapId: game.world.id };
}
