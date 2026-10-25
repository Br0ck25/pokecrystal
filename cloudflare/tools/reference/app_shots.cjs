// Usage: node app_shots.cjs cases.json outDir baseUrl   (needs `playwright`, e.g. NODE_PATH=$(npm root -g))
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [casesFile, outDir, base] = process.argv.slice(2);
  const cases = JSON.parse(fs.readFileSync(casesFile, 'utf8'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1 });
  for (const [i, c] of cases.entries()) {
    const q = new URLSearchParams({ map: c.id, x: c.x, y: c.y, facing: c.facing || 'down', scene: c.scene || '' });
    await page.goto(`${base}/index.html?${q}`);
    await page.waitForTimeout(1500);
    const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
    fs.writeFileSync(`${outDir}/app_${i}.png`, Buffer.from(png.split(',')[1], 'base64'));
  }
  await browser.close();
})();
