import test from 'node:test';
import assert from 'node:assert/strict';
import { momChoiceField, storeMomChoice, beginMomPhoneQuestion } from './mom-intro-state.js';

test('Mom has independent daylight-saving and phone yes/no choices', () => {
  assert.equal(momChoiceField(2), 'momDstChoiceYes');
  assert.equal(momChoiceField(3), 'momPhoneChoiceYes');
  assert.equal(momChoiceField(1), null);
  const state = { momIntroStage: 2, momChoiceYes: true, momDstChoiceYes: true, momPhoneChoiceYes: true };
  assert.equal(storeMomChoice(state, 2, false), true);
  assert.equal(state.momDstChoiceYes, false);
  assert.equal(beginMomPhoneQuestion(state), true);
  assert.equal(state.momDstChoiceYes, false, 'the DST answer must be preserved');
  assert.equal(state.momIntroStage, 3);
  assert.equal(state.momPhoneChoiceYes, true, 'phone tutorial answer starts as Yes');
  assert.equal(storeMomChoice(state, 3, false), true);
  assert.equal(state.momPhoneChoiceYes, false);
  assert.equal(state.momDstChoiceYes, false, 'changing phone answer must not overwrite DST answer');
});

test('Mom choice helpers reject invalid stages and state without mutating unrelated fields', () => {
  const state = { momIntroStage: 1, momChoiceYes: true, momDstChoiceYes: true };
  assert.equal(storeMomChoice(state, 1, false), false);
  assert.equal(beginMomPhoneQuestion(state), false);
  assert.equal(state.momChoiceYes, true);
  assert.equal(storeMomChoice(null, 2, false), false);
});
