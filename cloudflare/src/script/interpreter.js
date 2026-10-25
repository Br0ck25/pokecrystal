// Runs the disassembly's own scripts (src/generated/scripts) following engine/overworld/scripting.asm.
//
// runScript is a generator: it applies state changes itself (event flags, variables, scenes, items, party) and yields
// a request for everything the player sees or waits for. The caller resumes it with the answer (a boolean for
// yesorno, undefined otherwise). Requests: { type: 'text', screens } | 'opentext' | 'closetext' | 'waitbutton' |
// 'promptbutton' | 'yesorno' | 'movement' { object, steps } | 'effect' { name, args } | 'special' { name }.
import { renderText } from './text.js';
import { EVENTS } from '../generated/events.js';
import { NEW_GAME_DECORATIONS } from '../generated/decorations.js';

export const DIRECTIONS = ['DOWN', 'UP', 'LEFT', 'RIGHT'];
const TIMES = { MORN: 1, DAY: 2, NITE: 4 };   // constants/time_constants.asm: 1 << MORN_F, DAY_F, NITE_F

/** Fresh script state for a new game. Event flags are managed by the caller (state.flags). */
export function createScriptState(overrides = {}) {
  return {
    flags: new Set(),            // event flags (EVENT_*)
    engineFlags: new Set(),      // engine flags (ENGINE_*)
    scriptVar: 0,                // wScriptVar
    scenes: {},                  // map name -> scene id
    buffers: {},                 // wStringBufferN contents
    items: {},                   // item name -> count
    party: [],                   // { species, level, item }
    timeOfDay: 'DAY',
    playerName: 'CHRIS',
    rivalName: 'SILVER',
    ...overrides,
  };
}

const isNumber = (t) => /^(\$[0-9a-fA-F]+|-?\d+)$/.test(t);
const toNumber = (t) => (t.startsWith('$') ? parseInt(t.slice(1), 16) : Number(t));
const CONSTANTS = { TRUE: 1, FALSE: 0 };

/** A script argument as a comparable value: a number for numeric constants, otherwise the constant's name. */
export function value(token) {
  if (typeof token === 'number') return token;
  if (isNumber(token)) return toNumber(token);
  return token in CONSTANTS ? CONSTANTS[token] : token;
}

// engine/overworld/decorations.asm: DecorationDesc_PosterPointers, ToggleDecorationsVisibility and InitDecorations.
const POSTER_SCRIPTS = { DECO_TOWN_MAP: 'DecorationDesc_TownMapPoster', DECO_PIKACHU_POSTER: 'DecorationDesc_PikachuPoster',
  DECO_CLEFAIRY_POSTER: 'DecorationDesc_ClefairyPoster', DECO_JIGGLYPUFF_POSTER: 'DecorationDesc_JigglypuffPoster' };
const DECORATION_VISIBILITY_FLAGS = { console: 'EVENT_PLAYERS_HOUSE_2F_CONSOLE', leftOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_1',
  rightOrnament: 'EVENT_PLAYERS_HOUSE_2F_DOLL_2', bigDoll: 'EVENT_PLAYERS_HOUSE_2F_BIG_DOLL' };
const decorations = (state) => state.decorations ?? NEW_GAME_DECORATIONS;
const setFlag = (state, flag, on) => (on ? state.flags.add(flag) : state.flags.delete(flag));

// Event flag gating each object (appear clears it, disappear sets it), by object constant such as ELMSLAB_OFFICER.
const OBJECT_FLAGS = new Map(Object.values(EVENTS).flatMap((m) => m.objects.filter((o) => o.id).map((o) => [o.id, o.eventFlag])));

/**
 * ctx: { mapName, sources: [{ SCRIPTS }...] searched in order for global labels (map, std, shared text),
 *        state, caller (object id of the NPC that was talked to, for faceplayer), mapIds: { mapName: sceneList } }
 */
export function* runScript(ctx, startLabel) {
  const { state } = ctx;
  const sources = ctx.sources;
  const stack = [];
  const env = () => ({ block: (l) => find(l)?.commands, vars: state.buffers, playerName: state.playerName, rivalName: state.rivalName });

  function find(label, scope) {
    const key = label.startsWith('.') ? `${scope.split('.')[0]}${label}` : label;
    for (let s = 0; s < sources.length; s++) {
      if (sources[s].SCRIPTS[key]) return { source: s, key, commands: sources[s].SCRIPTS[key] };
    }
    return undefined;
  }
  const enter = (label, scope = '') => {
    const found = find(label, scope);
    if (!found) throw new Error(`script label ${label} not found (from ${scope || startLabel})`);
    return { source: found.source, key: found.key, index: 0 };
  };

  let pos = enter(startLabel);
  const keysOf = (s) => (keysOf.cache[s] ??= Object.keys(sources[s].SCRIPTS));
  keysOf.cache = [];
  // Fetch the next command, falling through into the next label in file order as the assembled ROM does.
  const fetch = () => {
    for (;;) {
      const block = sources[pos.source].SCRIPTS[pos.key];
      if (pos.index < block.length) return block[pos.index++];
      const keys = keysOf(pos.source);
      const next = keys[keys.indexOf(pos.key) + 1];
      if (next === undefined) return null;
      pos = { source: pos.source, key: next, index: 0 };
    }
  };
  const jump = (label) => { pos = enter(label, pos.key); };
  const returnOrFinish = () => { if (stack.length === 0) return true; pos = stack.pop(); return false; };

  const sceneList = () => ctx.sceneLists[ctx.mapName] ?? [];
  const sceneId = (mapName, name) => {
    const index = (ctx.sceneLists[mapName] ?? []).findIndex(([, n]) => n === name);
    if (index < 0) throw new Error(`unknown scene ${name} for ${mapName}`);
    return index;
  };
  const showText = (label) => {
    const found = find(label, pos.key);
    if (!found) throw new Error(`text ${label} not found`);
    return { type: 'text', screens: renderText(found.commands, env()) };
  };
  const timeMask = (arg) => arg.split('|').reduce((m, t) => m | TIMES[t.trim()], 0);

  for (;;) {
    const command = fetch();
    if (command === null) return;
    const [name, ...args] = command;
    switch (name) {
      case 'end': if (returnOrFinish()) return; break;
      case 'endcallback': return;
      case 'sjump': case 'jump': jump(args[0]); break;
      case 'scall': stack.push({ ...pos }); jump(args[0]); break;
      case 'iftrue': if (state.scriptVar !== 0) jump(args[0]); break;
      case 'iffalse': if (state.scriptVar === 0) jump(args[0]); break;
      case 'ifequal': if (value(args[0]) === value(state.scriptVar)) jump(args[1]); break;
      case 'ifnotequal': if (value(args[0]) !== value(state.scriptVar)) jump(args[1]); break;
      case 'ifgreater': if (state.scriptVar > value(args[0])) jump(args[1]); break;
      case 'ifless': if (state.scriptVar < value(args[0])) jump(args[1]); break;
      case 'jumpstd': jump(args[0]); break;
      case 'variablesprite': (state.variableSprites ??= {})[args[0]] = args[1]; break;   // wVariableSprites
      case 'setval': state.scriptVar = value(args[0]); break;
      case 'addval': state.scriptVar += value(args[0]); break;
      case 'checkevent': state.scriptVar = state.flags.has(args[0]) ? 1 : 0; break;
      case 'setevent': state.flags.add(args[0]); break;
      case 'clearevent': state.flags.delete(args[0]); break;
      case 'checkflag': state.scriptVar = state.engineFlags.has(args[0]) ? 1 : 0; break;
      case 'setflag': state.engineFlags.add(args[0]); break;
      case 'clearflag': state.engineFlags.delete(args[0]); break;
      case 'checkscene': state.scriptVar = state.scenes[ctx.mapName] ?? 0; if (!sceneList().length) state.scriptVar = 0xff; break;
      case 'setscene': state.scenes[ctx.mapName] = sceneId(ctx.mapName, args[0]); break;
      case 'setmapscene': {
        const mapName = ctx.mapNameOf(args[0]);
        state.scenes[mapName] = sceneId(mapName, args[1]);
        break;
      }
      case 'checktime': state.scriptVar = (timeMask(args[0]) & TIMES[state.timeOfDay]) ? 1 : 0; break;
      case 'readvar': state.scriptVar = yield* readVar(args[0]); break;
      case 'checkitem': state.scriptVar = (state.items[args[0]] ?? 0) > 0 ? 1 : 0; break;
      case 'giveitem': state.items[args[0]] = (state.items[args[0]] ?? 0) + Number(args[1] ?? 1); state.scriptVar = 1; break;
      case 'takeitem': {
        const have = state.items[args[0]] ?? 0;
        state.scriptVar = have > 0 ? 1 : 0;
        if (have > 0) state.items[args[0]] = have - Number(args[1] ?? 1);
        break;
      }
      case 'givepoke': state.party.push({ species: args[0], level: Number(args[1]), item: args[2] }); state.scriptVar = 1; break;
      case 'getstring': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = findString(args[1]); break;
      case 'getmonname': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = args[1] === 'FROM_MEM' ? String(state.scriptVar) : args[1]; break;
      case 'getitemname': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = args[1]; break;
      case 'appear': state.flags.delete(objectFlag(args[0])); yield { type: 'effect', name, args }; break;
      case 'disappear': state.flags.add(objectFlag(args[0])); yield { type: 'effect', name, args }; break;
      case 'opentext': yield { type: 'opentext' }; break;
      case 'closetext': yield { type: 'closetext' }; break;
      case 'waitbutton': yield { type: 'waitbutton' }; break;
      case 'promptbutton': yield { type: 'promptbutton' }; break;
      case 'writetext': yield showText(args[0]); break;
      case 'farwritetext': yield showText(args[0]); break;
      case 'jumptext': case 'farjumptext': case 'jumptextfaceplayer':
        if (name === 'jumptextfaceplayer') yield { type: 'effect', name: 'faceplayer', args: [] };
        yield { type: 'opentext' }; yield showText(args[0]); yield { type: 'waitbutton' }; yield { type: 'closetext' };
        if (returnOrFinish()) return;
        break;
      case 'yesorno': state.scriptVar = (yield { type: 'yesorno' }) ? 1 : 0; break;
      case 'applymovement': yield { type: 'movement', object: args[0], steps: movementSteps(args[1]) }; break;
      case 'conditional_event': {
        // Data for BGEVENT_IFSET / BGEVENT_IFNOTSET: the script only runs when the flag matches (macros/scripts/maps.asm).
        const set = state.flags.has(args[0]);
        if (set === (ctx.conditionalKind !== 'BGEVENT_IFNOTSET')) jump(args[1]); else if (returnOrFinish()) return;
        break;
      }
      case 'describedecoration': {
        // engine/overworld/decorations.asm DescribeDecoration: only the poster can be seen in a new game
        // (the console, ornaments and big doll are hidden until owned, which the port does not support yet).
        if (args[0] !== 'DECODESC_POSTER') throw new Error(`${args[0]} is not supported yet`);
        jump(POSTER_SCRIPTS[state.decorations?.poster ?? 'DECO_TOWN_MAP'] ?? 'DecorationDesc_NullPoster');
        break;
      }
      case 'special':
        // ToggleDecorationsVisibility / ToggleMaptileDecorations write event flags from the owned decorations.
        if (args[0] === 'ToggleMaptileDecorations') setFlag(state, 'EVENT_PLAYERS_ROOM_POSTER', Boolean(decorations(state).poster));   // then the host writes the blocks
        if (args[0] === 'ToggleDecorationsVisibility') {
          for (const [kind, flag] of Object.entries(DECORATION_VISIBILITY_FLAGS)) setFlag(state, flag, !decorations(state)[kind]);
          break;
        }
        yield { type: 'special', name: args[0] }; break;
      case 'verbosegiveitem': {
        state.items[args[0]] = (state.items[args[0]] ?? 0) + Number(args[1] ?? 1);
        state.buffers.wStringBuffer4 = args[0];
        yield showText('_ReceivedItemText');
        yield { type: 'effect', name: 'waitsfx', args: [] };
        yield { type: 'effect', name: 'specialsound', args: [] };
        yield { type: 'waitbutton' };
        yield { type: 'effect', name: 'itemnotify', args: [args[0]] };
        break;
      }
      // Presentation and engine effects handled by the caller; they never change script state themselves.
      case 'faceplayer': case 'turnobject': case 'showemote': case 'pause': case 'playmusic': case 'playsound':
      case 'waitsfx': case 'musicfadeout': case 'follow': case 'stopfollow': case 'reanchormap': case 'moveobject':
      case 'pokepic': case 'closepokepic': case 'cry': case 'warp': case 'addcellnum': case 'sdefer':
      case 'itemnotify': case 'fix_facing': case 'remove_fixed_facing':
        yield { type: 'effect', name, args }; break;
      default:
        throw new Error(`unsupported script command ${name} in ${pos.key}`);
    }
  }

  function objectFlag(id) {
    if (!OBJECT_FLAGS.has(id)) throw new Error(`unknown object ${id}`);
    return OBJECT_FLAGS.get(id);
  }
  function findString(label) {
    const found = find(label, pos.key);
    if (!found) throw new Error(`string ${label} not found`);
    const [, text] = found.commands.find(([n]) => n === 'db');
    return text.replace(/@$/, '').replace(/#/g, 'POKé');
  }
  function movementSteps(label) {
    const found = find(label, pos.key);
    if (!found) throw new Error(`movement ${label} not found`);
    return found.commands.filter(([n]) => n !== 'step_end');
  }
  function* readVar(variable) {
    const answer = yield { type: 'effect', name: 'readvar', args: [variable] };
    return answer ?? 0;
  }
}
