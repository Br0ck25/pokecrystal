/** Source-sprite selection for map objects. Specific object kinds must be
 * checked before map/object IDs containing words such as "ELMSLAB".
 * Otherwise lab Poké Balls and the scientist are incorrectly drawn as Elm.
 */
export function getSourceSpriteForObject(object) {
  const id = String(object?.id || '').toUpperCase();
  const sprite = String(object?.sprite || '').toUpperCase();
  if (sprite === 'SPRITE_TEACHER') return 'TEACHER';
  if (sprite === 'SPRITE_POKEFAN_F') return 'POKEFAN_F';
  if (sprite === 'SPRITE_COOLTRAINER_F') return 'COOLTRAINER_F';
  if (sprite === 'SPRITE_BUG_CATCHER') return 'BUG_CATCHER';
  if (id.includes('POKE_BALL')) return 'POKE_BALL';
  if (id === 'DAUGHTER') return 'COOLTRAINER_F';
  if (id === 'NEIGHBOR') return 'POKEFAN_F';
  if (id === 'ELMS_WIFE') return 'TEACHER';
  if (id === 'ELMS_SON') return 'BUG_CATCHER';
  if (id.includes('TEACHER')) return 'TEACHER';
  if (id.includes('OFFICER') || id.includes('COP')) return 'OFFICER';
  if (id.includes('AIDE') || id.includes('SCIENTIST')) return 'SCIENTIST';
  if (id.includes('FISHER')) return 'FISHER';
  if (id.includes('RIVAL')) return 'RIVAL';
  if (id === 'MOM' || id.includes('_MOM')) return 'MOM';
  if (id === 'ELM' || id.endsWith('_ELM')) return 'ELM';
  return null;
}
