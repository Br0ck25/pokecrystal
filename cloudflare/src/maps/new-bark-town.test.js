import test from 'node:test';
import assert from 'node:assert/strict';
import { NEW_BARK_TOWN, eventsAt } from './new-bark-town.js';

test('New Bark Town sign text is sourced and readable by event coordinate', () => {
  assert.match(eventsAt(8, 8).find(e => e.type === 'background').text, /NEW BARK TOWN/);
  assert.match(eventsAt(3, 3).find(e => e.type === 'background').text, /ELM POKEMON LAB/);
  assert.match(eventsAt(9, 13).find(e => e.type === 'background').text, /ELM'S HOUSE/);
});

test('source NPCs expose initial dialogue for preview interaction', () => {
  const teacher = NEW_BARK_TOWN.objects.find(o => o.id === 'NEWBARKTOWN_TEACHER');
  const fisher = NEW_BARK_TOWN.objects.find(o => o.id === 'NEWBARKTOWN_FISHER');
  assert.match(teacher.dialogue.join(' '), /POKéGEAR/);
  assert.match(fisher.dialogue.join(' '), /PROF. ELM/);
  assert.equal(eventsAt(6, 8).find(e => e.type === 'object').id, teacher.id);
});
