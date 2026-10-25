/** Source-style face-player direction for NPC scripts that use faceplayer. */
export function getNpcFacingTowardPlayer(npc, player) {
  if (!npc || !player || !Number.isInteger(npc.x) || !Number.isInteger(npc.y)
      || !Number.isInteger(player.x) || !Number.isInteger(player.y)) return null;
  const dx = player.x - npc.x;
  const dy = player.y - npc.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx < 0) return 'left';
  if (dx > 0) return 'right';
  if (dy < 0) return 'up';
  return 'down';
}
