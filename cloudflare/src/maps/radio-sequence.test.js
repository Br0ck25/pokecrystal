import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceRadioSequence } from './radio-sequence.js';

test('first radio interaction follows all four source dialogue pages', () => {
  let state = { starter: null, listened: false, stage: 0 };
  const pages = [];
  for (let i = 0; i < 4; i++) {
    const next = advanceRadioSequence(state);
    pages.push(next.text);
    state = { ...state, listened: next.listened, stage: next.stage };
  }
  assert.deepEqual(pages, [
    "PROF. OAK'S POKéMON TALK! Please tune in next time!",
    'POKéMON CHANNEL!',
    'This is DJ MARY, your co-host!',
    'POKéMON! POKéMON CHANNEL…',
  ]);
  assert.equal(state.listened, true);
  assert.equal(state.stage, 0);
});

test('later radio interactions show the abbreviated source text', () => {
  assert.equal(advanceRadioSequence({ listened: true }).text, 'POKéMON! POKéMON CHANNEL…');
  assert.equal(advanceRadioSequence({ starter: 'CYNDAQUIL' }).text, 'POKéMON! POKéMON CHANNEL…');
});
