// The game loop: player movement, map events, NPCs and the script runner. Pure and frame-stepped (60 updates per
// second) so it can run headless in tests; app.js only draws it and feeds it input.
//
// Rules come from the disassembly: engine/overworld/player_movement.asm, events.asm, tile_events.asm,
// warp_connection.asm and scripting.asm; step and animation timings were measured against the real game.
import { loadWorld } from './world.js';
import { createScriptContext } from '../script/context.js';
import { runScript, createScriptState } from '../script/interpreter.js';
import { COLLISION_PERMISSIONS, COLLISION_VALUES } from '../generated/collision.js';
import { SCENES, CALLBACKS } from '../generated/scenes.js';
import { SPRITES } from '../generated/sprites.js';
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
const MOVEMENT_FRAMES = { slow_step: 32, step: 16, big_step: 8, jump_step: 16, fast_jump_step: 8 };
export const TEXT_FRAMES_PER_CHAR = 3;

const LAND = 0;
const TALK = 0x10;
const warpTile = (c) => c === COLLISION_VALUES.PIT || c === COLLISION_VALUES.PIT_68 || (c & 0xf0) === 0x70;
const directionalCarpet = { [COLLISION_VALUES.WARP_CARPET_DOWN]: 'down', [COLLISION_VALUES.WARP_CARPET_UP]: 'up',
  [COLLISION_VALUES.WARP_CARPET_LEFT]: 'left', [COLLISION_VALUES.WARP_CARPET_RIGHT]: 'right' };
// player_movement.asm .warps: standing on these walks the player down one square (leaving a door or stairs).
const WALK_DOWN_TILES = new Set([COLLISION_VALUES.DOOR, COLLISION_VALUES.DOOR_79, COLLISION_VALUES.STAIRCASE, COLLISION_VALUES.CAVE]);

export class Game {
  constructor({ mapId, x, y, facing = 'down', state = createScriptState() } = {}) {
    this.state = state;
    this.frame = 0;
    this.player = { x, y, facing, step: null, parity: 0, queue: [] };
    this.objects = [];
    this.world = null;
    this.ctx = null;
    this.runner = null;
    this.textboxOpen = false;
    this.emote = null;
    this.unported = new Set();        // script specials the port does not implement yet
    this.prev = { map: null, warp: null };
    this.fade = null;
    this.ready = this.enterMap(mapId, x, y, facing, { newGame: true });
  }

  // ---- map entry ----------------------------------------------------------------------------------------------

  async enterMap(mapId, x, y, facing, { warpFrom = null } = {}) {
    this.loading = true;
    const world = loadWorld(mapId);
    this.ctx = await createScriptContext(world.name, this.state);
    this.world = world;
    this.player = { x, y, facing, step: null, parity: this.player.parity, queue: [] };
    this.objects = world.objects.map((def, index) => ({
      def, index, id: def.id ?? `${world.name}#${index}`, x: def.x, y: def.y, facing: initialFacing(def),
      step: null, queue: [], parity: 0, follow: null,
    }));
    this.follow = null;
    this.deferred = null;
    this.loading = false;
    // MAPCALLBACK_NEWMAP, then OBJECTS and TILES (home/map.asm LoadMapAttributes / HandleNewMap order).
    for (const type of ['MAPCALLBACK_NEWMAP', 'MAPCALLBACK_OBJECTS', 'MAPCALLBACK_TILES']) {
      for (const [callbackType, script] of CALLBACKS[world.name] ?? []) {
        if (callbackType === type) this.runInstant(script);
      }
    }
    // Arriving on a door, staircase or cave square walks the player down one square.
    if (WALK_DOWN_TILES.has(this.world.collisionAt(x, y))) this.startStep(this.player, 'down', { force: true });
    return this;
  }

  /** Run a callback or scene script to completion in this frame, resolving effects at once. */
  runInstant(label) {
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
    const found = this.objects.find((o) => o.id === id);
    if (!found) throw new Error(`no object ${id} on ${this.world.name}`);
    return found;
  }

  /** The sprite an object draws: variable sprites (wVariableSprites) resolve through the script state. */
  spriteOf(def) { return this.state.variableSprites?.[def.sprite] ?? def.sprite; }

  isVisible(object) {
    const def = object.def;
    if (!SPRITES[this.spriteOf(def)]) return false;               // Pokémon sprites and unset variable sprites are not ported
    if (def.eventFlag !== '-1' && this.state.flags.has(def.eventFlag)) return false;
    const [from, until] = def.hours;
    if (from === -1) return until === -1 || String(until).split('|').map((t) => t.trim()).includes(this.state.timeOfDay);
    throw new Error(`hour-limited object ${def.id} is not supported yet`);
  }

  visibleObjects() { return this.objects.filter((o) => this.isVisible(o)); }

  objectAt(x, y, except = null) {
    return this.visibleObjects().find((o) => o !== except && ((o.x === x && o.y === y) || (o.step && o.step.toX === x && o.step.toY === y)));
  }

  // ---- stepping -----------------------------------------------------------------------------------------------

  startStep(actor, direction, { force = false, frames = STEP_FRAMES, jump = false } = {}) {
    const d = DIRECTIONS[direction];
    actor.facing = direction;
    actor.step = { kind: 'walk', fromX: actor.x, fromY: actor.y, toX: actor.x + d.dx, toY: actor.y + d.dy, frame: 0, frames, jump, force };
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
    if (this.fade) { this.fade.frame++; if (this.fade.frame >= this.fade.frames) this.fade = null; }
    for (const object of this.objects) this.updateActor(object);
    this.updateActor(this.player);
    if (this.runner) { this.updateRunner(input); return; }
    if (this.player.step) return;
    this.idleEvents(input);
  }

  /** Advance an actor's step and start the next scripted movement from its queue (turns are instant). */
  updateActor(actor) {
    this.advanceStep(actor);
    while (!actor.step && actor.queue.length) {
      const next = actor.queue.shift();
      if (next.turn) { actor.facing = next.direction; continue; }
      this.startStep(actor, next.direction, { frames: next.frames, force: true });
    }
  }

  idleEvents(input) {
    // engine/overworld/events.asm PlayerEvents: tile events, then the scene script, then the joypad.
    if (this.tileEvents()) return;
    if (this.runScene()) return;
    if (input.a && this.interact()) return;
    if (input.dir) this.tryMove(input.dir);
  }

  tileEvents() {
    const { x, y } = this.player;
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
    this.runInstant(entry[0]);
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
      if (object.def.type !== 'OBJECTTYPE_SCRIPT') { this.unported.add(object.def.type); return false; }
      this.startScript(object.def.script, { caller: object });
      return true;
    }
    const events = this.world.bgEvents.filter((b) => b.x === tx && b.y === ty);
    for (const bg of events) {
      const facingOk = { BGEVENT_READ: true, BGEVENT_IFSET: true, BGEVENT_IFNOTSET: true,
        BGEVENT_UP: p.facing === 'up', BGEVENT_DOWN: p.facing === 'down', BGEVENT_LEFT: p.facing === 'left', BGEVENT_RIGHT: p.facing === 'right' }[bg.kind];
      if (facingOk === undefined) { this.unported.add(bg.kind); continue; }
      if (!facingOk) continue;
      this.startScript(bg.args[0], { caller: null, conditionalKind: bg.kind });
      return true;
    }
    return false;
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
    const gen = runScript({ ...this.ctx, caller, conditionalKind }, label);
    this.runner = { gen, wait: null, caller };
    this.advanceRunner(undefined);
  }

  advanceRunner(value) {
    const runner = this.runner;
    let answer = value;
    for (let guard = 0; guard < 100000; guard++) {
      const r = runner.gen.next(answer);
      answer = undefined;
      if (r.done) { this.runner = null; return; }
      const request = r.value;
      switch (request.type) {
        case 'opentext': this.textboxOpen = true; this.lastTextLines = null; break;
        case 'closetext': this.textboxOpen = false; this.lastTextLines = null; break;
        case 'text': runner.wait = { kind: 'text', screens: request.screens, index: 0, chars: this.screenStart(request.screens, 0), timer: 0, ready: false }; this.textboxOpen = true; return;
        case 'waitbutton': case 'promptbutton': runner.wait = { kind: 'button' }; return;
        case 'yesorno': runner.wait = { kind: 'yesno', cursor: 0 }; return;
        case 'movement': this.beginMovement(request); runner.wait = { kind: 'movement', object: request.object }; return;
        case 'special': this.applySpecial(request.name); break;
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

  screenStart(screens, index) {
    return index > 0 && screens[index - 1].wait === 'cont' ? screens[index - 1].lines[1].length : 0;
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
        if (!mover.step && !(mover.queue && mover.queue.length)) { runner.wait = null; this.advanceRunner(undefined); }
        break;
      }
      case 'frames': if (--wait.left <= 0) { runner.wait = null; if (wait.emote) this.emote = null; this.advanceRunner(undefined); } break;
      default: throw new Error(`unknown wait ${wait.kind}`);
    }
  }

  updateText(wait, input) {
    const screen = wait.screens[wait.index];
    const total = screen.lines[0].length + screen.lines[1].length;
    this.lastTextLines = screen.lines;                 // stays on screen through the waitbutton or yes/no that follows
    if (!wait.ready) {
      wait.timer++;
      const per = (input.aHeld || input.bHeld) ? 1 : TEXT_FRAMES_PER_CHAR;
      if (wait.timer >= per) { wait.timer = 0; wait.chars++; }
      if (wait.chars >= total) wait.ready = true;
      return;
    }
    const last = wait.index === wait.screens.length - 1;
    if (screen.wait === null) { this.runner.wait = null; this.advanceRunner(undefined); return; }
    if (!(input.a || input.b)) return;
    if (last) { this.runner.wait = null; this.advanceRunner(undefined); return; }
    wait.index++;
    wait.chars = this.screenStart(wait.screens, wait.index);
    wait.timer = 0;
    wait.ready = false;
  }

  // ---- movement requests and effects ---------------------------------------------------------------------------

  beginMovement({ object, steps }) {
    const actor = this.objectById(object);
    actor.queue = [];
    for (const [command, direction] of steps) {
      const dir = direction?.toLowerCase();
      if (command === 'turn_head') { actor.queue.push({ direction: dir, turn: true }); continue; }
      if (command === 'fix_facing' || command === 'remove_fixed_facing') continue;
      if (!(command in MOVEMENT_FRAMES)) throw new Error(`unsupported movement command ${command}`);
      actor.queue.push({ direction: dir, frames: MOVEMENT_FRAMES[command] });
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
      case 'appear': case 'disappear': return undefined;          // the interpreter already changed the event flag
      case 'pause': return instant ? undefined : { wait: { kind: 'frames', left: Number(args[0]) } };
      case 'showemote': {
        if (instant) return undefined;
        this.emote = { emote: args[0], object: args[1], frames: Number(args[2]) };
        return { wait: { kind: 'frames', left: Number(args[2]), emote: true } };
      }
      case 'readvar': return this.readVar(args[0]);
      case 'sdefer': this.deferred = args[0]; return undefined;
      case 'follow': this.follow = { leader: args[0], follower: args[1] }; return undefined;
      case 'stopfollow': this.follow = null; return undefined;
      case 'warp': this.unported.add('warp'); return undefined;
      case 'playmusic': case 'playsound': case 'waitsfx': case 'musicfadeout': case 'specialsound': case 'cry':
      case 'reanchormap': case 'pokepic': case 'closepokepic': case 'addcellnum': case 'itemnotify':
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
