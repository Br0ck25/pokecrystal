// Writes the app title-screen frame after N updates as raw RGBA (title_app_<N>.rgba) for title.py to compare.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Intro } from '../../src/game/intro.js';
import { titleFrame } from '../../src/render/title-frame.js';

const [outDir, list] = process.argv.slice(2);
const intro = new Intro();
let done = 0;
for (const n of list.split(',').map(Number)) {
  while (done < n) { intro.update({}); done++; }
  writeFileSync(join(outDir, `title_app_${n}.rgba`), titleFrame(intro.titleState()));
}
