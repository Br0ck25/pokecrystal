import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSourceText } from './source-text.js';

test('source dialogue placeholders display as readable in-game text', () => {
  assert.equal(formatSourceText('<PLAYER>! Hello, <PLAY_G>!'), 'KRIS! Hello, KRIS!');
  assert.equal(formatSourceText('A #MON and the #GEAR.'), 'A POKéMON and the POKéGEAR.');
  assert.equal(formatSourceText('Hello, <PLAYER>!', 'JAMIE'), 'Hello, JAMIE!');
});
