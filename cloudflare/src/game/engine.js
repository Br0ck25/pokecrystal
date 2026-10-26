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
import { NamingScreen } from './naming.js';
import { OptionsScreen, options, TEXT_DELAYS } from './options.js';
import { PackScreen } from './pack.js';
import { PartyScreen } from './party.js';
import { Battle } from '../battle/battle.js';
import { BattleScreen } from '../battle/screen.js';
import { createMon, healParty } from '../script/mon.js';
import { SPAWN_POINTS, HOME_SPAWN } from '../generated/spawns.js';
import * as sharedText from '../generated/scripts/_text.js';
import { renderText } from '../script/text.js';
import { wildEncounter } from '../battle/wild.js';
import { trainerParty } from '../battle/trainer-party.js';
import { POKEMON } from '../generated/pokemon.js';
import { landmarkSign, SIGN_FRAMES } from './landmark.js';
import { stepNpc, endNpcWalk, LOOP_FRAMES } from './npc-ai.js';
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
// wJohtoBadges then wKantoBadges (constants/ram_constants.asm), bit by bit
const BADGES = ['ZEPHYR', 'HIVE', 'PLAIN', 'FOG', 'MINERAL', 'STORM', 'GLACIER', 'RISING', 'BOULDER', 'CASCADE', 'THUNDER', 'RAINBOW', 'SOUL', 'MARSH', 'VOLCANO', 'EARTH'];
const badgeBits = (state) => BADGES.reduce((bits, name, i) => bits | (state.engineFlags.has(`ENGINE_${name}BADGE`) ? 1 << i : 0), 0);

/** Frames for one square: measured, 1px per frame. */
export const STEP_FRAMES = 16;
export const TURN_FRAMES = 8;
/** Movement command speeds in frames per square (macros/scripts/movement.asm: slow, normal and big steps). */
const MOVEMENT_FRAMES = { slow_step: 32, step: 16, big_step: 8, slow_jump_step: 64, jump_step: 32, fast_jump_step: 16 };   // a jump covers two squares (JumpStep: StepFunction_*Jump lands on the second)
export { TEXT_FRAMES_PER_CHAR };

const LAND = 0;
const TALK = 0x10;
// player_movement.asm .TryJump: ledge tiles ($a0-$a7) can be hopped when moving in one of the directions listed (HOP_RIGHT, LEFT, UP, DOWN, then the diagonals).
const LEDGE_DIRECTIONS = [['right'], ['left'], ['up'], ['down'], ['right', 'down'], ['down', 'left'], ['up', 'right'], ['up', 'left']];
// home/map_objects.asm CheckSuperTallGrassTile and CheckGrassTile: tiles whose grass hides the lower body of whoever stands in them
// tile_events.asm CheckGrassCollision (water tiles are left out: surfing is not ported)
const ENCOUNTER_TILES = new Set([0x08, 0x18, 0x14, 0x28, 0x48, 0x49, 0x4a, 0x4b, 0x4c]);
const isGrass = (c) => c === 0x14 || c === 0x1c || (((c & 0xf0) === 0x10 || (c & 0xf0) === 0x20) && (c & 7) === 0);
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
    this.partyScreen = null;          // the party screen, opened from the start menu
    this.packScreen = null;           // the PACK screen, opened from the start menu
    this.optionScreen = null;         // the OPTION screen, opened from the start menu
    this.battleScreen = null;         // a battle in progress (src/battle/screen.js)
    this.wildCooldown = 5;            // wWildEncounterCooldown: SetUpFiveStepWildEncounterCooldown on entering a map
    this.menu = null;                 // the open start menu: { cursor, lastDir, repeat }
    this.randomByte = () => Math.floor(Math.random() * 256);     // Random; tests replace it
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
    this.wildCooldown = 5;
    this.world = world;
    this.tileAnim = new TileAnimator(world.tileset);
    this.failedScripts = new Set();
    this.player = { x, y, facing, step: null, parity: this.player.parity, queue: [] };
    this.objects = world.objects.map((def, index) => ({
      def, index, id: def.id ?? `${world.name}#${index}`, x: def.x, y: def.y, facing: initialFacing(def),
      step: null, queue: [], parity: 0, follow: null,
    }));
    this.follow = null;
    for (const actor of [this.player, ...this.objects]) actor.inGrass = isGrass(world.collisionAt(actor.x, actor.y));
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

  startStep(actor, direction, { force = false, frames = STEP_FRAMES, jump = false, distance = jump ? 2 : 1, wander = false } = {}) {
    const d = DIRECTIONS[direction];
    if (!actor.fixedFacing) actor.facing = direction;     // fix_facing keeps the sprite turned while it moves
    if (force && this.follow?.leader === actor) for (let i = 0; i < distance; i++) this.follow.steps.push(direction);
    const toX = actor.x + d.dx * distance, toY = actor.y + d.dy * distance;
    // InitStep + UpdateTallGrassFlags: whoever is in grass stays hidden only if the next square is grass too; a hop leaves the grass at once
    const intoGrass = isGrass(this.world.collisionAt(toX, toY));
    if (jump) actor.inGrass = false; else if (actor.inGrass) actor.inGrass = intoGrass;
    // NormalStep: entering tall grass at walking pace shakes it
    actor.step = { kind: 'walk', fromX: actor.x, fromY: actor.y, toX, toY, frame: 0, frames, jump, force, distance, wander, rustle: intoGrass && !jump && !wander && frames === STEP_FRAMES };
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
      actor.inGrass = isGrass(this.world.collisionAt(actor.x, actor.y));       // CopyCoordsTileToLastCoordsTile
      if (step.wander) endNpcWalk(actor, this.randomByte);
      if (actor === this.player) this.tileEventsEnabled = true;   // events.asm CheckPlayerState: re-enabled when a step ends
    }
    actor.step = null;
    return true;                                                  // finished this frame
  }

  /** CanObjectMoveInDirection for a wandering object: land, nobody there, inside its movement radius and the screen. */
  npcCanWalk(object, direction) {
    const d = DIRECTIONS[direction], x = object.x + d.dx, y = object.y + d.dy;
    if (!this.canWalkTo(x, y)) return false;
    const p = this.player;
    if ((p.x === x && p.y === y) || (p.step && p.step.toX === x && p.step.toY === y)) return false;
    const [rx, ry] = object.def.radius.map(Number);                        // the object may stray rx, ry tiles from where it started
    if (Math.abs(x - object.def.x) === rx + 1 || Math.abs(y - object.def.y) === ry + 1) return false;
    return x >= p.x - 4 && x <= p.x + 5 && y >= p.y - 4 && y <= p.y + 4;   // IsObjectMovingOffEdgeOfScreen
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
    // objects act on their own between scripts and menus (the loop that runs them does not run while text is waiting)
    if (!this.runner && !this.menu && this.frame % LOOP_FRAMES === 0) for (const object of this.visibleObjects()) stepNpc(this, object, this.randomByte);
    if (this.battleScreen) { this.updateBattle(input); return; }
    if (this.runner) { this.updateRunner(input); return; }
    if (this.partyScreen) { if (this.partyScreen.update(input)) { for (const u of this.partyScreen.unported) this.unported.add(u); this.partyScreen = null; } return; }
    if (this.packScreen) { if (this.packScreen.update(input)) { for (const u of this.packScreen.unported) this.unported.add(u); this.packScreen = null; } return; }
    if (this.optionScreen) { if (this.optionScreen.update(input)) this.optionScreen = null; return; }
    if (this.menu) { this.updateMenu(input); return; }
    if (this.player.step) return;
    this.idleEvents(input);
  }

  /** The pictures a battle needs, decoded: the player's back, the party's backs and the fronts of the enemy species (and the trainer's own picture). */
  async battleArt(enemySpecies, trainerClass = null) {
    const gender = this.state.playerGender === 'FEMALE' ? 'KRIS' : 'CHRIS';
    const partySpecies = [...new Set(this.state.party.map((m) => m.species))];
    const fronts = [...new Set(enemySpecies)];
    const [back, trainerArt, partyMods, frontMods] = await Promise.all([
      import(`../generated/trainers/${gender}.js`),
      trainerClass ? import(`../generated/trainers/${trainerClass}.js`) : null,
      Promise.all(partySpecies.map((sp) => import(`../generated/pokemon/${sp}.js`))),
      Promise.all(fronts.map((sp) => import(`../generated/pokemon/${sp}.js`))),
    ]);
    const front = (mod) => { const tiles = mod.PIC.size / 8; return { size: mod.PIC.size, pixels: mod.PIC.front, palette: mod.PIC.palette, offX: tiles < 7 ? 1 : 0, offY: 7 - tiles }; };   // PadFrontpic: smaller pictures sit at the bottom
    const enemyMons = Object.fromEntries(fronts.map((sp, i) => [sp, front(frontMods[i])]));
    return {
      enemy: trainerArt ? { size: trainerArt.PIC.size, pixels: trainerArt.PIC.pixels, palette: trainerArt.PIC.palette, offX: 0, offY: 0 } : enemyMons[enemySpecies[0]],
      enemyMons,
      player: { size: 48, pixels: back.PIC.back, palette: back.PIC.palette },
      playerMons: Object.fromEntries(partySpecies.map((sp, i) => [sp, { size: 48, pixels: partyMods[i].PIC.back, palette: partyMods[i].PIC.palette }])),
    };
  }

  /** BattleStart for a wild Pokémon: load the pictures, then the battle screen takes over until it reports a result. */
  async startWildBattle({ species, level }) {
    this.loading = true;
    const dvs = [this.randomByte(), this.randomByte()];
    const enemy = createMon({ species, level, dvs, id: 0 });
    const lead = this.state.party.find((m) => m.hp > 0);
    (this.state.dexSeen ??= new Set()).add(species);
    this.state.dexCaught ??= new Set();
    const pics = await this.battleArt([species]);
    const battle = new Battle({ player: this.state.party, enemy, wild: true, random: this.randomByte, playerId: this.state.playerId, badges: badgeBits(this.state), state: this.state, shiftStyle: options(this.state).battleShift });
    const name = POKEMON[species].name;
    this.battleScreen = new BattleScreen({ battle, state: this.state, pics, intro: [['text', 'Wild '], ['text', name], ['line', 'appeared!'], ['prompt']], lead });
    this.loading = false;
  }

  /** The battle of a `startbattle` script command: a trainer's party (LoadTrainer + ReadTrainerParty). */
  async startTrainerBattle(request) {
    this.loading = true;
    const { cls, id } = request.trainer;
    const trainer = trainerParty(cls, id);
    const pics = await this.battleArt(trainer.party.map((m) => m.species), cls);
    const info = { name: trainer.name, className: trainer.className, cls, canLose: request.canLose, reward: trainer.reward, ai: trainer.ai, items: trainer.items, flags: trainer.flags, win: request.win, loss: request.loss };
    const battle = new Battle({ player: this.state.party, enemy: trainer.party, wild: false, random: this.randomByte, playerId: this.state.playerId, badges: badgeBits(this.state), state: this.state, trainerInfo: info, shiftStyle: options(this.state).battleShift });
    const intro = [['text', `${trainer.className} ${trainer.name}`], ['line', 'wants to battle!'], ['prompt']];
    this.battleScreen = new BattleScreen({ battle, state: this.state, pics, intro, trainer: true });
    this.loading = false;
  }

  updateBattle(input) {
    const result = this.battleScreen.update({ ...input, delay: TEXT_DELAYS[options(this.state).textSpeed] });
    if (!result) return;
    for (const u of this.battleScreen.unported) this.unported.add(u);
    this.battleScreen = null;
    const runner = this.battleRunner;
    this.battleRunner = null;
    const canLose = this.battleCanLose; this.battleCanLose = false;
    if (result.result === 'lose' && !canLose) { this.runner = null; this.startWhiteout(); return; }   // the script that began the battle never resumes
    if (runner) { runner.wait = null; this.advanceRunner(result); }
  }

  /** Script_BattleWhiteout/Script_Whiteout: the text, a fade to white, healing, half the money, then the last Pokécenter's spawn point (or home). */
  startWhiteout() {
    const state = this.state;
    const env = { block: (l) => sharedText.SCRIPTS[l], vars: state.buffers, playerName: state.playerName, rivalName: state.rivalName };
    const flow = (function* () {
      yield { type: 'text', screens: renderText([['text_far', '_WhitedOutText']], env) };
      yield { type: 'waitbutton' };
      yield { type: 'special', name: 'FadeOutToWhite' };
      yield { type: 'effect', name: 'pause', args: [40] };
    })();
    this.startFlow(flow, 'Whiteout', () => {
      healParty(state.party);
      state.money = Math.floor(state.money / 2);
      const spawn = state.blackout in SPAWN_POINTS ? state.blackout : HOME_SPAWN;
      const [x, y] = SPAWN_POINTS[spawn];
      this.blackout = null;
      this.fade = { frame: 0, frames: 16 };
      this.enterMap(spawn, x, y, 'down');
    });
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
    if (this.checkTrainerEvent()) return;
    if (this.tileEvents()) return;
    if (this.runScene()) return;
    if (input.start) { this.menu = { cursor: Math.min(this.menuCursor, startMenuItems(this.state).length - 1), lastDir: null, repeat: 0 }; return; }
    if (input.a && this.interact()) return;
    if (input.dir) this.tryMove(input.dir);
  }

  /** home/trainers.asm _CheckTrainerBattle: a trainer facing the player in a straight line, within sight, who has not been beaten, starts the encounter. */
  checkTrainerEvent() {
    if (!this.state.party?.length) return false;
    const p = this.player;
    for (const o of this.visibleObjects()) {
      if (o === p || o.def.type !== 'OBJECTTYPE_TRAINER' || o.step) continue;
      const dx = p.x - o.x, dy = p.y - o.y;
      if ((dx !== 0) === (dy !== 0)) continue;                    // same row or column, not on the same square
      const facing = dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (o.facing !== facing) continue;
      const distance = Math.abs(dx) + Math.abs(dy);
      if (distance > o.def.sight) continue;
      const flag = this.ctx.sources.find((src) => src.SCRIPTS[o.def.script])?.SCRIPTS[o.def.script][0][3];
      if (this.state.flags.has(flag)) continue;
      this.startScript(o.def.script, { caller: o, trainerSeen: { distance } });
      return true;
    }
    return false;
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
    return this.checkWildEncounter();
  }

  /** events.asm RandomEncounter: five steps of cooldown after entering a map, then a roll per step on grass (or anywhere in caves). */
  checkWildEncounter() {
    if (!this.state.party?.length) return false;                // STATUSFLAGS_NO_WILD_ENCOUNTERS holds until the first Pokémon
    if (this.wildCooldown > 0 && --this.wildCooldown > 0) return false;
    const { x, y } = this.player, environment = this.world.environment;
    if (environment !== 'CAVE' && environment !== 'DUNGEON' && !ENCOUNTER_TILES.has(this.world.collisionAt(x, y))) return false;
    const found = wildEncounter({
      map: this.world.id, timeOfDay: ['MORN', 'DAY', 'NITE'].indexOf(this.state.timeOfDay), party: this.state.party,
      repelSteps: this.state.repelSteps ?? 0, random: this.randomByte,
    });
    if (!found) return false;
    this.startWildBattle(found).catch((e) => { throw e; });
    return true;
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
    if (this.canWalkTo(nx, ny)) { this.startStep(p, direction); return; }
    // player_movement.asm .TryJump: standing on a ledge square, a step that failed becomes one 32-frame hop over the next square
    const standing = this.world.collisionAt(p.x, p.y);
    if (isLedge(standing) && LEDGE_DIRECTIONS[standing & 7].includes(direction)) this.startStep(p, direction, { frames: MOVEMENT_FRAMES.jump_step, jump: true });
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
      if (object.step) return false;                              // CheckFacingObject: only someone standing still can be talked to
      if (!['OBJECTTYPE_SCRIPT', 'OBJECTTYPE_ITEMBALL', 'OBJECTTYPE_TRAINER'].includes(object.def.type)) { this.unported.add(object.def.type); return false; }
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

  startScript(label, { caller = null, conditionalKind = null, trainerSeen = null } = {}) {
    if (this.failedScripts.has(label)) return;                   // a scene script that needs something not ported must not restart every frame
    const gen = runScript({ ...this.ctx, caller, conditionalKind, trainerSeen }, label);
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
        case 'battle':
          runner.wait = { kind: 'battle' };
          this.battleRunner = runner;
          this.battleCanLose = Boolean(request.canLose);
          this.startTrainerBattle(request).catch((e) => { throw e; });
          return;
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
    else if (item === 'POKEMON') this.partyScreen = new PartyScreen(this.state);
    else if (item === 'PACK') this.packScreen = new PackScreen(this.state);
    else if (item === 'OPTION') this.optionScreen = new OptionsScreen(options(this.state));
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
      case 'naming': { const done = wait.screen.update(input); if (done) { runner.wait = null; this.advanceRunner(done.name); } break; }
      case 'battle': break;                                        // the battle screen (or its loading) has the frame loop
      case 'frames': if (--wait.left <= 0) { runner.wait = null; if (wait.emote) this.emote = null; this.advanceRunner(undefined); } break;
      default: throw new Error(`unknown wait ${wait.kind}`);
    }
  }

  updateText(wait, input) {
    this.lastTextLines = wait.screens[wait.index].lines;     // stays on screen through the waitbutton or yes/no that follows
    if (stepTextWait(wait, { ...input, delay: TEXT_DELAYS[options(this.state).textSpeed] })) { this.runner.wait = null; this.advanceRunner(undefined); }
  }

  // ---- movement requests and effects ---------------------------------------------------------------------------

  beginMovement({ object, steps }) {
    const actor = this.objectById(object);
    actor.queue = [];
    actor.ai = null;                                              // after the script it starts over, like ResetObject
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
      if (command in MOVEMENT_FRAMES) { const n = command.includes('jump') ? 2 : 1; actor.x += DIRECTIONS[dir].dx * n; actor.y += DIRECTIONS[dir].dy * n; actor.facing = dir; }
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
      case 'trainerwalk': {                                       // TrainerWalkToPlayer: one square short of the player, at the normal step speed
        const steps = Array.from({ length: Number(args[0]) - 1 }, () => ['step', upper(this.runner.caller.facing)]);
        if (!steps.length || instant) return undefined;
        this.beginMovement({ object: this.runner.caller.id, steps });
        return { wait: { kind: 'movement', object: this.runner.caller.id } };
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
      case 'playmusic': case 'musicfadeout': case 'cry': return undefined;                 // audio is not ported yet
      case 'pokepic': this.pokepic = args[0] === 'USE_SCRIPT_VAR' ? String(this.state.scriptVar) : args[0]; return undefined;   // engine/events/pokepic.asm
      case 'closepokepic': this.pokepic = null; return undefined;
      case 'namemon': {                                           // engine/pokemon/move_mon.asm InitNickname: the naming screen takes the whole screen
        if (instant) return undefined;
        const [species, gender] = args;
        return { wait: { kind: 'naming', screen: new NamingScreen({ mon: { species, name: POKEMON[species].name, gender } }) } };
      }
      case 'reanchormap': case 'addcellnum': case 'itemnotify':
        return undefined;                                         // audio and presentation are not ported yet
      default:
        this.unported.add(name);
        return undefined;
    }
  }

  readVar(variable) {
    if (variable === 'VAR_BADGES') return badgeBits(this.state).toString(2).replace(/0/g, '').length;
    if (variable === 'VAR_FACING') return upper(this.player.facing);
    this.unported.add(variable);
    return 0;
  }

  applySpecial(name) {
    switch (name) {
      case 'FadeOutToWhite': {
        this.blackout = { from: 0, to: 1, frame: 0, frames: 16, white: true };
        return { wait: { kind: 'frames', left: 16, fade: true } };
      }
      case 'FadeOutToBlack': case 'FadeInFromBlack': {
        // palette fades take about 16 frames; the screen stays black between the two
        if (this.runner === null) return undefined;
        this.blackout = { from: name === 'FadeOutToBlack' ? 0 : 1, to: name === 'FadeOutToBlack' ? 1 : 0, frame: 0, frames: 16 };
        return { wait: { kind: 'frames', left: 16, fade: true } };
      }
      case 'ReloadSpritesNoPalettes': return undefined;
      case 'HealParty': healParty(this.state.party); return;
      case 'HealMachineAnim': case 'RestartMapMusic': case 'StubbedTrainerRankings_Healings': return;
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
