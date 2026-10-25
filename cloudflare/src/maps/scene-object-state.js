import { MAPS } from '../generated/maps.js';
import { EVENTS, INITIAL_EVENT_FLAGS } from '../generated/events.js';
import { sourceObjectAt, TIME_OF_DAY } from './object-sprites.js';

/**
 * Resolve runtime object state that differs from static map event coordinates.
 * Keep this pure so movement, rendering, and interaction tests can share it.
 */
export function resolveSceneObjectPosition(mapId, object, state = {}) {
  if (!object || !Number.isFinite(object.x) || !Number.isFinite(object.y)) return null;
  if (mapId === 'ELMS_LAB' && object.id === 'ELMSLAB_ELM') {
    // ElmsLabMoveElmCallback places Elm at (3, 4) only during the first-meeting
    // scene; after the intro he returns to his ordinary map-object position.
    return state.labIntroComplete
      ? { x: object.x, y: object.y }
      : { x: 3, y: 4 };
  }
  return { x: object.x, y: object.y };
}

/**
 * Event flags in effect: the new-game flags (InitializeEventsScript) adjusted for what the port's scenes have
 * done so far. Remove the adjustments as scripts start setting and clearing flags themselves.
 */
export function activeEventFlags(state = {}) {
  const flags = new Set(INITIAL_EVENT_FLAGS);
  const ball = state.starterBall && EVENTS.ElmsLab.objects.find((o) => o.id === state.starterBall);
  if (ball) flags.add(ball.eventFlag);                         // taking a starter sets its *_POKEBALL_IN_ELMS_LAB flag
  if (state.officerVisible === true) flags.delete('EVENT_COP_IN_ELMS_LAB');
  return flags;
}

/**
 * An object_event is shown unless its event flag is set (macros/scripts/maps.asm: the flag hides it; -1 means
 * always present) and, for time-of-day objects, only in the listed times. Objects without a source event, and
 * numeric hour windows, which no ported map uses yet, are not shown.
 */
export function isSceneObjectVisible(mapId, object, state = {}) {
  if (!object) return false;
  const source = sourceObjectAt(MAPS[mapId]?.name, object.x, object.y);
  if (!source) return false;
  if (source.eventFlag !== '-1' && activeEventFlags(state).has(source.eventFlag)) return false;
  const [from, until] = source.hours;
  if (from === -1) return until === -1 || String(until).split('|').map((t) => t.trim()).includes(TIME_OF_DAY.toUpperCase());
  throw new Error(`hour-limited object ${source.id} (${from}-${until}) is not supported yet`);
}
