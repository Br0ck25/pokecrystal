import test from 'node:test';
import assert from 'node:assert/strict';
import { getSourceSpriteForObject } from './maps/npc-sprite-map.js';

test('lab object IDs select their actual source sprite, not the ELMSLAB prefix', () => {
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_ELM' }), 'ELM');
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_ELMS_AIDE' }), 'SCIENTIST');
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_OFFICER' }), 'OFFICER');
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_POKE_BALL1' }), 'POKE_BALL');
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_POKE_BALL2' }), 'POKE_BALL');
  assert.equal(getSourceSpriteForObject({ id: 'ELMSLAB_POKE_BALL3' }), 'POKE_BALL');
});

test('town and home NPC IDs retain their intended source sprites', () => {
  assert.equal(getSourceSpriteForObject({ id: 'NEWBARKTOWN_TEACHER' }), 'TEACHER');
  assert.equal(getSourceSpriteForObject({ id: 'NEWBARKTOWN_FISHER' }), 'FISHER');
  assert.equal(getSourceSpriteForObject({ id: 'NEWBARKTOWN_RIVAL' }), 'RIVAL');
  assert.equal(getSourceSpriteForObject({ id: 'MOM' }), 'MOM');
  assert.equal(getSourceSpriteForObject({ id: 'NEIGHBOR' }), null);
  assert.equal(getSourceSpriteForObject(null), null);
});
