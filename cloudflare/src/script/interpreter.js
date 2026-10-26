// Runs the disassembly's own scripts (src/generated/scripts) following engine/overworld/scripting.asm.
//
// runScript is a generator: it applies state changes itself (event flags, variables, scenes, items, party) and yields
// a request for everything the player sees or waits for. The caller resumes it with the answer (a boolean for
// yesorno, undefined otherwise). Requests: { type: 'text', screens } | 'opentext' | 'closetext' | 'waitbutton' |
// 'promptbutton' | 'yesorno' | 'movement' { object, steps } | 'effect' { name, args } | 'special' { name }.
import { renderText } from './text.js';
import { EVENTS } from '../generated/events.js';
import { NEW_GAME_DECORATIONS } from '../generated/decorations.js';
import { FRUIT_TREE_ITEMS } from '../generated/fruit-trees.js';
import { POKEMON } from '../generated/pokemon.js';
import { monGender } from './gender.js';
import { createMon } from './mon.js';
import { receiveItem, tossItem, itemName, pocketOf, POCKET_NAMES } from './bag.js';

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
    money: 3000,                 // wMoney (NewGame)
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
        // Maps without a scene variable (Route 43) take a plain number that nothing reads.
        state.scenes[mapName] = isNumber(args[1]) ? toNumber(args[1]) : sceneId(mapName, args[1]);
        break;
      }
      case 'checktime': state.scriptVar = (timeMask(args[0]) & TIMES[state.timeOfDay]) ? 1 : 0; break;
      case 'readvar': state.scriptVar = yield* readVar(args[0]); break;
      case 'checkitem': state.scriptVar = (state.items[args[0] === 'ITEM_FROM_MEM' ? state.scriptVar : args[0]] ?? 0) > 0 ? 1 : 0; break;
      case 'giveitem': {
        const item = args[0] === 'ITEM_FROM_MEM' ? state.scriptVar : args[0];
        state.curItem = item;
        state.scriptVar = receiveItem(state, item, Number(args[1] ?? 1)) ? 1 : 0;
        break;
      }
      case 'takeitem': {
        state.scriptVar = tossItem(state, args[0], Number(args[1] ?? 1)) ? 1 : 0;
        break;
      }
      case 'givepoke': {
        // Script_givepoke -> GivePoke: a gift without a nickname/OT argument is "caught", so the player is asked about a nickname
        const species = args[0], speciesName = POKEMON[species].name;
        const dvs = [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)];
        const mon = createMon({ species, level: Number(args[1]), dvs, id: state.playerId, item: args[2] === 'NO_ITEM' ? null : args[2] });
        state.party.push(mon);
        if (!args[3] || args[3] === '0') {
          state.buffers.wStringBuffer1 = speciesName;
          yield showText('_CaughtAskNicknameText');
          if (yield { type: 'yesorno' }) mon.nickname = (yield { type: 'effect', name: 'namemon', args: [species, monGender(species, mon.dvs)] }) || speciesName;   // InitName: blank keeps the species name
        }
        state.scriptVar = 1;
        break;
      }
      case 'getstring': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = findString(args[1]); break;
      case 'getmonname': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = args[1] === 'FROM_MEM' ? String(state.scriptVar) : args[1]; break;
      case 'getitemname': state.buffers[args[0].replace('STRING_BUFFER_', 'wStringBuffer')] = itemName(args[1] === 'USE_SCRIPT_VAR' ? state.scriptVar : args[1]); break;
      case 'appear': args[0] = realId(args[0]); state.flags.delete(objectFlag(args[0])); yield { type: 'effect', name, args }; break;
      case 'disappear': args[0] = realId(args[0]); state.flags.add(objectFlag(args[0])); yield { type: 'effect', name, args }; break;
      case 'blackoutmod': state.blackout = args[0]; break;                                   // wLastSpawnMapGroup/Number
      case 'setlasttalked': state.lastTalked = args[0]; break;                               // hLastTalked
      case 'applymovementlasttalked': yield { type: 'movement', object: realId('LAST_TALKED'), steps: movementSteps(args[0]) }; break;
      case 'warp': yield { type: 'effect', name, args }; return;                             // Script_warp: StopScript
      case 'warpfacing': yield { type: 'effect', name: 'warp', args: [...args.slice(1), args[0]] }; return;
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
      case 'verbosegiveitem': case 'verbosegiveitemvar': {
        // scripting.asm Script_verbosegiveitem + GiveItemScript
        const item = args[0] === 'ITEM_FROM_MEM' ? state.scriptVar : args[0];
        const quantity = name === 'verbosegiveitem' ? Number(args[1] ?? 1) : Number(state.scriptVar);
        state.curItem = item;
        state.scriptVar = receiveItem(state, item, quantity) ? 1 : 0;
        state.buffers.wStringBuffer4 = itemName(item);
        yield showText('_ReceivedItemText');
        if (state.scriptVar === 0) { yield { type: 'promptbutton' }; yield* pocketIsFull(); break; }
        yield { type: 'effect', name: 'waitsfx', args: [] };
        yield { type: 'effect', name: 'specialsound', args: [] };
        yield { type: 'waitbutton' };
        yield* itemNotify();
        break;
      }
      case 'itemnotify': yield* itemNotify(); break;
      case 'refreshmap': case 'reloadmap': case 'reloadmapafterbattle': case 'newloadmap': case 'dontrestartmapmusic': case 'playmapmusic': case 'warpsound': case 'faceobject':
        yield { type: 'effect', name, args: args.map(realId) }; break;
      case 'pocketisfull': yield* pocketIsFull(); break;
      case 'itemball': {
        // misc_scripts.asm FindItemInBallScript
        const [item, quantity = '1'] = args;
        state.buffers.wStringBuffer3 = itemName(item);
        state.curItem = item;
        const ok = receiveItem(state, item, Number(quantity));
        if (ok) { state.flags.add(objectFlag(ctx.caller.id)); yield { type: 'effect', name: 'disappear', args: [ctx.caller.id] }; }
        yield { type: 'opentext' };
        yield showText('_FoundItemText');
        if (ok) {
          yield { type: 'effect', name: 'playsound', args: ['SFX_ITEM'] };
          yield { type: 'effect', name: 'pause', args: [60] };
          yield* itemNotify();
        } else { yield { type: 'waitbutton' }; yield showText('_CantCarryItemText'); yield { type: 'waitbutton' }; }
        yield { type: 'closetext' };
        if (returnOrFinish()) return;
        break;
      }
      case 'hiddenitem': {
        // hidden_item.asm HiddenItemScript: the flag (args[0]) marks it as found
        const [flag, item] = [args[1], args[0]];
        if (state.flags.has(flag)) { if (returnOrFinish()) return; break; }
        state.buffers.wStringBuffer3 = itemName(item);
        state.curItem = item;
        yield { type: 'opentext' };
        yield showText('_PlayerFoundItemText');
        if (receiveItem(state, item, 1)) {
          state.flags.add(flag);
          yield { type: 'effect', name: 'specialsound', args: [] };
          yield* itemNotify();
        } else { yield { type: 'promptbutton' }; yield showText('_ButNoSpaceText'); yield { type: 'waitbutton' }; }
        yield { type: 'closetext' };
        if (returnOrFinish()) return;
        break;
      }
      case 'fruittree': {
        // fruit_trees.asm FruitTreeScript; the trees grow back every day (ResetFruitTrees)
        const fruit = FRUIT_TREE_ITEMS[args[0]];
        if (!fruit) throw new Error(`unknown fruit tree ${args[0]}`);
        state.buffers.wStringBuffer3 = itemName(fruit);
        yield { type: 'opentext' };
        yield showText('_FruitBearingTreeText');
        yield { type: 'promptbutton' };
        const picked = (state.fruitTrees ??= new Set());
        if (state.fruitTreesDay !== ctx.today?.()) { picked.clear(); state.fruitTreesDay = ctx.today?.(); }
        if (picked.has(args[0])) { yield showText('_NothingHereText'); yield { type: 'waitbutton' }; }
        else {
          yield showText('_HeyItsFruitText');
          state.curItem = fruit;
          if (receiveItem(state, fruit, 1)) {
            yield { type: 'promptbutton' };
            yield showText('_ObtainedFruitText');
            picked.add(args[0]);
            yield { type: 'effect', name: 'specialsound', args: [] };
            yield* itemNotify();
          } else { yield { type: 'promptbutton' }; yield showText('_FruitPackIsFullText'); yield { type: 'waitbutton' }; }
        }
        yield { type: 'closetext' };
        if (returnOrFinish()) return;
        break;
      }
      // Presentation and engine effects handled by the caller; they never change script state themselves.
      case 'faceplayer': case 'turnobject': case 'showemote': case 'pause': case 'playmusic': case 'playsound':
      case 'waitsfx': case 'musicfadeout': case 'follow': case 'stopfollow': case 'reanchormap': case 'moveobject':
      case 'pokepic': case 'closepokepic': case 'cry': case 'addcellnum': case 'sdefer':
      case 'changeblock': case 'specialphonecall': case 'fix_facing': case 'remove_fixed_facing':
        yield { type: 'effect', name, args }; break;
      default:
        throw new Error(`unsupported script command ${name} in ${pos.key}`);
    }
  }

  // Script_itemnotify / Script_pocketisfull: text with the item (buffer 1) and its pocket (buffer 3)
  function* itemNotify() {
    state.buffers.wStringBuffer1 = itemName(state.curItem);
    state.buffers.wStringBuffer3 = POCKET_NAMES[pocketOf(state.curItem)];
    yield showText('_PutItemInPocketText');
  }
  function* pocketIsFull() {
    state.buffers.wStringBuffer3 = POCKET_NAMES[pocketOf(state.curItem)];
    yield showText('_PocketIsFullText');
  }
  /** LAST_TALKED is the object spoken to (or set with setlasttalked); other ids are object constants. */
  function realId(id) {
    return id === 'LAST_TALKED' ? (state.lastTalked ?? ctx.caller?.id) : id;
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
