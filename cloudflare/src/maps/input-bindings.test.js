import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, getButtonAction, isMovementKey } from './input-bindings.js';

test('WASD movement keys never trigger an action button', () => {
  for (const key of ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D']) {
    assert.equal(isMovementKey(key), true, key);
    assert.equal(getButtonAction(key), null, key);
  }
});

test('keyboard action aliases remain available without conflicting with WASD', () => {
  for (const key of [' ', 'z', 'Z', 'e', 'E']) assert.equal(getButtonAction(key), 'a');
  for (const key of ['x', 'X', 'Escape', 'Backspace']) assert.equal(getButtonAction(key), 'b');
  assert.equal(getButtonAction('Enter'), 'start');
  assert.equal(getButtonAction('Shift'), 'select');
  assert.equal(normalizeKey('A'), 'a');
});
