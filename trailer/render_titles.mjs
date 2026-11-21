/**
 * Render every on-screen text overlay in timeline.json as an alpha .mov
 * (PNG codec, 1920x1080, 30 fps) into trailer/build/titles/<shot>.mov.
 *   (cd trailer && python3 timeline.py) && node trailer/render_titles.mjs
 */
import {createRequire} from 'node:module';
import {mkdir, rm, readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../apps/web/package.json'));
const {chromium} = require('@playwright/test');
const tl = JSON.parse(await readFile(resolve(here, 'timeline.json'), 'utf8'));
const out = resolve(here, 'build/titles'); await mkdir(out, {recursive: true});
const jobs = [];
for (const s of tl.shots) if (s.text) jobs.push({id: s.id, spec: s.text, dur: s.t1 - s.t0});
tl.lower_thirds.forEach((l, i) => jobs.push({id: `lower${i}`, spec: {kind: 'lower', main: l.text}, dur: l.t1 - l.t0}));
const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
await page.goto(pathToFileURL(resolve(here, 'titles/titles.html')).href);
await page.evaluate(() => document.fonts.ready);
for (const j of jobs.filter(j => !only.length || only.includes(j.id))) {
  const dir = resolve(out, j.id + '.frames'); await rm(dir, {recursive: true, force: true}); await mkdir(dir, {recursive: true});
  const n = Math.round(j.dur * 30);
  for (let f = 0; f < n; f++) {
    await page.evaluate(([spec, t, d]) => window.render(spec, t, d), [j.spec, f / 30, j.dur]);
    await page.screenshot({path: resolve(dir, String(f).padStart(4, '0') + '.png'), omitBackground: true});
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '30', '-i', resolve(dir, '%04d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', resolve(out, j.id + '.mov')]);
  await rm(dir, {recursive: true, force: true});
  console.log('title', j.id, n);
}
await browser.close();
