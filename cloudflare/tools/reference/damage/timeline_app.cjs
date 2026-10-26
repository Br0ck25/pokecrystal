// usage: node timeline_app.cjs URL OUT.json [frame,frame,...]  -- plays the inputs of timeline2_probe.py; records per-frame changed pixel counts and the listed frames
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [url, out, want = ''] = process.argv.slice(2);
  const wanted = new Set(want.split(',').filter(Boolean).map(Number));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 480, height: 432 } });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.goto(url); await p.waitForFunction(() => window.game && window.game.battleScreen, null, { timeout: 20000 });
  await p.evaluate(() => window.__manual(true)); await p.evaluate(() => window.__draw());
  const res = await p.evaluate(async (wantedList) => {
    const wanted = new Set(wantedList);
    const canvas = document.querySelector('#map'); const ctx = canvas.getContext('2d');
    const counts = [], shots = {}; let prev = null, n = 0, start = 0;
    const snap = () => { window.__drawSync(); const s = canvas.width / 160; const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data; const row = new Uint8Array(160 * 144 * 3); for (let y = 0; y < 144; y++) for (let x = 0; x < 160; x++) { const i = (Math.floor(y * s + s / 2) * canvas.width + Math.floor(x * s + s / 2)) * 4; const o = (y * 160 + x) * 3; row[o] = d[i]; row[o + 1] = d[i + 1]; row[o + 2] = d[i + 2]; } return row; };
    const step = (inp = {}) => {
      window.__step(inp); const row = snap(); let c = 0;
      if (prev) for (let i = 0; i < row.length; i += 3) if (Math.abs(row[i] - prev[i]) + Math.abs(row[i + 1] - prev[i + 1]) + Math.abs(row[i + 2] - prev[i + 2]) > 48) c++;
      counts.push(c); prev = row;
      const rel = counts.length - 1 - start; if (start && wanted.has(rel)) shots[rel] = btoa(String.fromCharCode(...row));
    };
    while (!(window.game.battleScreen.mode === 'intro' && window.game.battleScreen.wait.ready)) step();
    start = counts.length;
    const press = (after) => { step({ a: true }); for (let i = 0; i < after; i++) step(); };
    press(303); press(63); step({ a: true }); for (let i = 0; i < 1100; i++) step();
    return { start, counts, shots };
  }, [...wanted]);
  fs.writeFileSync(out, JSON.stringify(res)); await b.close();
})();
