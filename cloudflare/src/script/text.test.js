import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { renderText, tiles, tileLength, takeTiles, expandTokens } from './text.js';
import { SCRIPTS as shared } from '../generated/scripts/_text.js';
import { SCRIPTS as playersHouse } from '../generated/scripts/PlayersHouse1F.js';

const env = (extra = {}) => ({ block: (l) => shared[l], vars: { wStringBuffer4: 'POTION', ...extra }, playerName: 'CHRIS', rivalName: 'SILVER' });

test('para, line and done lay out like the game (NeighborText)', () => {
  const screens = renderText(playersHouse.NeighborText, env());
  assert.deepEqual(screens.map((s) => [...s.lines, s.wait]), [
    ['CHRIS, have you', 'heard?', 'para'],
    ['My daughter is', 'adamant about', 'para'],
    ['becoming PROF.', "ELM's assistant.", 'para'],
    ['She really loves', 'POKéMON!', null],
  ]);
});

test('cont scrolls line 2 up and continues on line 2', () => {
  const screens = renderText([['text', 'one'], ['line', 'two'], ['cont', 'three'], ['cont', 'four'], ['done']], env());
  assert.deepEqual(screens.map((s) => [...s.lines, s.wait]), [
    ['one', 'two', 'cont'], ['two', 'three', 'cont'], ['three', 'four', null],
  ]);
});

test('text_far and text_ram insert at the cursor; a done inside far text ends everything', () => {
  const screens = renderText([['text_far', '_ReceivedItemText'], ['prompt']], env());
  assert.deepEqual(screens.map((s) => [...s.lines, s.wait]), [['CHRIS received', 'POTION.', null]]);
});

test('prompt waits for a button before ending', () => {
  assert.deepEqual(renderText([['text', 'Hi'], ['prompt']], env()).map((s) => [...s.lines, s.wait]), [['Hi', '', 'prompt']]);
});

test('unsupported text commands and missing variables fail loudly', () => {
  assert.throws(() => renderText([['text_asm']], env()), /unsupported text command/);
  assert.throws(() => renderText([['text_ram', 'wNope']], env()), /no value/);
});

test('every plain text block in the game fits the 18-column box (names expanded to their longest)', () => {
  const longest = { block: (l) => shared[l], vars: {}, playerName: 'AAAAAAA', rivalName: 'AAAAAAA' };
  let checked = 0;
  const tooLong = [];
  const check = (label, block) => {
    if (block[0]?.[0] !== 'text' || block.some(([n, arg]) => !['text', 'line', 'para', 'cont', 'done', 'prompt'].includes(n) || arg?.includes('{'))) return;
    for (const screen of renderText(block, longest)) {
      for (const line of screen.lines) if (tileLength(line) > 18) tooLong.push(`${label}: "${line}"`);
    }
    checked++;
  };
  for (const [label, block] of Object.entries(shared)) check(label, block);
  return Promise.all(readdirSync(new URL('../generated/scripts/', import.meta.url)).filter((f) => !f.startsWith('_')).map(async (file) => {
    const { SCRIPTS } = await import(`../generated/scripts/${file}`);
    for (const [label, block] of Object.entries(SCRIPTS)) check(`${file}:${label}`, block);
  })).then(() => {
    assert.ok(checked > 3000, `checked ${checked} blocks`);
    // The source itself has these 19-column lines; they are kept as written.
    assert.deepEqual(tooLong.filter((l) => !/\.js:[A-Za-z0-9_]+: "…I haven't given up"$/.test(l)), []);
  });
});

test("contractions are single tiles, as in charmap.asm ('s is one glyph)", () => {
  assert.deepEqual(tiles("It's"), ['I', 't', "'s"]);
  assert.equal(tileLength("isn't it, ELM's"), 13);
  assert.equal(takeTiles("It's", 3), "It's");
  assert.equal(takeTiles("It's", 2), 'It');
  assert.deepEqual(tiles("'x"), ["'", 'x']);
});

test('<POKE> and <PKMN> print two small glyphs each, # prints the letters POKé (home/text.asm PlacePOKE, PlacePKMN, PlacePOKe)', () => {
  const names = { playerName: 'X', rivalName: 'Y' };
  assert.deepEqual(tiles(expandTokens('<POKE>GEAR', names)), ['<PO>', '<KE>', 'G', 'E', 'A', 'R']);
  assert.deepEqual(tiles(expandTokens('Party <PKMN>', names)).slice(-2), ['<PK>', '<MN>']);
  assert.equal(expandTokens('#DEX', names), 'POKéDEX');
});
