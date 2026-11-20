import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launch, openRoute, makeBattle, setBattle } from './fixture.mjs';

const out = process.argv[2] ?? 'reports/astra-enemy-light/perf.json';
const scenarios = JSON.parse(await readFile('scripts/v3a2/fixtures.json')).fixtures.filter(f => f.id !== 'wave1');
const maps = JSON.parse(await readFile('docs/astra-enemy-light-2026-11-21/maps.json'));
const memory = Object.fromEntries(maps.map(m => [m.file.split('/').at(-2), m.size[0]*m.size[1]*4]));
const result = { method: '1280x720, DPR 1, Metal Chromium, 3s warmup then 20s RAF intervals in the unpaused campaign; standard auto choices. RGBA8 decoded map bytes, no mipmaps.',
  browser: '', allMapBytes: Object.values(memory).reduce((a,b) => a+b,0), scenarios: {} };
const browser = await launch();
try {
  result.browser = browser.version();
  for (const [i, fixture] of scenarios.entries()) {
    const pair = result.scenarios[fixture.id] = {};
    // Prime both shader variants and the same legal actions before either timed sample.
    // GPU driver compilation and first-use VFX decoding otherwise depend on test order.
    for (const off of [true,false]) {
      const warm = await openRoute(browser, { off });
      await setBattle(warm, makeBattle(fixture.enemies, fixture.chapter));
      await warm.evaluate(async () => {
        window.__depthReview.paused = false; window.__depthReview.notify(false);
        await new Promise(resolve => setTimeout(resolve, 24000));
      });
      warm.check(); await warm.close();
    }
    for (const off of i % 2 ? [false,true] : [true,false]) {
      const page = await openRoute(browser, { off });
      await setBattle(page, makeBattle(fixture.enemies, fixture.chapter));
      const row = await page.evaluate(async () => {
        const m = window.__depthReview, s = window.__depthScene;
        m.paused = false; m.notify(false);
        await new Promise(resolve => setTimeout(resolve, 3000));
        const before = m.battle.log.length;
        const samples = [], assets = new Set(), start = performance.now();
        const gl = s.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
        let previous, draws = 0, textures = 0;
        await new Promise(resolve => {
          const tick = now => {
            if (previous !== undefined) samples.push(Math.round((now - previous)*10)/10);
            previous = now;
            draws = Math.max(draws, s.renderer.info.render.calls);
            textures = Math.max(textures, s.renderer.info.memory.textures);
            for (const e of s.actors.values()) if (e.actor.unit.side === 'enemy') assets.add(e.asset);
            if (now-start >= 20000) resolve(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        samples.sort((a,b) => a-b);
        return { gpu, frames: samples.length, p50: samples[Math.ceil(samples.length*.5)-1],
          p95: samples[Math.ceil(samples.length*.95)-1], max: samples.at(-1),
          above50: samples.filter(ms => ms>50).length, durationMs: performance.now()-start,
          draws, textures, eventsPlayed: m.battle.log.length - before, assets: [...assets].sort() };
      });
      assert(row.eventsPlayed > 0 && row.frames > 100, 'Missing active battle');
      row.mapBytes = off ? 0 : row.assets.reduce((acc, asset) => acc + (memory[asset] ?? 0), 0);
      pair[off ? 'before' : 'after'] = row;
      page.check(); await page.close();
      console.log(fixture.id, off ? 'before' : 'after', JSON.stringify(row));
      await writeFile(out, JSON.stringify(result,null,2)+'\n');
    }
    pair.deltaP95 = +(pair.after.p95 - pair.before.p95).toFixed(3);
    pair.green = pair.deltaP95 <= 1 && pair.after.above50 <= pair.before.above50 && pair.after.mapBytes < 24000000;
  }
  await writeFile(out, JSON.stringify(result,null,2)+'\n');
  assert(Object.values(result.scenarios).every(pair => pair.green), 'Performance gate failed');
} finally { await browser.close(); }
