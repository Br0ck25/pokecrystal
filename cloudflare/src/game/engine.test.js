import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, STEP_FRAMES, TURN_FRAMES } from './engine.js';

const newGame = async (mapId, x, y, facing = 'down') => { const g = new Game({ mapId, x, y, facing }); await g.ready; return g; };
const run = (g, frames, input = {}) => { for (let i = 0; i < frames; i++) g.update(input); };
const settle = (g, limit = 600) => { for (let i = 0; i < limit && (g.player.step || g.runner || g.loading); i++) g.update({}); };
const waitLoaded = async (g) => { while (g.loading) await new Promise((r) => setTimeout(r, 1)); };

test('a new game runs the player-room callbacks: flags, decorations and visible objects', async () => {
  const g = await newGame('PLAYERS_HOUSE_2F', 3, 3);
  assert.equal(g.state.flags.has('EVENT_INITIALIZED_EVENTS'), true);
  assert.equal(g.state.flags.has('EVENT_PLAYERS_ROOM_POSTER'), true);
  assert.equal(g.world.blockIdAt(0, 4), 0x1b);       // feathery bed
  assert.equal(g.world.blockIdAt(6, 0), 0x1f);       // town map poster
  assert.equal(g.visibleObjects().length, 0);         // console, ornaments and big doll are hidden
});

test('turning takes 8 frames, then each square takes 16 frames (measured against the game)', async () => {
  const g = await newGame('PLAYERS_HOUSE_2F', 3, 3, 'down');
  run(g, 1, { dir: 'left' });
  assert.equal(g.player.facing, 'left');
  assert.equal(g.player.step.kind, 'turn');
  run(g, TURN_FRAMES - 1, { dir: 'left' });
  assert.equal(g.player.step.kind, 'turn');
  assert.deepEqual([g.player.x, g.player.y], [3, 3]);
  run(g, 1, { dir: 'left' });                          // the turn is over: the walk starts on this frame
  assert.equal(g.player.step.kind, 'walk');
  run(g, STEP_FRAMES, { dir: 'left' });
  assert.equal(g.player.x, 2);
  assert.equal(g.player.step.frame, 0);                // already walking on: steps follow each other without a gap
});

test('a tap only turns the player', async () => {
  const g = await newGame('PLAYERS_HOUSE_2F', 3, 3, 'down');
  run(g, 1, { dir: 'left' });
  run(g, 30, {});
  assert.deepEqual([g.player.x, g.player.y, g.player.facing], [3, 3, 'left']);
});

test('walls and the border block stop the player', async () => {
  const g = await newGame('PLAYERS_HOUSE_2F', 3, 3, 'up');
  for (let i = 0; i < 200; i++) g.update({ dir: 'up' });
  assert.ok(g.player.y >= 1, `stopped at y=${g.player.y}`);
  assert.ok(g.world.collisionAt(g.player.x, g.player.y - 1) !== 0);
});

// Arrival tiles read from the real game by tools/reference (wXCoord, wYCoord after warping in through each warp).
const GAME_ARRIVALS = [
  ['NEW_BARK_TOWN', 1, 6, 4], ['NEW_BARK_TOWN', 2, 13, 6], ['NEW_BARK_TOWN', 3, 3, 12], ['NEW_BARK_TOWN', 4, 11, 14],
  ['ELMS_LAB', 1, 4, 11], ['PLAYERS_HOUSE_1F', 1, 6, 7], ['PLAYERS_HOUSE_1F', 3, 9, 1], ['PLAYERS_HOUSE_2F', 1, 7, 1],
  ['ELMS_HOUSE', 1, 2, 7], ['PLAYERS_NEIGHBORS_HOUSE', 1, 2, 7],
];
test('warp arrivals match the tile the real game puts the player on (doors and stairs walk down one square)', async () => {
  for (const [mapId, warp, x, y] of GAME_ARRIVALS) {
    const g = await newGame('PLAYERS_HOUSE_2F', 3, 3);
    g.state.scenes.ElmsLab = 2;                        // skip the Elm intro cutscene, as the reference harness does
    await g.startWarpTo(mapId, warp, { map: 'PLAYERS_HOUSE_2F', warp: 1 });
    settle(g);
    assert.deepEqual([g.world.id, g.player.x, g.player.y], [mapId, x, y], `${mapId} warp ${warp}`);
  }
});

test('walking onto a warp tile enters the destination: 2F stairs lead to the 1F stairs and back', async () => {
  const g = await newGame('PLAYERS_HOUSE_2F', 7, 1, 'up');
  g.state.scenes.PlayersHouse1F = 1;                   // past Mom's intro, which is a separate scene
  run(g, 1, { dir: 'up' });                            // already facing up: starts the step onto (7,0)
  for (let i = 0; i < 40; i++) g.update({});
  await waitLoaded(g);
  settle(g);
  assert.equal(g.world.id, 'PLAYERS_HOUSE_1F');
  assert.deepEqual([g.player.x, g.player.y], [9, 1]);
});

test('talking to an NPC runs her script and shows the source text', async () => {
  const g = await newGame('PLAYERS_HOUSE_1F', 4, 5, 'up');
  g.state.scenes.PlayersHouse1F = 1;
  g.state.flags.delete('EVENT_PLAYERS_HOUSE_1F_NEIGHBOR');
  run(g, 1, { a: true });
  assert.ok(g.runner, 'script started');
  const seen = [];
  for (let i = 0; i < 4000 && g.runner; i++) {
    const wait = g.runner.wait;
    if (wait?.kind === 'text' && wait.ready) seen.push(wait.screens.map((s) => s.lines.join(' / ')));
    g.update({ a: Boolean(wait && (wait.kind === 'button' || (wait.kind === 'text' && wait.ready))) });
  }
  assert.equal(g.runner, null);
  assert.deepEqual(seen[0], ["Hello, CHRIS! / I'm visiting!"]);
  assert.equal(seen[1].at(-1), 'She really loves / POKéMON!');
  assert.equal(g.player.facing, 'up');
});

test('walkable means LAND_TILE in the source permission table (ladders and stairs are land, trees and counters are not)', async () => {
  const { COLLISION_VALUES, COLLISION_PERMISSIONS } = await import('../generated/collision.js');
  const land = (name) => COLLISION_PERMISSIONS[COLLISION_VALUES[name]] === 0;
  for (const name of ['FLOOR', 'TALL_GRASS', 'DOOR', 'LADDER', 'STAIRCASE', 'WARP_CARPET_LEFT']) assert.equal(land(name), true, name);
  for (const name of ['WALL', 'WATER', 'BUOY', 'CUT_TREE', 'HEADBUTT_TREE', 'WHIRLPOOL']) assert.equal(land(name), false, name);
});

test('objects follow their event flags from a new game: rival and aide present, officer and far neighbor hidden', async () => {
  const visible = async (mapId, x, y) => { const g = await newGame('PLAYERS_HOUSE_2F', 3, 3); await g.enterMap(mapId, x, y, 'down'); return g.visibleObjects().map((o) => o.id); };
  assert.ok((await visible('NEW_BARK_TOWN', 6, 4)).includes('NEWBARKTOWN_RIVAL'));
  const lab = await visible('ELMS_LAB', 4, 11);
  assert.ok(lab.includes('ELMSLAB_ELMS_AIDE'));
  assert.ok(!lab.includes('ELMSLAB_OFFICER'));
  assert.equal(lab.filter((id) => id.startsWith('ELMSLAB_POKE_BALL')).length, 3);
  assert.ok((await visible('PLAYERS_HOUSE_1F', 6, 7)).includes('PLAYERSHOUSE1F_POKEFAN_F'));
  assert.ok(!(await visible('PLAYERS_NEIGHBORS_HOUSE', 2, 7)).includes('PLAYERSNEIGHBORSHOUSE_POKEFAN_F'));
  // Mom's four time-of-day objects: only the first (always present, no flag set yet) shows in a new game
  assert.deepEqual((await visible('PLAYERS_HOUSE_1F', 6, 7)).filter((id) => id.includes('MOM')), ['PLAYERSHOUSE1F_MOM1']);
});
