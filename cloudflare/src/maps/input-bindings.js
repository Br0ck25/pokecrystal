/** Keyboard aliases for the browser port. Keep WASD movement unambiguous: A is LEFT, not interact. */
export function normalizeKey(key) {
  return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

export function getButtonAction(key) {
  const normalized = typeof key === 'string' ? key.toLowerCase() : key;   // 'Enter' and 'Escape' arrive capitalised
  if ([' ', 'enter', 'z', 'e'].includes(normalized)) return 'a';
  if (['x', 'escape', 'backspace'].includes(normalized)) return 'b';
  return null;
}

export function isMovementKey(key) {
  return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(normalizeKey(key));
}
