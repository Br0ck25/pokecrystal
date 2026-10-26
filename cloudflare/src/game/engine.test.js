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

test('walking off the west edge of New Bark Town enters Route 29 on its east edge, same row (connection offset 0)', async () => {
  const g = await newGame('NEW_BARK_TOWN', 1, 1);
  const y = [...Array(g.world.height).keys()].find((row) => g.world.collisionAt(0, row) === 0 && g.world.collisionAt(-1, row) === 0);
  assert.notEqual(y, undefined, 'a walkable crossing row exists');
  await g.enterMap('NEW_BARK_TOWN', 0, y, 'left');
  for (let i = 0; i < 80 && g.world.id === 'NEW_BARK_TOWN'; i++) g.update({ dir: 'left' });
  await waitLoaded(g);
  assert.equal(g.world.id, 'ROUTE_29');
  assert.deepEqual([g.player.x, g.player.y], [g.world.width - 1, y]);
});

test('connected maps draw their edge blocks beyond the border instead of the border block', async () => {
  const g = await newGame('NEW_BARK_TOWN', 1, 1);
  const row = 6;
  const west = g.world.blockIdAt(-2, row);                       // Route 29's easternmost block column, three deep
  assert.notEqual(west, null);
  assert.equal(g.world.connectedBlock(-1, 0) !== null, true);
  assert.equal(g.world.connectedBlock(0, -1), null);              // no northern connection
});

test('the rival follows the player one step, is shoved out, and returns to his own tile, not onto the lab', async () => {
  const g = await newGame('NEW_BARK_TOWN', 2, 2, 'right');
  g.state.flags.add('EVENT_RIVAL_NEW_BARK_TOWN');
  const rival = g.objects.find((o) => o.id === 'NEWBARKTOWN_RIVAL');
  assert.deepEqual([rival.x, rival.y], [3, 2]);
  run(g, 1, { a: true });
  for (let i = 0; i < 6000 && g.runner; i++) {
    const wait = g.runner.wait;
    g.update({ a: Boolean(wait && (wait.kind === 'button' || (wait.kind === 'text' && wait.ready))) });
  }
  assert.equal(g.runner, null);
  run(g, 60);
  assert.deepEqual([rival.x, rival.y], [3, 2]);
  assert.deepEqual([g.player.x, g.player.y], [2, 4]);
});

test('a ledge is hopped in one 32-frame arc and lands two squares on', async () => {
  const g = await newGame('ROUTE_38', 0, 0);
  // find a ledge tile with walkable land on both sides in the facing direction
  let found = null;
  for (let y = 1; y < 40 && !found; y++) for (let x = 1; x < 60 && !found; x++) {
    const c = g.world.collisionAt(x, y);
    if (c === 0xa3) found = [x, y];
  }
  assert.ok(found, 'a south-facing ledge on Route 38');
  g.player.x = found[0]; g.player.y = found[1] - 1; g.player.facing = 'down';
  run(g, 1, { dir: 'down' });
  assert.equal(g.player.step.distance, 2);
  run(g, 32, { dir: null });
  assert.deepEqual([g.player.x, g.player.y], [found[0], found[1] + 1]);
});

const talkThrough = (g, limit = 6000) => {
  const seen = [];
  for (let i = 0; i < limit && g.runner; i++) {
    const wait = g.runner.wait;
    if (wait?.kind === 'text' && wait.ready) seen.push(wait.screens[wait.index].lines.join(' ').trim());
    g.update({ a: Boolean(wait && (wait.kind === 'button' || wait.kind === 'yesno' || (wait.kind === 'text' && wait.ready))) });
  }
  return seen;
};

test('an item ball is picked up: the item goes into the bag, the ball disappears for good', async () => {
  const g = await newGame('ROUTE_29', 48, 3, 'up');
  run(g, 1, { a: true });
  const seen = talkThrough(g);
  assert.equal(g.state.items.POTION, 1);
  assert.equal(g.state.flags.has('EVENT_ROUTE_29_POTION'), true);
  assert.ok(seen.some((t) => /found POTION!/.test(t)), seen.join('|'));
  assert.ok(seen.some((t) => /ITEM POCKET\./.test(t)), seen.join('|'));
  assert.equal(g.objects.find((o) => o.id === 'ROUTE29_POKE_BALL').hidden, true);
});

test('a fruit tree gives its fruit once a day', async () => {
  const g = await newGame('ROUTE_29', 12, 3, 'up');
  run(g, 1, { a: true });
  talkThrough(g);
  assert.equal(g.state.items.BERRY, 1);
  run(g, 1, { a: true });
  const seen = talkThrough(g);
  assert.equal(g.state.items.BERRY, 1);
  assert.ok(seen.some((t) => /nothing here/.test(t)), seen.join('|'));
});

test('music and cry commands never open the Pokémon picture box', async () => {
  const g = await newGame('NEW_BARK_TOWN', 5, 8);
  for (const name of ['playmusic', 'musicfadeout', 'cry']) g.applyEffect({ name, args: ['MUSIC_X'] }, { instant: false });
  assert.equal(g.pokepic, null);
  g.applyEffect({ name: 'pokepic', args: ['CYNDAQUIL'] }, { instant: false });
  assert.equal(g.pokepic, 'CYNDAQUIL');
  g.applyEffect({ name: 'closepokepic', args: [] }, { instant: false });
  assert.equal(g.pokepic, null);
});

test('a starter received from Elm asks about a nickname: NO keeps the species name, YES opens the Pokémon naming screen', async () => {
  const pick = async (answerYes, typed) => {
    const g = await newGame('ELMS_LAB', 6, 4, 'up');
    g.state.scenes.ElmsLab = 2;
    g.startScript('CyndaquilPokeBallScript', { caller: g.objects.find((o) => o.id === 'ELMSLAB_POKE_BALL1') });
    let naming = null, questions = 0;
    for (let i = 0; i < 6000 && g.runner; i++) {
      const wait = g.runner.wait;
      if (wait?.kind === 'naming') {
        naming ??= wait.screen;
        g.update(typed.length ? { a: true } : { start: true });
        if (typed.length) typed.shift(); else g.update({ a: true });
        continue;
      }
      if (wait?.kind === 'yesno') { g.update({ dir: ++questions === 1 || answerYes ? 'up' : 'down', a: true }); continue; }      // the first question is Elm's "take this one?"
      g.update({ a: Boolean(wait && (wait.kind === 'button' || (wait.kind === 'text' && wait.ready))) });
    }
    assert.equal(g.runner, null);
    return { mon: g.state.party[0], naming };
  };
  const no = await pick(false, []);
  assert.equal(no.naming, null);
  assert.equal(no.mon.nickname, undefined);
  const blank = await pick(true, []);
  assert.deepEqual([blank.naming.mon.species, blank.naming.maxLength], ['CYNDAQUIL', 10]);
  assert.equal(blank.mon.nickname, 'CYNDAQUIL', 'a blank name keeps the species name');
  const typed = await pick(true, [1, 1]);
  assert.equal(typed.mon.nickname, 'AA');
});

test('NPCs act on their own: the fisher paces within his radius, the teacher turns on the spot, nobody moves during a script', async () => {
  const g = await newGame('NEW_BARK_TOWN', 11, 10, 'up');
  let seed = 12345;
  g.randomByte = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16 & 0xff;
  const fisher = g.objects.find((o) => o.id === 'NEWBARKTOWN_FISHER'), teacher = g.objects.find((o) => o.id === 'NEWBARKTOWN_TEACHER');
  const rows = new Set(), facings = new Set();
  for (let i = 0; i < 6000; i++) { g.update({}); rows.add(`${fisher.x},${fisher.y}`); facings.add(teacher.facing); assert.ok(Math.abs(fisher.y - 9) <= 1 && fisher.x === 12, `fisher at ${fisher.x},${fisher.y}`); }
  assert.ok(rows.size > 1, 'the fisher walked');
  assert.ok(facings.size > 2, 'the teacher looked around');
  assert.deepEqual([teacher.x, teacher.y], [6, 8]);
  g.startScript('NewBarkTownSign', { caller: null });
  run(g, 40);                                                    // a step already under way finishes
  const at = [fisher.x, fisher.y, teacher.facing];
  run(g, 60);
  assert.ok(g.runner);
  assert.deepEqual([fisher.x, fisher.y, teacher.facing], at);
});
