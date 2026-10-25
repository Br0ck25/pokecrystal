/** Wrap dialogue into pages small enough for the 160x144 GBC text box.
 * Explicit source line breaks are retained (notably vertical YES/NO menus).
 */
export function createDialoguePages(text, maxChars = 33, linesPerPage = 3) {
  const sourceLines = String(text ?? '').replace(/\r/g, '').split('\n');
  const lines = [];
  for (const sourceLine of sourceLines) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && next.length > maxChars) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  if (!lines.length) return [['']];
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage));
  return pages;
}
