// The sign that slides up when the player enters a new area (engine/events/map_name_sign.asm InitMapNameSign).
import { MAPS } from '../generated/maps.js';
import { LANDMARK_NAMES } from '../generated/landmarks.js';

// .CheckSpecialMap: these landmarks never get a sign.
const NO_SIGN = new Set(['LANDMARK_SPECIAL', 'LANDMARK_RADIO_TOWER', 'LANDMARK_LAV_RADIO_TOWER', 'LANDMARK_UNDERGROUND_PATH', 'LANDMARK_INDIGO_PLATEAU', 'LANDMARK_POWER_PLANT']);
const NATIONAL_PARK_GATES = new Set(['ROUTE_35_NATIONAL_PARK_GATE', 'ROUTE_36_NATIONAL_PARK_GATE']);   // CheckNationalParkGate
// The timer counts overworld loop iterations (one per 2 frames, MaxOverworldDelay), not frames: the sign stays about 2 seconds.
export const SIGN_FRAMES = 2 * 60;

/**
 * Entering `mapId` after having been in landmark `prev` (wPrevLandmark): returns the landmark to remember and the
 * name to show, or null. `skip` is the SHOWN_MAP_NAME_SIGN flag that Continue sets so the first map shows none.
 */
export function landmarkSign(prev, mapId, skip = false) {
  const map = MAPS[mapId];
  const current = NATIONAL_PARK_GATES.has(mapId) || map.environment === 'GATE' ? null : map.landmark;   // -1: gates have none
  if (skip || current === prev || prev === 'LANDMARK_SPECIAL' || current === null || NO_SIGN.has(current)) return { prev: current, name: null };
  return { prev: current, name: LANDMARK_NAMES[current] };
}
