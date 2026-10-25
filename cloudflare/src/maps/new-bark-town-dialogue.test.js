import test from 'node:test';
import assert from 'node:assert/strict';
import { getNewBarkTownObjectDialogue } from './new-bark-town-dialogue.js';
import { NEW_BARK_TOWN } from './new-bark-town.js';

const teacher = { id: 'NEWBARKTOWN_TEACHER', dialogue: ['Wow, your POKéGEAR is impressive!', 'Did your mom get it for you?'] };

test('teacher dialogue follows the source event order and starter flag', () => {
  assert.deepEqual(getNewBarkTownObjectDialogue(teacher, {}), teacher.dialogue);
  assert.deepEqual(getNewBarkTownObjectDialogue(teacher, { starter: 'TOTODILE' }), ['Oh! Your POKéMON is adorable!', 'I wish I had one!']);
  assert.match(getNewBarkTownObjectDialogue(teacher, { starter: 'CYNDAQUIL', gaveMysteryEggToElm: true }).join(' '), /Leaving again/);
  assert.match(getNewBarkTownObjectDialogue(teacher, { talkedToMomAfterMysteryEggQuest: true }).join(' '), /Call your mom/);
});

test('other town object dialogue remains source metadata driven', () => {
  const fisher = { id: 'NEWBARKTOWN_FISHER', dialogue: ['Yo, <PLAYER>!', 'I hear PROF. ELM discovered some new POKéMON.'] };
  assert.deepEqual(getNewBarkTownObjectDialogue(fisher, { starter: 'CHIKORITA' }), fisher.dialogue);
  assert.deepEqual(getNewBarkTownObjectDialogue(null), []);
});


test('New Bark Town sign and Fisher text preserve the original player-name and Pokémon tokens', () => {
  const houseSign = NEW_BARK_TOWN.backgroundEvents.find(event => event.script === 'NewBarkTownPlayersHouseSign');
  const labSign = NEW_BARK_TOWN.backgroundEvents.find(event => event.script === 'NewBarkTownElmsLabSign');
  const fisher = NEW_BARK_TOWN.objects.find(object => object.id === 'NEWBARKTOWN_FISHER');
  assert.equal(houseSign.text, "<PLAYER>'s House");
  assert.equal(labSign.text, 'ELM #MON LAB');
  assert.equal(fisher.dialogue[0], 'Yo, <PLAYER>!');
});
