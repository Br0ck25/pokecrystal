import test from 'node:test';
import assert from 'node:assert/strict';
import { formatYesNoChoice, moveYesNoChoice } from './yes-no-menu.js';

test('YES/NO menu is vertical and cursor indicates selected answer', () => {
  assert.equal(formatYesNoChoice(true), '▶ YES\n  NO');
  assert.equal(formatYesNoChoice(false), '  YES\n▶ NO');
});

test('vertical controls select YES and NO without changing choice on horizontal input', () => {
  assert.equal(moveYesNoChoice(false, 0, -1), true);
  assert.equal(moveYesNoChoice(true, 0, 1), false);
  assert.equal(moveYesNoChoice(false, 1, 0), false);
  assert.equal(moveYesNoChoice(true, -1, 0), true);
});
