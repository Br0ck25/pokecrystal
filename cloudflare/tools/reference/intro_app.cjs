// App side of intro.py: drives window.__step one frame at a time from the title screen.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [stepsFile, outDir, base, saveFile] = process.argv.slice(2);
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => { const fixed = new Date(2026, 9, 25, 10, 2).getTime(); const Real = Date; globalThis.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; });
  if (saveFile) await page.addInitScript((text) => localStorage.setItem('pokecrystal-save', text), fs.readFileSync(saveFile, 'utf8'));
  await page.goto(`${base}/index.html?manual=1&intro=1`);
  await page.waitForFunction(() => window.__intro && window.__intro() && window.__step);
  await page.evaluate(() => { window.__manual(true); for (let i = 0; i < 31; i++) window.__step({}); });   // the title screen has finished its entrance
  for (const s of steps) {
    if (s.appUntil) {                  // the app's side of a ROM mashUntil: press A at every finished page until the named menu is up
      await page.evaluate(async (what) => {
        for (let i = 0; i < 30000; i++) {
          const it = window.__intro();
          if (!it) break;
          if (what === 'namemenu' && it.wait?.menu?.items.length === 5) break;
          if (what === 'naming' && it.view?.naming) break;
          const t = it.view?.text;
          window.__step(t && t.ready && it.wait?.text ? { a: true } : {});
        }
      }, s.appUntil);
    } else if (s.hold || s.press || s.wait) {
      await page.evaluate(async (s) => {
        const dirs = ['up', 'down', 'left', 'right'];
        const input = (i, name, frames) => ({ dir: dirs.includes(name) ? name : null, a: name === 'a' && i === 0, b: name === 'b' && i === 0, start: name === 'start' && i === 0, select: name === 'select' && i === 0, aHeld: name === 'a' && i < frames, bHeld: name === 'b' && i < frames });
        const settle = async () => { while (window.game && window.game.loading) await new Promise((r) => setTimeout(r, 2)); };
        if (s.hold) for (let i = 0; i < s.frames; i++) { await settle(); window.__step(input(i, s.hold, s.frames)); }
        else if (s.press) for (let i = 0; i < 11; i++) { await settle(); window.__step(i < 3 ? input(i, s.press, 3) : {}); }
        else for (let i = 0; i < s.wait; i++) { await settle(); window.__step({}); }
      }, s);
    } else if (s.shot) {
      await page.evaluate(async () => { await window.__draw(); });
      const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
      fs.writeFileSync(`${outDir}/intro_${s.shot}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  await browser.close();
})();
