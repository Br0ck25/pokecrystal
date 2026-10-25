import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('new game starts in the original player bedroom, not outdoors', () => {
  assert.match(app, /let currentMapId = 'PLAYERS_HOUSE_2F'/);
  assert.match(app, /const state = \{ x: 3, y: 3, facing: 'up'/);
});

test('the first-floor Mom scene triggers at the source coordinate and awards the Pokegear once', () => {
  assert.match(app, /currentMapId === 'PLAYERS_HOUSE_1F' && \(nx === 8 \|\| nx === 9\) && ny === 4 && !state\.pokegear/);
  assert.match(app, /state\.pokegear = true/);
  assert.match(app, /Our neighbor, PROF\. ELM, was looking for you/);
});

test('the teacher blocks the no-starter route and the lab blocks leaving without a starter', () => {
  assert.match(app, /nx === 1 && ny === 8\) \|\| \(nx === 1 && ny === 9/);
  assert.match(app, /state\.townTeacherStage = 0/);
  assert.match(app, /mustBlockLabExit\(state\.starter\)/);
  assert.match(app, /state\.x = oldX; state\.y = oldY/);
});

test('starter selection presents a direct YES/NO prompt and displays the chosen source starter image', () => {
  assert.match(app, /state\.choiceNeedsConfirm = false/);
  assert.match(app, /if \(state\.choiceNeedsConfirm\)/);
  assert.match(app, /state\.starterReveal = state\.starter/);
  assert.match(app, /function drawStarterPreview\(\)/);
});

test('dialogue is drawn in the Game Boy screen, not only in the page status panel', () => {
  assert.match(app, /function drawDialogueBox\(\)/);
  assert.match(app, /drawDialogueBox\(\)/);
});
