// Screenshots the app's main menu: node title_app_menu.cjs out.png base downs [save.json] [A]; presses A on the title, moves down N times,
// and with a save file presses A once more (CONTINUE's info box) when the last argument is A. The clock is fixed to Sunday 10:02.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [out, base, downs = '0', saveFile, press] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1 });
  if (saveFile) await page.addInitScript((text) => localStorage.setItem('pokecrystal-save', text), fs.readFileSync(saveFile, 'utf8'));
  await page.addInitScript(() => { const fixed = new Date(2026, 9, 25, 10, 2).getTime(); const Real = Date; globalThis.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }; });
  await page.goto(`${base}/index.html?manual=1&intro=1`);
  await page.waitForFunction(() => window.__intro && window.__intro());
  await page.evaluate(async ([downs, press]) => {
    const intro = window.__intro();
    for (let i = 0; i < 40; i++) intro.update({});
    intro.update({ a: true });
    for (let i = 0; i < Number(downs); i++) { intro.update({ dir: 'down' }); intro.update({}); }
    if (press === 'A') for (let i = 0; i < 25; i++) intro.update(i ? {} : { a: true });
    await window.__draw();
  }, [downs, press]);
  const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
  fs.writeFileSync(out, Buffer.from(png.split(',')[1], 'base64'));
  await browser.close();
})();
