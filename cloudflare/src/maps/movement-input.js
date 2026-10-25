/** Normalize simultaneous input to Game Boy Crystal's four cardinal directions. */
export function getCardinalStep(dx, dy) {
  const x = Number.isFinite(dx) ? Math.sign(dx) : 0;
  const y = Number.isFinite(dy) ? Math.sign(dy) : 0;
  if (x === 0 && y === 0) return null;
  if (Math.abs(dx || 0) > Math.abs(dy || 0)) return { dx: x, dy: 0, facing: x > 0 ? 'right' : 'left' };
  return { dx: 0, dy: y, facing: y > 0 ? 'down' : 'up' };
}
