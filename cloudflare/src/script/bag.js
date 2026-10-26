// The bag's pockets (constants/item_constants.asm, engine/items/items.asm ReceiveItem/TossItem/CheckItem), on top of
// state.items = { ITEM_CONSTANT: count }. Capacities are MAX_ITEMS, MAX_BALLS, MAX_KEY_ITEMS and the TM/HM pocket.
import { ITEMS } from '../generated/items.js';

export const POCKET_NAMES = { ITEM: 'ITEM POCKET', KEY_ITEM: 'KEY POCKET', BALL: 'BALL POCKET', TM_HM: 'TM POCKET' };
const CAPACITY = { ITEM: 20, KEY_ITEM: 25, BALL: 12, TM_HM: 57 };     // MAX_ITEMS, MAX_KEY_ITEMS, MAX_BALLS, NUM_TMS + NUM_HMS
const MAX_STACK = 99;

export const itemName = (constant) => ITEMS[constant]?.name ?? constant;
export const pocketOf = (constant) => ITEMS[constant]?.pocket ?? 'ITEM';
export const inPocket = (state, pocket) => Object.keys(state.items).filter((c) => state.items[c] > 0 && pocketOf(c) === pocket);

/** ReceiveItem: false when the pocket has no room (a new item in a full pocket, or a stack that would pass 99). */
export function receiveItem(state, constant, quantity = 1) {
  const pocket = pocketOf(constant), have = state.items[constant] ?? 0;
  if (have === 0 && inPocket(state, pocket).length >= CAPACITY[pocket]) return false;
  if (pocket !== 'KEY_ITEM' && have + quantity > MAX_STACK) return false;
  state.items[constant] = have + quantity;
  return true;
}

/** TossItem: removes `quantity`; false when there are not that many. */
export function tossItem(state, constant, quantity = 1) {
  const have = state.items[constant] ?? 0;
  if (have < quantity) return false;
  if (have === quantity) delete state.items[constant]; else state.items[constant] = have - quantity;
  return true;
}
