import test from 'node:test';
import assert from 'node:assert/strict';
import { evolutionTarget } from './evolve.js';

test('level evolutions need the level and no EVERSTONE', () => {
  assert.equal(evolutionTarget({ species: 'CHIKORITA', level: 16, stats: {} }), 'BAYLEEF');
  assert.equal(evolutionTarget({ species: 'CHIKORITA', level: 15, stats: {} }), null);
  assert.equal(evolutionTarget({ species: 'CHIKORITA', level: 30, item: 'EVERSTONE', stats: {} }), null);
});

test('Tyrogue evolves by its Attack against its Defense', () => {
  assert.equal(evolutionTarget({ species: 'TYROGUE', level: 20, stats: { atk: 9, def: 10 } }), 'HITMONCHAN');
  assert.equal(evolutionTarget({ species: 'TYROGUE', level: 20, stats: { atk: 10, def: 10 } }), 'HITMONTOP');
});

test('happiness evolutions follow the time of day', () => {
  assert.equal(evolutionTarget({ species: 'EEVEE', level: 5, happiness: 220, stats: {} }, 'DAY'), 'ESPEON');
  assert.equal(evolutionTarget({ species: 'EEVEE', level: 5, happiness: 220, stats: {} }, 'NITE'), 'UMBREON');
  assert.equal(evolutionTarget({ species: 'EEVEE', level: 5, happiness: 100, stats: {} }, 'DAY'), null);
});
