import test from 'node:test';
import assert from 'node:assert/strict';
import { runScript, createScriptState, value } from './interpreter.js';
import { createScriptContext } from './context.js';
import { EVENTS, INITIAL_EVENT_FLAGS } from '../generated/events.js';

/** Drive a script to completion, answering yesorno from `answers` and readvar from `vars`. Returns the requests seen. */
async function drive(mapName, label, { answers = [], vars = {}, state = createScriptState({ flags: new Set(INITIAL_EVENT_FLAGS) }), limit = 5000 } = {}) {
  const ctx = await createScriptContext(mapName, state);
  const requests = [];
  const g = runScript(ctx, label);
  let step = g.next();
  while (!step.done) {
    assert.ok(requests.length < limit, `${label} did not finish`);
    const request = step.value;
    requests.push(request);
    let answer;
    if (request.type === 'yesorno') answer = answers.length ? answers.shift() : true;
    if (request.type === 'effect' && request.name === 'readvar') answer = vars[request.args[0]];
    step = g.next(answer);
  }
  return { requests, state };
}
const texts = (requests) => requests.filter((r) => r.type === 'text').map((r) => r.screens.map((s) => s.lines.join(' / ')));

test('NeighborScript shows the source text in the source order', async () => {
  const { requests } = await drive('PlayersHouse1F', 'NeighborScript');
  assert.deepEqual(requests.map((r) => r.type), ['effect', 'opentext', 'text', 'promptbutton', 'text', 'waitbutton', 'closetext', 'effect']);
  assert.deepEqual(texts(requests), [
    ["Hello, CHRIS! / I'm visiting!"],
    ['CHRIS, have you / heard?', 'My daughter is / adamant about', "becoming PROF. / ELM's assistant.", 'She really loves / POKéMON!'],
  ]);
});

test('flags, scenes and conditionals follow the script commands', async () => {
  // MeetMomScript sets EVENT_PLAYERS_HOUSE_MOM_1, clears EVENT_PLAYERS_HOUSE_MOM_2 and moves the house scene on
  const { state } = await drive('PlayersHouse1F', 'MeetMomScript', { answers: [true, true, true] });
  assert.equal(state.flags.has('EVENT_PLAYERS_HOUSE_MOM_1'), true);
  assert.equal(state.flags.has('EVENT_PLAYERS_HOUSE_MOM_2'), false);
  assert.equal(state.scenes.PlayersHouse1F, 1);                       // SCENE_PLAYERSHOUSE1F_NOOP is the second scene
  assert.equal(state.engineFlags.has('ENGINE_POKEGEAR'), true);
});

test('the yes/no answer chooses the branch (MeetMomScript asks about DST)', async () => {
  const yes = await drive('PlayersHouse1F', 'MeetMomScript', { answers: [true, true, true] });
  const no = await drive('PlayersHouse1F', 'MeetMomScript', { answers: [false, true, true, true] });
  assert.ok(yes.requests.some((r) => r.type === 'special' && r.name === 'InitialSetDSTFlag'));
  assert.ok(no.requests.some((r) => r.type === 'special' && r.name === 'InitialClearDSTFlag'));
});

test('scene scripts exist for every scene_script of a ported map and unknown commands fail loudly', async () => {
  const state = createScriptState();
  const ctx = await createScriptContext('PlayersHouse1F', state);
  ctx.sources = [{ SCRIPTS: { Bad: [['frobnicate']] } }];
  assert.throws(() => runScript(ctx, 'Bad').next(), /unsupported script command frobnicate/);
  assert.throws(() => runScript(ctx, 'Missing').next(), /not found/);
});

test('constants compare numerically when numeric and by name otherwise', () => {
  assert.equal(value('$0a'), 10);
  assert.equal(value('TRUE'), 1);
  assert.equal(value('DOWN'), 'DOWN');
  assert.equal(value(7), 7);
});

test('every object and bg-event script of the six ported maps runs to the end', async () => {
  const maps = ['NewBarkTown', 'ElmsLab', 'PlayersHouse1F', 'PlayersHouse2F', 'ElmsHouse', 'PlayersNeighborsHouse'];
  let ran = 0;
  for (const map of maps) {
    // Objects hidden at the start (flag set by InitializeEventsScript) can't be talked to, e.g. the decoration console.
    const labels = [...EVENTS[map].objects.filter((o) => !INITIAL_EVENT_FLAGS.includes(o.eventFlag)).map((o) => o.script), ...EVENTS[map].bgEvents.filter((b) => !['BGEVENT_ITEM'].includes(b.kind)).map((b) => b.args[0])];
    for (const label of new Set(labels)) {
      for (const answers of [[], [false, true, false, true, false, true, true]]) {
        await drive(map, label, { answers: [...answers], vars: { VAR_FACING: 'DOWN' } });
        ran++;
      }
    }
  }
  assert.ok(ran > 40, `ran ${ran}`);
});
