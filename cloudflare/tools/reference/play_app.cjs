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
    if (s.enter) {
      await page.evaluate(async (e) => {
        const g = window.game;
        for (const pair of e.scene.split(',').filter(Boolean)) { const [n, i] = pair.split(':'); g.state.scenes[n] = Number(i); }
        for (const f of e.clearFlags) g.state.flags.delete(f);
        for (const f of e.flags) g.state.flags.add(f);
        if (e.playerId !== undefined) g.state.playerId = e.playerId;                // the ROM's trainer ID (the trainer card shows it)
        Object.assign(g.state.items, e.items ?? {});                              // bag contents, in order
        for (const f of e.engine ?? []) g.state.engineFlags.add(f);          // e.g. ENGINE_POKEGEAR, ENGINE_POKEDEX
        if (e.party?.length) {                                                       // [{ species, level, dvs }]
          const { createMon } = await import('/src/script/mon.js');
          for (const m of e.party) g.state.party.push(createMon({ id: 0, ...m }));
        }
        if (e.plant?.length) {                                                       // the same Pokémon planted in the ROM's party
          const { createMon } = await import('/src/script/mon.js');
          for (const m of e.plant) { const mon = createMon({ species: m.species, level: m.level, dvs: m.dvs, id: m.id, item: m.itemName ?? null }); Object.assign(mon, { moves: m.moves, pp: m.pp, exp: m.exp, hp: m.hp, nickname: 'TEST', status: m.status ?? 0 }); mon.stats = { ...m.stats }; g.state.party.push(mon); }
        }
        if (e.prevLandmark) g.prevLandmark = e.prevLandmark;
        if (e.enemyMonLevel !== undefined) g.enemyMonLevel = e.enemyMonLevel;
        if (e.clock) g.state.clock = e.clock;                                         // the time the Pokégear shows
        await g.enterMap(e.map, e.x, e.y, 'down');
        while (g.loading) await new Promise((r) => setTimeout(r, 2));
        for (let i = 0; i < (e.settle ?? 0); i++) g.update({});                  // the ROM idles this long after the warp too
        if (e.tileAnim) { g.tileAnim.index = e.tileAnim[0]; g.tileAnim.timer = e.tileAnim[1]; }   // the real game's animation phase
      }, s.enter);
    } else if (s.sync) {                                                                 // the same taps of A (or steps) until the battle transition starts
      await page.evaluate(async (s) => {
        const g = window.game;
        const wait = async () => { while (g.loading) await new Promise((r) => setTimeout(r, 2)); };
        if (s.walk) {
          g.randomByte = () => 255;                                                      // no encounter of its own
          for (let i = 0; i < s.frames - 1; i++) { await wait(); g.update({ dir: s.walk[Math.floor(i / 16) % s.walk.length] }); }
          const { species, level, dvs } = s.force;
          g.randomByte = (() => { let n = 0; return () => (n = (n * 5 + 3) & 255); })();
          await g.startWildBattle({ species, level, dvs });
        } else {
          for (let i = 0; i < (s.limit ?? 4000); i++) {
            await wait();
            g.update(s.tap && i % 40 === 0 ? { a: true, aHeld: true } : s.tap && i % 40 < 3 ? { aHeld: true } : {});
            if (g.transition) break;
          }
        }
        if (!g.transition) throw new Error('the battle never started');
        g.update({});                                                                    // transition frame 0
      }, s);
    } else if (s.mash) {                                                                 // the same taps of A, shooting at the given frames
      const shots = Object.entries(s.shots).sort((x, y) => x[1] - y[1]);
      let i = 0;
      for (const [label, f] of shots) {
        const done = await page.evaluate(async ([from, to, press]) => {
          const g = window.game;
          const input = (i) => (i % 40 === 0 ? { a: true, aHeld: true } : i % 40 < 3 ? { aHeld: true } : {});
          for (let i = from; i < to; i++) { while (g.loading) await new Promise((r) => setTimeout(r, 2)); g.update(input(i)); }
          while (g.loading) await new Promise((r) => setTimeout(r, 2));
          g.update(input(to)); await window.__draw();
          return to + 1;
        }, [i, f, s.mash]);
        i = done;
        console.log(`  [${label}] app mash`);
        const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
        fs.writeFileSync(`${outDir}/play_${label}.png`, Buffer.from(png.split(',')[1], 'base64'));
      }
    } else if (s.hold || s.press || s.wait) {
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
      await page.evaluate(async () => { const g = window.game; while (g.loading) await new Promise((r) => setTimeout(r, 2)); g.update({}); await window.__draw(); });      // the ROM side ticks one frame to read its screen
      console.log(`  [${s.shot}] app at`, JSON.stringify(await page.evaluate(() => [window.game.player.x, window.game.player.y, window.game.player.facing, window.game.pokepic, !!window.game.runner, [...window.game.unported]])));
      const png = await page.evaluate(() => document.querySelector('#map').toDataURL('image/png'));
      fs.writeFileSync(`${outDir}/play_${s.shot}.png`, Buffer.from(png.split(',')[1], 'base64'));
    }
  }
  await browser.close();
})();
