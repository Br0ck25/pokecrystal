// What map objects do on their own: the SPRITEMOVEFN_* movement functions of engine/overworld/map_objects.asm
// (MovementFunction_RandomWalk*, RandomSpin*, Spin*) with the limits of engine/overworld/npc_movement.asm.
// The overworld loop runs about every 2 frames (MaxOverworldDelay), and every duration below counts those loops.
import { SPRITE_MOVEMENT } from '../generated/sprite-movement.js';

export const LOOP_FRAMES = 2;
const WALK_FRAMES = 32;                                      // random walks take the slow step vector: 16 loops of 1 pixel
const FACINGS = ['down', 'up', 'left', 'right'];
const COUNTERCLOCKWISE = { down: 'right', up: 'left', left: 'down', right: 'up' };
const CLOCKWISE = { down: 'left', up: 'right', left: 'up', right: 'down' };
const SPIN_LOOPS = 0x10;

const WALKS = {                                              // the random direction (0 down, 1 up, 2 left, 3 right) each function allows
  RANDOM_WALK_Y: (r) => r & 1,
  RANDOM_WALK_X: (r) => (r & 1) | 2,
  RANDOM_WALK_XY: (r) => r & 3,
};

/** Called every overworld loop for an object nobody is moving by script. random() returns a byte. */
export function stepNpc(game, object, random) {
  const move = SPRITE_MOVEMENT[object.def.movement];
  if (!move || object.step || object.queue.length) return;
  const ai = (object.ai ??= { sleep: 0 });
  if (ai.sleep > 0) {                                        // StepFunction_Sleep: the counter drops first, so 0 means 256 loops; the next loop decides
    ai.sleep = (ai.sleep - 1) & 0xff;
    return;
  }
  const slow = () => { ai.sleep = random() & 0x7f || 256; };   // RandomStepDuration_Slow
  const fast = () => { ai.sleep = random() & 0x1f || 256; };
  if (move.fn in WALKS) {
    const direction = FACINGS[WALKS[move.fn](random())];
    if (!move.flags.includes('FIXED_FACING')) object.facing = direction;     // InitStep turns the object even when it cannot go
    if (game.npcCanWalk(object, direction)) game.startStep(object, direction, { frames: WALK_FRAMES, force: true, wander: true });
    else slow();
  } else if (move.fn === 'SLOW_RANDOM_SPIN') {
    object.facing = FACINGS[random() & 3];
    slow();
  } else if (move.fn === 'FAST_RANDOM_SPIN') {
    let next = random() & 3;
    if (next === FACINGS.indexOf(object.facing)) next ^= 3;
    object.facing = FACINGS[next];
    fast();
  } else if (move.fn === 'SPIN_CLOCKWISE' || move.fn === 'SPIN_COUNTERCLOCKWISE') {
    if (ai.spun) object.facing = (move.fn === 'SPIN_CLOCKWISE' ? CLOCKWISE : COUNTERCLOCKWISE)[object.facing];
    ai.spun = true;
    ai.sleep = SPIN_LOOPS;
  }
}

/** The loop after a walk ends: sleep before the next decision (StepFunction_ContinueWalk -> RandomStepDuration_Slow). */
export function endNpcWalk(object, random) {
  if (object.ai) object.ai.sleep = random() & 0x7f || 256;
}
