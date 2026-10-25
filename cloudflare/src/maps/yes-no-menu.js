/** Render the source game's vertical YES/NO cursor consistently. */
export function formatYesNoChoice(yes = true) {
  return yes ? '▶ YES\n  NO' : '  YES\n▶ NO';
}

/** Source yesorno menus are vertical: UP selects YES, DOWN selects NO. */
export function moveYesNoChoice(currentYes, dx, dy) {
  if (dy < 0) return true;
  if (dy > 0) return false;
  return Boolean(currentYes);
}
