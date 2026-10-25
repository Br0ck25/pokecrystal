import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialoguePages } from './dialogue-pages.js';

test('long source dialogue is split into pages that fit the GBC text box', () => {
  const text = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine thirty thirty-one thirty-two thirty-three thirty-four thirty-five thirty-six thirty-seven thirty-eight thirty-nine forty';
  const pages = createDialoguePages(text);
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => page.length <= 3));
  assert.ok(pages.flat().every(line => line.length <= 33));
  assert.equal(pages.flat().join(' '), text);
});

test('short dialogue stays on a single page', () => {
  assert.deepEqual(createDialoguePages('Hello there.'), [['Hello there.']]);
});


test('explicit line breaks preserve vertical YES/NO choices', () => {
  assert.deepEqual(createDialoguePages('Choose?\n\n▶ YES\n  NO'), [['Choose?', '▶ YES', 'NO']]);
  assert.deepEqual(createDialoguePages('  YES\n▶ NO'), [['YES', '▶ NO']]);
});
