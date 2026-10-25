// The start menu and its SAVE flow, from engine/menus/start_menu.asm (StartMenu, .SetUpMenuItems, StartMenu_Save),
// engine/menus/save.asm (SaveMenu, AskOverwriteSaveFile, SavedTheGame) and engine/menus/intro_menu.asm
// (DisplaySaveInfoOnSave). Pure: the engine runs these and the renderer draws what describe functions return.
import { renderText, expandTokens } from '../script/text.js';
import { SCRIPTS as sharedText } from '../generated/scripts/_text.js';

/** Strings of StartMenu.*String; "#" is the POKé charmap entry and <PLAYER> the player's name. */
const LABELS = { POKEDEX: 'POKéDEX', POKEMON: 'POKéMON', PACK: 'PACK', STATUS: null, SAVE: 'SAVE', OPTION: 'OPTION', EXIT: 'EXIT', POKEGEAR: 'POKéGEAR' };

/** StartMenu.*Desc: the two lines shown bottom-left while the menu account option is on (it is on in a new game). */
const DESCRIPTIONS = {
  POKEDEX: ['POKéMON', 'database'], POKEMON: ['Party <PKMN>', 'status'], PACK: ['Contains', 'items'], STATUS: ['Your own', 'status'],
  SAVE: ['Save your', 'progress'], OPTION: ['Change', 'settings'], EXIT: ['Close this', 'menu'], POKEGEAR: ["Trainer's", 'key device'],
};

/**
 * Cursor movement of a vertical wrapping menu (JoyTextDelay with hInMenu): moves on the press, again after 15 frames
 * held, then every 5. `held` is { lastDir, repeat }, kept between frames; returns the new cursor.
 */
export function moveCursor(held, dir, cursor, count) {
  const d = dir === 'up' || dir === 'down' ? dir : null;
  let next = cursor;
  if (d && (d !== held.lastDir || --held.repeat <= 0)) {
    held.repeat = d !== held.lastDir ? 15 : 5;
    next = (cursor + (d === 'up' ? -1 : 1) + count) % count;
  }
  held.lastDir = d;
  return next;
}

/** MainMenu: menu_coords 0,0,16,7 with the bottom moved to fit the items (2 rows each, plus 1). */
export function mainMenuView(items, cursor) {
  return {
    box: [0, 0, 16, items.length * 2 + 1],
    texts: items.map((item, i) => [2, 2 + 2 * i, item]),
    cursor: [1, 2 + 2 * cursor, '▶'],
  };
}

/** .SetUpMenuItems: dex once obtained, party once it has a POKéMON, pack, gear once obtained, then status/save/option/exit. */
export function startMenuItems(state) {
  const items = [];
  if (state.engineFlags.has('ENGINE_POKEDEX')) items.push('POKEDEX');
  if (state.party.length) items.push('POKEMON');
  items.push('PACK');
  if (state.engineFlags.has('ENGINE_POKEGEAR')) items.push('POKEGEAR');
  items.push('STATUS', 'SAVE', 'OPTION', 'EXIT');
  return items;
}

/** The box the menu draws: menu_coords 10,0 to 19,*; AutomaticGetMenuBottomCoord makes it 2 rows per item plus 1. */
export function startMenuView(state, cursor, hollow = false) {
  const items = startMenuItems(state);
  const texts = items.map((item, i) => [12, 2 + 2 * i, LABELS[item] ?? state.playerName]);
  if (!hollow) texts.push(...DESCRIPTIONS[items[cursor]].map((line, i) => [0, 14 + 2 * i, expandTokens(line, state)]));
  return {
    box: [10, 0, 19, items.length * 2 + 1],
    clear: hollow ? null : [0, 13, 10, 5],                // ._DrawMenuAccount blanks 10x5 tiles at (0,13)
    texts,
    cursor: [11, 2 + 2 * cursor, hollow ? '▷' : '▶'],
  };
}

/** Johto and Kanto badges are 16 consecutive engine flags (wJohtoBadges, wKantoBadges), counted by CountSetBits. */
export const badgeCount = (state) => [...state.engineFlags].filter((f) => /^ENGINE_\w+BADGE$/.test(f)).length;

/** DisplaySaveInfoOnSave: menu_coords 0,0,15,9 moved 4 columns right; PLAYER, BADGES, #DEX (blank if none) and TIME. */
export function saveInfoView(state, top = 0) {
  const frames = state.playFrames ?? 0;
  const hours = Math.min(999, Math.floor(frames / 216000)), minutes = Math.floor(frames / 3600) % 60;
  const dex = state.engineFlags.has('ENGINE_POKEDEX');
  const num = (n, width) => String(n).padStart(width, ' ');
  const view = {
    box: [4, top, 19, top + 9],
    texts: [
      [5, 2, dex ? 'PLAYER' : `PLAYER ${state.playerName}`], [5, 4, 'BADGES'], ...(dex ? [[5, 6, 'POKéDEX']] : []), [5, 8, 'TIME'],
      [12, 2, state.playerName],
      [17, 4, num(badgeCount(state), 2)],
      ...(dex ? [[16, 6, num(0, 3)]] : []),                 // caught count: catching is not ported
      [13, 8, `${num(hours, 3)}<COLON>${String(minutes).padStart(2, '0')}`],
    ],
  };
  view.texts = view.texts.map(([x, y, text]) => [x, y + top, text]);       // Continue shows the same box 8 rows down
  return view;
}

/**
 * SaveMenu: ask, confirm an overwrite, save, then announce. Yields the script runner's requests; returns whether it saved.
 * existing: the save already stored (or null); save(): stores the game.
 */
export function* saveFlow(state, { existing, save }) {
  const env = () => ({ block: (l) => sharedText[l], vars: state.buffers, playerName: state.playerName, rivalName: state.rivalName });
  const say = (label) => ({ type: 'text', screens: renderText([['text_far', label]], env()) });
  const pause = (frames) => ({ type: 'effect', name: 'pause', args: [frames] });
  yield pause(13);
  yield say('_WouldYouLikeToSaveTheGameText');
  if (!(yield { type: 'yesorno', x: 0 })) return false;
  if (existing) {
    yield say(existing.playerId === state.playerId ? '_AlreadyASaveFileText' : '_AnotherSaveFileText');
    if (!(yield { type: 'yesorno', x: 0 })) return false;
  }
  yield pause(34);                                     // measured: the yes/no box closes and the screen redraws first
  yield say('_SavingDontTurnOffThePowerText');
  yield pause(16);
  save();
  yield pause(50);                                     // SavedTheGame waits 32 frames; the rest was measured (saving the data takes time)
  yield say('_SavedTheGameText');
  yield { type: 'effect', name: 'playsound', args: ['SFX_SAVE'] };
  yield { type: 'effect', name: 'waitsfx', args: [] };
  yield pause(30);
  return true;
}
