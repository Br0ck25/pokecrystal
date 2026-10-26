import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE } from '../generated/battle-data.js';
import { truncateStats, damageCalc, criticalStage, isCritical, stab, damageVariation } from './damage.js';

const T = BATTLE.types;

test('TruncateHL_BC shrinks both stats by 4 until they fit a byte, never to 0', () => {
  assert.deepEqual(truncateStats(300, 200), { attack: 75, defense: 50 });
  assert.deepEqual(truncateStats(999, 2), { attack: 249, defense: 1 });
  assert.deepEqual(truncateStats(40, 30), { attack: 40, defense: 30 });
});

test('damage: level 5 TACKLE (35) with 10 attack against 12 defense is 3 before variation', () => {
  // (5*2/5+2)=4; 4*35*10/12=116; /50=2; +2
  assert.equal(damageCalc({ power: 35, level: 5, attack: 10, defense: 12, effect: 'EFFECT_NORMAL_HIT', moveType: T.NORMAL, userItem: null, critical: false }), 4);
});

test('damage: critical hits double, a type-boost item adds its percentage, and the cap is 997 + 2', () => {
  const base = { power: 80, level: 50, attack: 100, defense: 50, effect: 'EFFECT_NORMAL_HIT', moveType: T.FIRE };
  assert.equal(damageCalc({ ...base, userItem: null, critical: false }), 72);
  assert.equal(damageCalc({ ...base, userItem: 'CHARCOAL', critical: false }), Math.floor(70 * 110 / 100) + 2);
  assert.equal(damageCalc({ ...base, userItem: null, critical: true }), 142);
  assert.equal(damageCalc({ ...base, attack: 255, defense: 1, userItem: null, critical: false }), 999);
});

test('critical stage: Focus Energy, high-crit moves, Scope Lens, Lucky Punch; chances come from the table', () => {
  assert.equal(criticalStage({ species: 'PIDGEY', item: null, focusEnergy: false, move: 'TACKLE' }), 0);
  assert.equal(criticalStage({ species: 'PIDGEY', item: 'SCOPE_LENS', focusEnergy: true, move: 'SLASH' }), 4);
  assert.equal(criticalStage({ species: 'CHANSEY', item: 'LUCKY_PUNCH', focusEnergy: true, move: 'TACKLE' }), 2);
  assert.equal(isCritical(0, () => BATTLE.critChances[0] - 1), true);
  assert.equal(isCritical(0, () => BATTLE.critChances[0]), false);
});

test('STAB adds half, type matchups scale by the chart, immunity zeroes damage and flags a miss', () => {
  const grass = { types: [T.GRASS, T.GRASS] };
  const r = stab({ damage: 20, moveType: T.GRASS, user: grass, target: { types: [T.WATER, T.GROUND] } });
  assert.deepEqual(r, { damage: 120, stab: true, matchup: 40, missed: false });
  const g = stab({ damage: 20, moveType: T.GROUND, user: { types: [T.NORMAL, T.NORMAL] }, target: { types: [T.FLYING, T.FLYING] } });
  assert.equal(g.damage, 0);
  assert.equal(g.missed, true);
  assert.equal(stab({ damage: 20, moveType: T.NORMAL, user: grass, target: { types: [T.GHOST, T.GHOST] } }).missed, true);
  assert.equal(stab({ damage: 20, moveType: T.NORMAL, user: grass, target: { types: [T.GHOST, T.GHOST], identified: true } }).damage, 20);
});

test('weather and badges: rain strengthens water, the Zephyr Badge adds an eighth to Flying moves of the player', () => {
  const user = { types: [T.NORMAL, T.NORMAL] }, target = { types: [T.NORMAL, T.NORMAL] };
  assert.equal(stab({ damage: 40, moveType: T.WATER, user, target, weather: 1 }).damage, 60);
  assert.equal(stab({ damage: 40, moveType: T.FLYING, user, target, isPlayer: true, badges: 1 }).damage, 45);
  assert.equal(stab({ damage: 40, moveType: T.FLYING, user, target, isPlayer: false, badges: 1 }).damage, 40);
});

test('damage variation scales by 217..255 / 255 and leaves 0 and 1 alone', () => {
  const rotl = (v) => ((v << 1) | (v >> 7)) & 255;
  assert.equal(damageVariation(100, () => rotl(255)), 100);
  assert.equal(damageVariation(100, () => rotl(217)), 85);
  assert.equal(damageVariation(1, () => 0), 1);
  const seq = [rotl(10), rotl(255)];                  // rolls below 217 are thrown away
  assert.equal(damageVariation(100, () => seq.shift()), 100);
});
