/** Starter-ball mapping transcribed from maps/ElmsLab.asm and its object constants. */
export const LAB_STARTERS = Object.freeze({
  ELMSLAB_POKE_BALL1: Object.freeze({ species: 'CYNDAQUIL', type: 'FIRE', level: 5 }),
  ELMSLAB_POKE_BALL2: Object.freeze({ species: 'TOTODILE', type: 'WATER', level: 5 }),
  ELMSLAB_POKE_BALL3: Object.freeze({ species: 'CHIKORITA', type: 'GRASS', level: 5 }),
});

export function getLabStarter(ballObjectId) {
  return LAB_STARTERS[ballObjectId] ?? null;
}

export function getLabStarterBallId(species) {
  return Object.keys(LAB_STARTERS).find(id => LAB_STARTERS[id].species === species) ?? null;
}

export function mustBlockLabExit(starter) {
  return !starter;
}
