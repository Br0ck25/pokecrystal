/** Source-sprite selection for map objects. Specific object kinds must be
 * checked before map/object IDs containing words such as "ELMSLAB".
 * Otherwise lab Poké Balls and the scientist are incorrectly drawn as Elm.
 */
export function getSourceSpriteForObject(object) {
  const id = String(object?.id || '').toUpperCase();
  if (id.includes('POKE_BALL')) return 'POKE_BALL';
  if (id.includes('TEACHER')) return 'TEACHER';
  if (id.includes('OFFICER') || id.includes('COP')) return 'OFFICER';
  if (id.includes('AIDE') || id.includes('SCIENTIST')) return 'SCIENTIST';
  if (id.includes('FISHER')) return 'FISHER';
  if (id.includes('RIVAL')) return 'RIVAL';
  if (id === 'MOM' || id.includes('_MOM')) return 'MOM';
  if (id === 'ELM' || id.endsWith('_ELM')) return 'ELM';
  return null;
}
