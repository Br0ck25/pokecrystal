// A dialogue box being read: text appears 3 frames per tile (1 while A or B is held), pauses for a button at a paragraph
// break or prompt, and ends by itself at `done` (home/text.asm PrintLetterDelay, ButtonSound).
import { tileLength, takeTiles } from './text.js';

export const TEXT_FRAMES_PER_CHAR = 3;
export const SCROLL_FRAMES = 5;                  // <_CONT>: two TextScrolls, each followed by 5 DelayFrames

/** Where a screen's typing starts: `cont` scrolls the second line up, so it is already on screen. */
export const screenStart = (screens, index) => (index > 0 && screens[index - 1].wait === 'cont' ? tileLength(screens[index - 1].lines[1]) : 0);

export const startTextWait = (screens) => ({ kind: 'text', screens, index: 0, chars: screenStart(screens, 0), timer: 0, ready: false });

/** One frame. Returns true when the whole text has been read. */
export function stepTextWait(wait, input) {
  const screen = wait.screens[wait.index];
  const total = tileLength(screen.lines[0]) + tileLength(screen.lines[1]);
  if (wait.scroll !== undefined) {                       // the lines move up a row at a time before the next one is typed
    if (++wait.scroll >= 2 * SCROLL_FRAMES) {
      wait.scroll = undefined; wait.index++; wait.chars = screenStart(wait.screens, wait.index) + 1; wait.timer = 0; wait.ready = false;
      if (wait.chars >= tileLength(wait.screens[wait.index].lines[0]) + tileLength(wait.screens[wait.index].lines[1])) wait.ready = true;
    }
    return false;
  }
  if (!wait.ready) {
    wait.timer++;
    const per = (input.aHeld || input.bHeld) ? 1 : input.delay ?? TEXT_FRAMES_PER_CHAR;
    if (wait.timer >= per) { wait.timer = 0; wait.chars++; }
    if (wait.chars >= total) wait.ready = true;
    return false;
  }
  if (screen.wait === null) return true;
  if (!(input.a || input.b)) return false;
  if (wait.index === wait.screens.length - 1) return true;
  if (screen.wait === 'cont') { wait.scroll = 0; return false; }
  wait.index++;
  wait.chars = screenStart(wait.screens, wait.index);
  wait.timer = 0;
  wait.ready = false;
  return false;
}

/** What the box shows: the two lines typed so far and whether the ▼ prompt blinks. */
export function textLines(wait) {
  const screen = wait.screens[wait.index];
  if (wait.scroll !== undefined) {                       // first scroll: both lines a row up; second: the lower one in the upper place
    return wait.scroll < SCROLL_FRAMES ? { lines: [screen.lines[0], screen.lines[1]], prompt: false, shift: -1 } : { lines: [screen.lines[1], ''], prompt: false, shift: 0 };
  }
  return {
    lines: [takeTiles(screen.lines[0], wait.chars), takeTiles(screen.lines[1], wait.chars - tileLength(screen.lines[0]))],
    prompt: wait.ready && screen.wait !== null,
    shift: 0,
  };
}
