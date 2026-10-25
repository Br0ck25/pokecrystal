import test from 'node:test';
import assert from 'node:assert/strict';
import { ELMS_LAB } from './maps/elms-lab.js';
import { ELMS_LAB_BLOCK_IDS, getElmsLabBlock, getElmsLabBlockAtMetatile, getElmsLabCollisionAtMetatile } from './maps/elms-lab-blocks.js';

test('Elm lab block grid has exactly 5 by 6 source blocks', () => {
  assert.equal(ELMS_LAB_BLOCK_IDS.length, ELMS_LAB.dimensions.blocksWide * ELMS_LAB.dimensions.blocksHigh);
  assert.deepEqual(ELMS_LAB_BLOCK_IDS.slice(0, 5), [23, 8, 9, 4, 4]);
  assert.deepEqual(ELMS_LAB_BLOCK_IDS.slice(-5), [1, 2, 1, 1, 1]);
});
test('Elm lab block and metatile lookup rejects out-of-range coordinates', () => {
  assert.equal(getElmsLabBlock(0, 0), 23);
  assert.equal(getElmsLabBlock(4, 5), 1);
  assert.equal(getElmsLabBlock(-1, 0), null);
  assert.equal(getElmsLabBlock(5, 0), null);
  assert.equal(getElmsLabBlockAtMetatile(9, 11), 1);
  assert.equal(getElmsLabBlockAtMetatile(10, 11), null);
  assert.equal(getElmsLabCollisionAtMetatile(-1, 0), null);
  assert.equal(getElmsLabCollisionAtMetatile(0, 0), 'FLOOR');
});
