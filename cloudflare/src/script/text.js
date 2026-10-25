// Text boxes, following macros/scripts/text.asm and home/text.asm: a box shows two lines of 18 columns.
//   text  appends at the cursor        line  moves to line 2         para  waits for a button, clears the box
//   cont  waits, scrolls line 2 up and continues on line 2           done  ends (box stays)    prompt  waits, ends
// '@' ends a string without printing anything; '#' prints "POKé".

/** Replace the character codes that print names or fixed words (home/text.asm CheckDict). */
export function expandTokens(s, { playerName, rivalName }) {
  if (s.includes('{')) throw new Error(`unsupported compile-time substitution in "${s}"`);
  return s
    .replace(/<PLAYER>|<PLAY_G>/g, playerName)
    .replace(/<RIVAL>/g, rivalName)
    .replace(/<MOM>/g, 'MOM')
    .replace(/<TRAINER>/g, 'TRAINER')
    .replace(/<……>/g, '……')                // two characters (SixDotsChar)
    .replace(/<PKMN>/g, 'PKMN')
    .replace(/<POKE>/g, 'POKé')
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
        case 'text_far': {
          const far = env.block(args[0]);
          if (!far) throw new Error(`text_far ${args[0]}: no such text`);
          if (run(far)) return true;
          break;
        }
        case 'done': push(null); return true;
        case 'prompt': push('prompt'); return true;
        case 'text_end': return true;
        case 'text_pause': case 'sound_item': break;
        default: throw new Error(`unsupported text command ${name}`);
      }
    }
    return false;
  };
  if (!run(commands)) push(null);
  return screens;
}
