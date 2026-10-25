// Drives window.game with the same steps (one update per frame) and screenshots the canvas at each `shot`.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [stepsFile, outDir, base] = process.argv.slice(2);
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${base}/index.html?manual=1&name=AAAAAAA`);
  await page.waitForFunction(() => window.game && !window.game.loading && window.game.world);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__manual && window.__manual(true));
  for (const s of steps) {
    if (s.hold || s.press || s.wait) {
      await page.evaluate(async (s) => {
        const g = window.game;
        const dirs = ['up', 'down', 'left', 'right'];
        const frame = (input) => { g.update(input); };
        const settle = async () => { while (g.loading) await new Promise((r) => setTimeout(r, 2)); };
        if (s.hold) for (let i = 0; i < s.frames; i++) { await settle(); frame(dirs.includes(s.hold) ? { dir: s.hold } : { a: s.hold === 'a' && i === 0, b: s.hold === 'b' && i === 0, aHeld: s.hold === 'a', bHeld: s.hold === 'b' }); }
        else if (s.press) { for (let i = 0; i < 11; i++) { await settle(); frame(i < 3 ? { dir: dirs.includes(s.press) ? s.press : null, a: s.press === 'a' && i === 0, b: s.press === 'b' && i === 0, start: s.press === 'start' && i === 0, aHeld: s.press === 'a' && i < 3, bHeld: s.press === 'b' && i < 3 } : {}); } }
        else for (let i = 0; i < s.wait; i++) { await settle(); frame({}); }
        await settle();
      }, s);
    } else if (s.shot) {
      await page.evaluate(async () => { await window.__draw(); });
      const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
      fs.writeFileSync(`${outDir}/play_${s.shot}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  await browser.close();
})();
