// Turns the engine state into a list of things to draw (pure; the canvas code lives in canvas.js).
import { DIRECTIONS } from '../game/engine.js';
import { SPRITES } from '../generated/sprites.js';
import { objectPaletteIndex, spriteFrame, PLAYER_SPRITE } from '../maps/object-sprites.js';
import { tileLength, takeTiles } from '../script/text.js';
import { startMenuView, saveInfoView } from '../game/menu.js';
import { PLAYER_SCREEN_X, PLAYER_SCREEN_Y, SPRITE_Y_OFFSET } from '../maps/viewport.js';

const TILE = 16;
// map_objects.asm UpdateJumpPosition .y_offsets: the arc of a jump, one entry per 2 frames of a 32-frame hop.
const JUMP_Y = [-4, -6, -8, -10, -11, -12, -12, -12, -11, -10, -9, -8, -6, -4, 0, 0];

/** Pixel position of an actor, moving smoothly through its current step (1 px per frame at walking speed). */
export function actorPixels(actor) {
  let x = actor.x * TILE, y = actor.y * TILE, lift = 0;
  const step = actor.step;
  if (step?.kind === 'walk') {
    const d = DIRECTIONS[actor.facing];
    const progress = Math.round((step.frame / step.frames) * TILE * (step.distance ?? 1));
    x += d.dx * progress; y += d.dy * progress;
    if (step.jump) lift = JUMP_Y[Math.min(15, Math.floor((step.frame / step.frames) * 16))];
  }
  return { x, y, lift };
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
  const { x, y, lift } = actorPixels(actor);
  return { sprite: spriteConst, paletteIndex, row, mirror, x, y: y + lift + SPRITE_Y_OFFSET, tileY: actor.y };
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
  const b = game.blackout;
  const black = b ? b.from + (b.to - b.from) * (b.frame / b.frames) : 0;       // 0 clear .. 1 black
  const sign = game.sign && game.sign.frame >= 2 ? game.sign.name : null;     // shown from the second frame for 60 frames
  return { camera, sprites, panels, pokepic: game.pokepic, sign, textbox, yesno, black, fade: game.fade, mapId: game.world.id };
}
