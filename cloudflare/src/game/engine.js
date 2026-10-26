// The game loop: player movement, map events, NPCs and the script runner. Pure and frame-stepped (60 updates per
// second) so it can run headless in tests; app.js only draws it and feeds it input.
//
// Rules come from the disassembly: engine/overworld/player_movement.asm, events.asm, tile_events.asm,
// warp_connection.asm and scripting.asm; step and animation timings were measured against the real game.
import { loadWorld } from './world.js';
import { createScriptContext } from '../script/context.js';
import { runScript, createScriptState } from '../script/interpreter.js';
import { startTextWait, stepTextWait, TEXT_FRAMES_PER_CHAR } from '../script/textwait.js';
import { startMenuItems, saveFlow, moveCursor } from './menu.js';
import { serializeSave, parseSave } from './save.js';
import { landmarkSign, SIGN_FRAMES } from './landmark.js';
import { TileAnimator } from '../maps/tile-anim.js';
import { COLLISION_PERMISSIONS, COLLISION_VALUES } from '../generated/collision.js';
import { SCENES, CALLBACKS } from '../generated/scenes.js';
import { SPRITES } from '../generated/sprites.js';
import { SFX_FRAMES } from '../generated/sfx.js';
import { DECORATION_BLOCKS, DECORATION_PLACEMENT, NEW_GAME_DECORATIONS } from '../generated/decorations.js';
import { initialFacing, objectPaletteIndex, PLAYER_SPRITE } from '../maps/object-sprites.js';

export const DIRECTIONS = {
  down: { dx: 0, dy: 1, opposite: 'up' }, up: { dx: 0, dy: -1, opposite: 'down' },
  left: { dx: -1, dy: 0, opposite: 'right' }, right: { dx: 1, dy: 0, opposite: 'left' },
};
const DIRECTION_NAMES = Object.keys(DIRECTIONS);
const upper = (d) => d.toUpperCase();

/** Frames for one square: measured, 1px per frame. */
export const STEP_FRAMES = 16;
export const TURN_FRAMES = 8;
/** Movement command speeds in frames per square (macros/scripts/movement.asm: slow, normal and big steps). */
const MOVEMENT_FRAMES = { slow_step: 32, step: 16, big_step: 8, slow_jump_step: 32, jump_step: 16, fast_jump_step: 8 };
export { TEXT_FRAMES_PER_CHAR };

const LAND = 0;
const TALK = 0x10;
// player_movement.asm .TryJump: ledge tiles ($a0-$a7) can be hopped when moving in one of the directions listed (HOP_RIGHT, LEFT, UP, DOWN, then the diagonals).
const LEDGE_DIRECTIONS = [['right'], ['left'], ['up'], ['down'], ['right', 'down'], ['down', 'left'], ['up', 'right'], ['up', 'left']];
const isLedge = (c) => (c & 0xf0) === 0xa0 && LEDGE_DIRECTIONS[c & 7].length > 0;
const warpTile = (c) => c === COLLISION_VALUES.PIT || c === COLLISION_VALUES.PIT_68 || (c & 0xf0) === 0x70;
const directionalCarpet = { [COLLISION_VALUES.WARP_CARPET_DOWN]: 'down', [COLLISION_VALUES.WARP_CARPET_UP]: 'up',
  [COLLISION_VALUES.WARP_CARPET_LEFT]: 'left', [COLLISION_VALUES.WARP_CARPET_RIGHT]: 'right' };
// player_movement.asm .warps: standing on these walks the player down one square (leaving a door or stairs).
const WALK_DOWN_TILES = new Set([COLLISION_VALUES.DOOR, COLLISION_VALUES.DOOR_79, COLLISION_VALUES.STAIRCASE, COLLISION_VALUES.CAVE]);

export class Game {
  constructor({ mapId, x, y, facing = 'down', state = createScriptState(), prev = { map: null, warp: null }, saveStore = null, continued = false } = {}) {
    this.state = state;
    this.saveStore = saveStore;       // { read(): text | null, write(text) }; see save.js
    this.menu = null;                 // the open start menu: { cursor, lastDir, repeat }
    this.menuCursor = 0;              // wBattleMenuCursorPosition
    this.savingInfo = false;          // the save-info box is up (SaveMenu)
    this.prevLandmark = 'LANDMARK_SPECIAL';   // wPrevLandmark
    this.skipSign = continued;        // SHOWN_MAP_NAME_SIGN: Continue shows no sign for the first map
    this.sign = null;                 // { name, frame }: the area-name sign
    this.frame = 0;
    this.player = { x, y, facing, step: null, parity: 0, queue: [] };
    this.objects = [];
    this.world = null;
    this.ctx = null;
    this.runner = null;
    this.textboxOpen = false;
    this.emote = null;
    this.unported = new Set();        // script specials the port does not implement yet
    this.prev = prev;
    this.fade = null;
    this.ready = this.enterMap(mapId, x, y, facing, { newGame: true });
  }

  /** Continue: a game resumed from a save file's text (see save.js). */
  static fromSave(text, options = {}) {
    const { mapId, x, y, facing, prev, state } = parseSave(text);
    return new Game({ mapId, x, y, facing, state, prev, continued: true, ...options });
  }

  // ---- map entry ----------------------------------------------------------------------------------------------

  async enterMap(mapId, x, y, facing, { warpFrom = null } = {}) {
    this.loading = true;
    const world = loadWorld(mapId);
    this.ctx = await createScriptContext(world.name, this.state);
    this.world = world;
    this.tileAnim = new TileAnimator(world.tileset);
    this.failedScripts = new Set();
    this.player = { x, y, facing, step: null, parity: this.player.parity, queue: [] };
    this.objects = world.objects.map((def, index) => ({
      def, index, id: def.id ?? `${world.name}#${index}`, x: def.x, y: def.y, facing: initialFacing(def),
      step: null, queue: [], parity: 0, follow: null,
    }));
    this.follow = null;
    this.deferred = null;
    this.runner = null;                                          // a script never survives a map change
    this.tileEventsEnabled = false;
    this.textboxOpen = false;
    this.emote = null;
    this.blackout = null;
    this.pokepic = null;
    const shown = landmarkSign(this.prevLandmark, mapId, this.skipSign);
    this.skipSign = false;
    this.prevLandmark = shown.prev;
    this.sign = shown.name ? { name: shown.name, frame: 0 } : null;
    this.loading = false;
    // MAPCALLBACK_NEWMAP, then OBJECTS and TILES (home/map.asm LoadMapAttributes / HandleNewMap order).
    const runCallbacks = (type) => {
      for (const [callbackType, script] of CALLBACKS[world.name] ?? []) if (callbackType === type) this.runInstant(script);
    };
    runCallbacks('MAPCALLBACK_NEWMAP');
    // Objects appear or not as their flags stand now (LoadMapObjects); afterwards only appear/disappear change them,
    // so a setevent mid-scene does not remove a sprite that is on screen.
    for (const object of this.objects) object.hidden = this.hiddenByFlags(object);
    runCallbacks('MAPCALLBACK_OBJECTS');
    runCallbacks('MAPCALLBACK_TILES');
    // Arriving on a door, staircase or cave square walks the player down one square.
    if (WALK_DOWN_TILES.has(this.world.collisionAt(x, y))) this.startStep(this.player, 'down', { force: true });
    return this;
  }

  /** Run a callback or scene script to completion in this frame, resolving effects at once. */
  runInstant(label) {
    try { this.runInstantUnsafe(label); } catch (e) { this.unported.add(`${label}: ${e.message}`); }
  }

  runInstantUnsafe(label) {
    const gen = runScript({ ...this.ctx, caller: null }, label);
    let r = gen.next();
    let guard = 0;
    while (!r.done) {
      if (++guard > 100000) throw new Error(`${label} did not finish`);
      const request = r.value;
      let answer;
      if (request.type === 'effect') answer = this.applyEffect(request, { instant: true });
      else if (request.type === 'special') this.applySpecial(request.name);
      else if (request.type === 'movement') this.teleportAlong(request);
      else throw new Error(`${label}: ${request.type} is not allowed in a callback`);
      r = gen.next(answer);
    }
  }

  // ---- objects --------------------------------------------------------------------------------------------------

  objectById(id) {
    if (id === 'PLAYER') return this.player;
    if (id === 'LAST_TALKED') return this.runner?.caller ?? this.lastTalked;
    const found = this.objects.find((o) => o.id === id);
    if (!found) throw new Error(`no object ${id} on ${this.world.name}`);
    return found;
  }

  /** The sprite an object draws: variable sprites (wVariableSprites) resolve through the script state. */
  spriteOf(def) { return this.state.variableSprites?.[def.sprite] ?? def.sprite; }

  isVisible(object) {
    return !object.hidden && Boolean(SPRITES[this.spriteOf(object.def)]);   // Pokémon sprites and unset variable sprites are not ported
  }

  hiddenByFlags(object) {
    const def = object.def;
    if (def.eventFlag !== '-1' && this.state.flags.has(def.eventFlag)) return true;
    const [from, until] = def.hours;
    if (from === -1) return !(until === -1 || String(until).split('|').map((t) => t.trim()).includes(this.state.timeOfDay));
    throw new Error(`hour-limited object ${def.id} is not supported yet`);
  }

  visibleObjects() { return this.objects.filter((o) => this.isVisible(o)); }

  objectAt(x, y, except = null) {
    return this.visibleObjects().find((o) => o !== except && ((o.x === x && o.y === y) || (o.step && o.step.toX === x && o.step.toY === y)));
  }

  // ---- stepping -----------------------------------------------------------------------------------------------

  startStep(actor, direction, { force = false, frames = STEP_FRAMES, jump = false, distance = 1 } = {}) {
    const d = DIRECTIONS[direction];
    if (!actor.fixedFacing) actor.facing = direction;     // fix_facing keeps the sprite turned while it moves
    if (force && this.follow?.leader === actor) this.follow.steps.push(direction);
    actor.step = { kind: 'walk', fromX: actor.x, fromY: actor.y, toX: actor.x + d.dx * distance, toY: actor.y + d.dy * distance, frame: 0, frames, jump, force, distance };
  }

  startTurn(actor, direction) {
    actor.facing = direction;
    actor.step = { kind: 'turn', frame: 0, frames: TURN_FRAMES };
  }

  advanceStep(actor) {
    const step = actor.step;
    if (!step) return false;
    step.frame++;
    if (step.frame < step.frames) return false;
    if (step.kind === 'walk') {
      actor.x = step.toX; actor.y = step.toY;
      actor.parity ^= 1;
      if (actor === this.player) this.tileEventsEnabled = true;   // events.asm CheckPlayerState: re-enabled when a step ends
    }
    actor.step = null;
    return true;                                                  // finished this frame
  }

  canWalkTo(x, y) {
    if (COLLISION_PERMISSIONS[this.world.collisionAt(x, y)] !== LAND) return false;
    return !this.objectAt(x, y);
  }

  // ---- the frame ------------------------------------------------------------------------------------------------

  /**
   * One frame. input: { dir: 'up'|'down'|'left'|'right'|null (held), a, b (pressed this frame), aHeld, bHeld }.
   */
  update(input = {}) {
    if (this.loading) return;
    this.frame++;
    this.tileAnim.step();
    this.state.playFrames = (this.state.playFrames ?? 0) + 1;     // wGameTime*, counted while playing
    if (this.fade) { this.fade.frame++; if (this.fade.frame >= this.fade.frames) this.fade = null; }
    if (this.blackout && this.blackout.frame < this.blackout.frames) this.blackout.frame++;
    if (this.sign && ++this.sign.frame > SIGN_FRAMES + 1) this.sign = null;
    for (const object of this.objects) this.updateActor(object);
    this.updateActor(this.player);
    if (this.runner) { this.updateRunner(input); return; }
    if (this.menu) { this.updateMenu(input); return; }
    if (this.player.step) return;
    this.idleEvents(input);
  }

  /** Advance an actor's step and start the next scripted movement from its queue (turns are instant). */
  // StartFollow / QueueFollowerFirstStep (player_object.asm): the queue starts with one step toward the leader's
  // tile; each leader step is appended; the follower takes the oldest entry only while a newer one exists.
  startFollow(leaderId, followerId) {
    const leader = this.objectById(leaderId), follower = this.objectById(followerId);
    const dx = Math.sign(leader.x - follower.x), dy = Math.sign(leader.y - follower.y);
    const first = dx ? (dx > 0 ? 'right' : 'left') : dy ? (dy > 0 ? 'down' : 'up') : null;
    this.follow = { leader, follower, steps: first ? [first] : [] };
  }
  updateActor(actor) {
    this.advanceStep(actor);
    const f = this.follow;
    if (f && actor === f.follower && !actor.step && f.steps.length > 1) {
      this.startStep(actor, f.steps.shift(), { frames: MOVEMENT_FRAMES.step, force: true });
    }
    if (actor.sleep > 0) { actor.sleep--; return; }
    while (!actor.step && actor.queue.length) {
      const next = actor.queue.shift();
      if (next.turn) { actor.facing = next.direction; continue; }
      if (next.fix !== undefined) { actor.fixedFacing = next.fix; continue; }
      if (next.sleep) { actor.sleep = next.sleep; break; }
      this.startStep(actor, next.direction, { frames: next.frames, force: true, jump: next.jump });
    }
  }

  idleEvents(input) {
    // engine/overworld/events.asm PlayerEvents: tile events, then the scene script, then the joypad.
    if (this.tileEvents()) return;
    if (this.runScene()) return;
    if (input.start) { this.menu = { cursor: Math.min(this.menuCursor, startMenuItems(this.state).length - 1), lastDir: null, repeat: 0 }; return; }
    if (input.a && this.interact()) return;
    if (input.dir) this.tryMove(input.dir);
  }

  tileEvents() {
    // EnterMap and every PlayerEvents pass disable tile events (events.asm DisableEvents) until the player finishes a step.
    if (!this.tileEventsEnabled) return false;
    this.tileEventsEnabled = false;
    const { x, y } = this.player;
    // events.asm CheckMovingOffEdgeOfMap: stepping off a map's edge into a connection enters the connected map.
    const exit = this.world.connectionExit(x, y);
    if (exit) { this.crossConnection(exit); return true; }
    const collision = this.world.collisionAt(x, y);
    if (warpTile(collision) && !(collision in directionalCarpet)) {
      const warp = this.world.warps.find((w) => w.x === x && w.y === y);
      if (warp) { this.warp(warp); return true; }
    }
    const scene = this.sceneName();
    const event = this.world.coordEvents.find((c) => c.x === x && c.y === y && (c.scene === '-1' || c.scene === scene));
    if (event) { this.startScript(event.script, { caller: null }); return true; }
    return false;
  }

  sceneName() {
    const list = SCENES[this.world.name] ?? [];
    const id = this.state.scenes[this.world.name] ?? 0;
    return list[id]?.[1] ?? null;
  }

  runScene() {
    const list = SCENES[this.world.name] ?? [];
    const entry = list[this.state.scenes[this.world.name] ?? 0];
    if (!entry || !entry[0]) return false;
    this.deferred = null;
    this.startScript(entry[0], { caller: null });               // most scene scripts are just `end`; some talk or move
    if (this.runner) return true;
    if (this.deferred) { const label = this.deferred; this.deferred = null; this.startScript(label, { caller: null }); return true; }
    return false;
  }

  tryMove(direction) {
    const p = this.player;
    if (p.facing !== direction) { this.startTurn(p, direction); return; }
    const d = DIRECTIONS[direction];
    const nx = p.x + d.dx, ny = p.y + d.dy;
    // Directional carpets warp when pushed toward their edge (player_movement.asm .CheckWarp).
    const here = this.world.collisionAt(p.x, p.y);
    if (directionalCarpet[here] === direction) {
      const warp = this.world.warps.find((w) => w.x === p.x && w.y === p.y);
      if (warp) { this.warp(warp); return; }
    }
    // A ledge is hopped in one 32-frame arc, landing on the square beyond it.
    const there = this.world.collisionAt(nx, ny);
    if (isLedge(there) && LEDGE_DIRECTIONS[there & 7].includes(direction)) { this.startStep(p, direction, { frames: 2 * STEP_FRAMES, jump: true, distance: 2 }); return; }
    if (this.canWalkTo(nx, ny)) this.startStep(p, direction);
  }

  // ---- interaction ----------------------------------------------------------------------------------------------

  interact() {
    const p = this.player;
    const d = DIRECTIONS[p.facing];
    let tx = p.x + d.dx, ty = p.y + d.dy;
    let object = this.objectAt(tx, ty);
    // Counters (collision with TALK) let the player talk to whoever stands behind them.
    if (!object && (COLLISION_PERMISSIONS[this.world.collisionAt(tx, ty)] & TALK)) {
      const bx = tx + d.dx, by = ty + d.dy;
      object = this.objectAt(bx, by);
      if (object) { tx = bx; ty = by; }
    }
    if (object) {
      if (object.def.type !== 'OBJECTTYPE_SCRIPT' && object.def.type !== 'OBJECTTYPE_ITEMBALL') { this.unported.add(object.def.type); return false; }
      this.startScript(object.def.script, { caller: object });
      return true;
    }
    const events = this.world.bgEvents.filter((b) => b.x === tx && b.y === ty);
    for (const bg of events) {
      const facingOk = { BGEVENT_READ: true, BGEVENT_ITEM: true, BGEVENT_IFSET: true, BGEVENT_IFNOTSET: true,
        BGEVENT_UP: p.facing === 'up', BGEVENT_DOWN: p.facing === 'down', BGEVENT_LEFT: p.facing === 'left', BGEVENT_RIGHT: p.facing === 'right' }[bg.kind];
      if (facingOk === undefined) { this.unported.add(bg.kind); continue; }
      if (!facingOk) continue;
      this.startScript(bg.args[0], { caller: null, conditionalKind: bg.kind });
      return true;
    }
    return false;
  }

  async crossConnection(exit) {
    this.loading = true;
    const facing = this.player.facing;
    await this.enterMap(exit.map, exit.x, exit.y, facing);
    this.tileEventsEnabled = true;                               // MAPSETUP_CONNECTION enables events at once
  }

  // ---- warps ----------------------------------------------------------------------------------------------------

  warp(warp) {
    const prev = { map: this.world.id, warp: this.world.warps.indexOf(warp) + 1 };
    let destination = warp.destination;
    let destWarp = warp.destWarp;
    if (destination === 'LAST_MAP') destination = this.prev.map;
    if (destWarp === -1) destWarp = this.prev.warp;
    this.startWarpTo(destination, destWarp, prev);
  }

  async startWarpTo(mapId, warpNumber, prev) {
    this.loading = true;
    const target = loadWorld(mapId);
    const arrival = target.warps[warpNumber - 1];
    if (!arrival) throw new Error(`${mapId} has no warp ${warpNumber}`);
    this.prev = prev;
    this.fade = { frame: 0, frames: 16 };
    await this.enterMap(mapId, arrival.x, arrival.y, 'down');
  }

  // ---- scripts --------------------------------------------------------------------------------------------------

  startScript(label, { caller = null, conditionalKind = null } = {}) {
    if (this.failedScripts.has(label)) return;                   // a scene script that needs something not ported must not restart every frame
    const gen = runScript({ ...this.ctx, caller, conditionalKind }, label);
    this.runner = { gen, wait: null, caller, label };
    this.advanceRunner(undefined);
  }

  advanceRunner(value) {
    try { this.advanceRunnerUnsafe(value); } catch (e) {
      this.unported.add(`${this.runner?.label}: ${e.message}`);
      if (this.runner) this.failedScripts.add(this.runner.label);
      this.runner = null;                                         // abandon a script that needs something not ported
    }
  }

  advanceRunnerUnsafe(value) {
    const runner = this.runner;
    let answer = value;
    for (let guard = 0; guard < 100000; guard++) {
      const r = runner.gen.next(answer);
      answer = undefined;
      if (r.done) { this.runner = null; runner.after?.(r.value); return; }
      const request = r.value;
      switch (request.type) {
        case 'opentext': this.textboxOpen = true; this.lastTextLines = null; break;
        case 'closetext': this.textboxOpen = false; this.lastTextLines = null; break;
        case 'text': runner.wait = startTextWait(request.screens); this.textboxOpen = true; return;
        case 'waitbutton': case 'promptbutton': runner.wait = { kind: 'button' }; return;
        case 'yesorno': runner.wait = { kind: 'yesno', cursor: 0, x: request.x ?? 14 }; return;   // YesNoBox is at column 14; SaveTheGame_yesorno puts it at 0
        case 'movement': this.beginMovement(request); runner.wait = { kind: 'movement', object: request.object }; return;
        case 'special': {
          const blocking = this.applySpecial(request.name);
          if (blocking?.wait) { runner.wait = blocking.wait; return; }
          break;
        }
        case 'effect': {
          const blocking = this.applyEffect(request, { instant: false });
          if (blocking && blocking.wait) { runner.wait = blocking.wait; return; }
          answer = blocking;
          break;
        }
        default: throw new Error(`unknown request ${request.type}`);
      }
    }
    throw new Error('script did not yield');
  }

  /** Run a generator of script requests (not a script label), then call after(returnValue). */
  startFlow(gen, label, after) {
    this.runner = { gen, wait: null, caller: null, label, after };
    this.advanceRunner(undefined);
  }

  // ---- the start menu (engine/menus/start_menu.asm) -----------------------------------------------------------------

  updateMenu(input) {
    const m = this.menu;
    const items = startMenuItems(this.state);
    m.cursor = moveCursor(m, input.dir, m.cursor, items.length);
    this.menuCursor = m.cursor;
    if (input.b || input.start) { this.menu = null; return; }
    if (!input.a) return;
    const item = items[m.cursor];
    if (item === 'EXIT') this.menu = null;
    else if (item === 'SAVE') this.startSave();
    else this.unported.add(`start menu ${item}`);
  }

  startSave() {
    const { state, saveStore } = this;
    if (!saveStore) { this.unported.add('SAVE without a save store'); return; }
    let existing = null;
    try { existing = parseSave(saveStore.read()); } catch { /* nothing stored, or damaged: nothing to overwrite */ }
    this.menu.hollow = true;
    this.savingInfo = true;
    const flow = saveFlow(state, { existing, save: () => saveStore.write(serializeSave(this)) });
    this.startFlow(flow, 'SaveMenu', (saved) => {
      this.textboxOpen = false;
      this.lastTextLines = null;
      this.savingInfo = false;
      if (saved) this.menu = null;                             // StartMenu_Save returns 1: leave the menu
      else this.menu.hollow = false;                           // refused: back to the menu
    });
  }

  updateRunner(input) {
    const runner = this.runner;
    const wait = runner.wait;
    if (!wait) { this.advanceRunner(undefined); return; }
    switch (wait.kind) {
      case 'text': this.updateText(wait, input); break;
      case 'button': if (input.a || input.b) { runner.wait = null; this.advanceRunner(undefined); } break;
      case 'yesno':
        if (input.dir === 'up' && input.dirPressed !== false) wait.cursor = 0;
        if (input.dir === 'down' && input.dirPressed !== false) wait.cursor = 1;
        if (input.a) { runner.wait = null; this.advanceRunner(wait.cursor === 0); }
        else if (input.b) { runner.wait = null; this.advanceRunner(false); }
        break;
      case 'movement': {
        const mover = this.objectById(wait.object);
        if (!mover.step && !mover.sleep && !(mover.queue && mover.queue.length)) { runner.wait = null; this.advanceRunner(undefined); }
        break;
      }
      case 'frames': if (--wait.left <= 0) { runner.wait = null; if (wait.emote) this.emote = null; this.advanceRunner(undefined); } break;
      default: throw new Error(`unknown wait ${wait.kind}`);
    }
  }

  updateText(wait, input) {
    this.lastTextLines = wait.screens[wait.index].lines;     // stays on screen through the waitbutton or yes/no that follows
    if (stepTextWait(wait, input)) { this.runner.wait = null; this.advanceRunner(undefined); }
  }

  // ---- movement requests and effects ---------------------------------------------------------------------------

  beginMovement({ object, steps }) {
    const actor = this.objectById(object);
    actor.queue = [];
    for (const [command, direction] of steps) {
      const dir = direction?.toLowerCase();
      if (command === 'turn_head') { actor.queue.push({ direction: dir, turn: true }); continue; }
      if (command === 'fix_facing' || command === 'remove_fixed_facing') { actor.queue.push({ fix: command === 'fix_facing' }); continue; }
      if (command === 'step_sleep') { actor.queue.push({ sleep: Number(direction) }); continue; }   // stands still for that many frames
      if (command === 'set_sliding' || command === 'remove_sliding') continue;
      if (!(command in MOVEMENT_FRAMES)) throw new Error(`unsupported movement command ${command}`);
      actor.queue.push({ direction: dir, frames: MOVEMENT_FRAMES[command], jump: command.includes('jump') });
    }
  }

  teleportAlong({ object, steps }) {
    const actor = this.objectById(object);
    for (const [command, direction] of steps) {
      const dir = direction?.toLowerCase();
      if (command === 'turn_head') { actor.facing = dir; continue; }
      if (command in MOVEMENT_FRAMES) { actor.x += DIRECTIONS[dir].dx; actor.y += DIRECTIONS[dir].dy; actor.facing = dir; }
    }
  }

  /** Effects the interpreter hands over. Returns { wait } to block the script, a value for readvar, or undefined. */
  applyEffect({ name, args }, { instant }) {
    switch (name) {
      case 'faceplayer': {
        const npc = this.runner?.caller;
        if (npc) { const dx = this.player.x - npc.x, dy = this.player.y - npc.y; npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
        return undefined;
      }
      case 'turnobject': this.objectById(args[0]).facing = args[1].toLowerCase(); return undefined;
      case 'moveobject': { const o = this.objectById(args[0]); o.x = Number(args[1]); o.y = Number(args[2]); return undefined; }
      case 'appear': case 'disappear': this.objectById(args[0]).hidden = name === 'disappear'; return undefined;   // the interpreter changed the flag
      case 'pause': return instant ? undefined : { wait: { kind: 'frames', left: Number(args[0]) } };
      case 'showemote': {
        if (instant) return undefined;
        this.emote = { emote: args[0], object: args[1], frames: Number(args[2]) };
        return { wait: { kind: 'frames', left: Number(args[2]), emote: true } };
      }
      case 'readvar': return this.readVar(args[0]);
      case 'sdefer': this.deferred = args[0]; return undefined;
      case 'specialphonecall': return undefined;                  // the phone is not ported
      case 'changeblock': this.world.setBlockAt(Number(args[0]), Number(args[1]), Number(args[2].replace('$', '0x'))); return undefined;
      case 'follow': this.startFollow(args[0], args[1]); return undefined;
      case 'stopfollow': this.follow = null; return undefined;
      case 'warp': {
        // Script_warp: leave for the map and tile named, facing as given (down by default)
        const [map, x, y, facing] = args;
        this.loading = true;
        this.fade = { frame: 0, frames: 16 };
        this.enterMap(map, Number(x), Number(y), facing ? facing.toLowerCase() : 'down');
        return undefined;
      }
      case 'refreshmap': case 'reloadmap': case 'reloadmapafterbattle': case 'newloadmap': case 'dontrestartmapmusic': case 'playmapmusic': case 'warpsound': return undefined;
      case 'faceobject': {
        const [who, target] = args.map((a) => this.objectById(a));
        const dx = target.x - who.x, dy = target.y - who.y;
        who.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        return undefined;
      }
      case 'playsound': case 'specialsound': {
        // No audio yet, but the effect still takes its real time: waitsfx waits for it (scripting.asm, home/audio.asm WaitSFX).
        const frames = SFX_FRAMES[name === 'specialsound' ? 'SFX_ITEM' : args[0]];
        if (frames === undefined) { this.unported.add(`sound ${args[0]}`); return undefined; }
        this.sfxUntil = this.frame + (frames ?? 0);
        return undefined;
      }
      case 'waitsfx': {
        const left = (this.sfxUntil ?? 0) - this.frame;
        return instant || left <= 0 ? undefined : { wait: { kind: 'frames', left } };
      }
      case 'playmusic': case 'musicfadeout': case 'cry':
      case 'pokepic': this.pokepic = args[0] === 'USE_SCRIPT_VAR' ? String(this.state.scriptVar) : args[0]; return undefined;   // engine/events/pokepic.asm
      case 'closepokepic': this.pokepic = null; return undefined;
      case 'reanchormap': case 'addcellnum': case 'itemnotify':
        return undefined;                                         // audio and presentation are not ported yet
      default:
        this.unported.add(name);
        return undefined;
    }
  }

  readVar(variable) {
    if (variable === 'VAR_FACING') return upper(this.player.facing);
    this.unported.add(variable);
    return 0;
  }

  applySpecial(name) {
    switch (name) {
      case 'FadeOutToBlack': case 'FadeInFromBlack': {
        // palette fades take about 16 frames; the screen stays black between the two
        if (this.runner === null) return undefined;
        this.blackout = { from: name === 'FadeOutToBlack' ? 0 : 1, to: name === 'FadeOutToBlack' ? 1 : 0, frame: 0, frames: 16 };
        return { wait: { kind: 'frames', left: 16, fade: true } };
      }
      case 'ReloadSpritesNoPalettes': return undefined;
      case 'HealParty': case 'HealMachineAnim': case 'RestartMapMusic': case 'StubbedTrainerRankings_Healings': return;
      case 'ToggleDecorationsVisibility': return;                      // the interpreter sets the object flags
      case 'ToggleMaptileDecorations': {
        // engine/overworld/decorations.asm: write each owned decoration's block into the map.
        const owned = this.state.decorations ?? NEW_GAME_DECORATIONS;
        for (const kind of ['bed', 'plant', 'poster']) {
          if (!owned[kind]) continue;
          const [x, y] = DECORATION_PLACEMENT[kind];
          this.world.setBlockAt(x, y, DECORATION_BLOCKS[owned[kind]]);
        }
        if (owned.carpet) this.unported.add('carpet decoration');
        return;
      }      default: this.unported.add(name);
    }
  }
}

export { DIRECTION_NAMES, PLAYER_SPRITE, objectPaletteIndex };
