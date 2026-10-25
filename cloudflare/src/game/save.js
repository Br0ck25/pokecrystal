// Browser save files. This is NOT the ROM's SRAM layout (no checksums, no ROM compatibility): a versioned JSON
// snapshot of the script state (event flags, scenes, items, party, names...) plus the map and tile the player stands on.
// Loading re-enters the map, which re-runs its callbacks exactly as the game's Continue does.
import { MAPS } from '../generated/maps.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'pokecrystal-save';

const replacer = (key, value) => (value instanceof Set ? { $set: [...value] } : value);
const reviver = (key, value) => (value && typeof value === 'object' && Array.isArray(value.$set) ? new Set(value.$set) : value);

export function serializeSave(game) {
  const { x, y, facing } = game.player;
  return JSON.stringify({ version: SAVE_VERSION, mapId: game.world.id, x, y, facing, prev: game.prev, state: game.state }, replacer);
}

/** Parse and check a save file's text; throws a readable Error for anything that is not a Crystal browser save. */
export function parseSave(text) {
  let save;
  try { save = JSON.parse(text, reviver); } catch { throw new Error('This file is not a save file.'); }
  if (save?.version !== SAVE_VERSION) throw new Error('This save file is from a different version.');
  const { state } = save;
  if (!MAPS[save.mapId] || !Number.isInteger(save.x) || !Number.isInteger(save.y) || !['up', 'down', 'left', 'right'].includes(save.facing)
    || !(state?.flags instanceof Set) || !(state.engineFlags instanceof Set) || !Array.isArray(state.party)
    || typeof state.scenes !== 'object' || typeof state.playerName !== 'string') throw new Error('This save file is damaged.');
  return save;
}

/** Storage kept behind a tiny interface so the engine and tests need no browser. */
export function browserSaveStore(storage = globalThis.localStorage) {
  return {
    read: () => { try { return storage.getItem(SAVE_KEY); } catch { return null; } },
    write: (text) => storage.setItem(SAVE_KEY, text),
  };
}
