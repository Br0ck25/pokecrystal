// Text boxes, following macros/scripts/text.asm and home/text.asm: a box shows two lines of 18 columns.
//   text  appends at the cursor        line  moves to line 2         para  waits for a button, clears the box
//   cont  waits, scrolls line 2 up and continues on line 2           done  ends (box stays)    prompt  waits, ends
// '@' ends a string without printing anything; '#' prints "POKé".

import { FONT_CODES } from '../generated/font.js';

// charmap.asm has single glyphs for the contractions 'd 'l 'm 'r 's 't 'v: "It's" is three tiles, not four.
const CONTRACTIONS = new Set(Object.keys(FONT_CODES).filter((k) => k.length === 2 && k[0] === "'"));
const TOKENS = ['<COLON>', '<PK>', '<MN>', '<PO>', '<KE>', '<DOT>'];   // single-tile codes written with several characters: the clock's colon, the small "PK" "MN" "PO" "KE" glyphs, the naming screen's underline
/** Split a string into the tiles the game prints, one per character code. */
export function tiles(string) {
  const out = [];
  for (let i = 0; i < string.length; i++) {
    const token = TOKENS.find((t) => string.startsWith(t, i));
    if (token) { out.push(token); i += token.length - 1; }
    else if (CONTRACTIONS.has(string.slice(i, i + 2))) { out.push(string.slice(i, i + 2)); i++; } else out.push(string[i]);
  }
  return out;
}
export const tileLength = (string) => tiles(string).length;
export const takeTiles = (string, n) => tiles(string).slice(0, Math.max(0, n)).join('');

/** Replace the character codes that print names or fixed words (home/text.asm CheckDict). */
export function expandTokens(s, { playerName, rivalName }) {
  if (s.includes('{')) throw new Error(`unsupported compile-time substitution in "${s}"`);
  return s
    .replace(/<PLAYER>|<PLAY_G>/g, playerName)
    .replace(/<RIVAL>/g, rivalName)
    .replace(/<MOM>/g, 'MOM')
    .replace(/<TRAINER>/g, 'TRAINER')
    .replace(/<……>/g, '……')                // two characters (SixDotsChar)
    .replace(/<PKMN>/g, '<PK><MN>')            // PlacePKMNText
    .replace(/<POKE>/g, '<PO><KE>')            // PlacePOKEText: two small glyphs, unlike # which prints the letters POKé
    .replace(/<PC>|<TM>|<ROCKET>/g, (t) => t.slice(1, -1))
    .replace(/<BSP>/g, ' ')
    .replace(/<WBR>/g, '')
    .replace(/#/g, 'POKé')
    .replace(/@/g, '');
}

/**
 * Render a text block to screens: [{ lines: [line1, line2], wait }] where wait is 'para', 'cont' or 'prompt' when the
 * player must press a button before the next screen (or the end), and null for 'done'.
 * env: { block(label) -> commands | undefined, vars: { wStringBuffer4: '...' }, playerName, rivalName }
 */
export function renderText(commands, env) {
  const screens = [];
  let lines = ['', ''];
  let row = 0;
  const push = (wait) => screens.push({ lines: [...lines], wait });
  const run = (block) => {
    for (const [name, ...args] of block) {
      switch (name) {
        case 'text': lines[row] += expandTokens(args[0], env); break;
        case 'line': row = 1; lines[1] += expandTokens(args[0], env); break;
        case 'para': push('para'); lines = ['', '']; row = 0; lines[0] += expandTokens(args[0], env); break;
        case 'cont': push('cont'); lines = [lines[1], '']; row = 1; lines[1] += expandTokens(args[0], env); break;
        case 'text_ram': {
          if (!(args[0] in env.vars)) throw new Error(`text_ram ${args[0]} has no value`);
          lines[row] += env.vars[args[0]];
          break;
        }
        case 'text_decimal': {                                     // PrintNum, left-aligned (measured: "Throw away 2")
          if (!(args[0] in env.vars)) throw new Error(`text_decimal ${args[0]} has no value`);
          lines[row] += String(env.vars[args[0]]);
          break;
        }
        case 'text_far': {
          const far = env.block(args[0]);
          if (!far) throw new Error(`text_far ${args[0]}: no such text`);
          if (run(far)) return true;
          break;
        }
        case 'done': push(null); return true;
        case 'prompt': case 'text_promptbutton': push('prompt'); return true;
        case 'text_end': return true;
        case 'text_low': row = 1; break;                           // the cursor goes to the second line
        case 'text_pause': case 'sound_item': case 'text_start': break;
        default:
          if (name.startsWith('sound_')) break;                      // sound effects and fanfares are not played
          throw new Error(`unsupported text command ${name}`);
      }
    }
    return false;
  };
  if (!run(commands)) push(null);
  return screens;
}
