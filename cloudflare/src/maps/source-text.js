/** Render common disassembly text tokens in the browser preview. */
export function formatSourceText(value, playerName = 'KRIS') {
  return String(value ?? '')
    .replace(/<PLAYER>/g, playerName)
    .replace(/<PLAY_G>/g, playerName)
    .replace(/#MON/g, 'POKéMON')
    .replace(/#GEAR/g, 'POKéGEAR');
}
