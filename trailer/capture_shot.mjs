/**
 * Record trailer shots from the real game, frame by frame in virtual time
 * (same clock technique as tools/v5int/v9-demo-record-stepped.mjs), so every
 * clip plays at true game speed at 30 fps even on a software renderer.
 *
 *   node trailer/capture_shot.mjs trailer/shots.json [shotId ...]
 *
 * Output: trailer/shots/<id>.mp4 (1920x1080, 30 fps, CRF 16) + <id>.jpg poster.
 * The game must be served at TRAILER_ORIGIN (default http://127.0.0.1:6301),
 * e.g. `node tools/v5int/run-chain-mode.mjs --fixture`.
 */
import {createRequire} from 'node:module';
import {mkdir, writeFile, rm, readFile, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(process.env.TRAILER_REPO ?? resolve(here, '..'), 'apps/web/package.json'));
const {chromium} = require('@playwright/test');
const origin = process.env.TRAILER_ORIGIN ?? 'http://127.0.0.1:6301';
const FPS = 30, DT = 1000 / FPS;
const outDir = resolve(here, process.env.TRAILER_OUT ?? 'shots');
const [specPath, ...only] = process.argv.slice(2);
const spec = JSON.parse(await readFile(specPath, 'utf8'));
const shots = spec.shots.filter(s => !only.length || only.includes(s.id));

// ---------------------------------------------------------------- virtual clock (page side)
const virtualTime = () => {
  const W = window, P = performance, M = HTMLMediaElement.prototype;
  const realRaf = W.requestAnimationFrame.bind(W), realNow = P.now.bind(P), realDateNow = Date.now, realTimeout = W.setTimeout.bind(W);
  const realPlay = M.play, realPause = M.pause, pausedGet = Object.getOwnPropertyDescriptor(M, 'paused').get;
  let t = realNow(), step = false, rafId = 0, timerId = 1e6; const epoch = realDateNow() - t;
  const rafs = new Map(), timers = new Map(), media = new Set();
  delete HTMLVideoElement.prototype.requestVideoFrameCallback;
  P.now = () => t; Date.now = () => Math.floor(epoch + t);
  W.requestAnimationFrame = cb => { const id = ++rafId; rafs.set(id, cb); return id; };
  W.cancelAnimationFrame = id => { rafs.delete(id); };
  W.setTimeout = (fn, ms, ...a) => { const id = ++timerId; timers.set(id, {at: t + Math.max(0, +ms || 0), fn, a}); return id; };
  W.setInterval = (fn, ms, ...a) => { const every = Math.max(4, +ms || 0), id = ++timerId; timers.set(id, {at: t + every, fn, a, every}); return id; };
  W.clearTimeout = W.clearInterval = id => { timers.delete(id); };
  M.play = function () { media.add(this); if (!step) return realPlay.call(this); this.__vPaused = false; realPause.call(this); return Promise.resolve(); };
  M.pause = function () { media.add(this); this.__vPaused = true; return realPause.call(this); };
  Object.defineProperty(M, 'paused', {configurable: true, get() { return step && this.__vPaused !== undefined ? this.__vPaused : pausedGet.call(this); }});
  const advance = dt => {
    t += dt;
    for (;;) {
      let next; for (const [id, timer] of timers) if (timer.at <= t && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break; const [id, timer] = next;
      if (timer.every) timer.at += timer.every; else timers.delete(id);
      try { typeof timer.fn === 'function' ? timer.fn(...timer.a) : 0; } catch (e) { console.error(e); }
    }
    const due = [...rafs.values()]; rafs.clear();
    for (const cb of due) { try { cb(t); } catch (e) { console.error(e); } }
  };
  let last = realNow();
  const free = () => { if (step) return; const now = realNow(); advance(now - last); last = now; realRaf(free); }; realRaf(free);
  W.__stepStart = () => { step = true; for (const el of media) { el.__vPaused = pausedGet.call(el); realPause.call(el); } };
  W.__stepFrame = async dt => {
    const seeks = [];
    for (const el of media) {
      if (el.__vPaused || !(el.duration > 0)) continue;
      let at = el.currentTime + dt / 1000 * (el.playbackRate || 1);
      if (at >= el.duration) { if (el.loop) at %= el.duration; else { at = el.duration; el.__vPaused = true; } }
      seeks.push(new Promise(done => { const end = () => done(); el.addEventListener('seeked', end, {once: true}); realTimeout(end, 400); el.currentTime = at; }));
    }
    await Promise.all(seeks);
    for (const a of document.getAnimations()) {
      if (!a.__virtual) { a.__virtual = true; a.pause(); }
      const end = a.effect?.getComputedTiming().endTime;
      const next = (a.currentTime ?? 0) + dt * (a.playbackRate || 1);
      a.currentTime = Number.isFinite(end) ? Math.min(next, end) : next;
      if (Number.isFinite(end) && next >= end) a.finish?.();
    }
    advance(dt);
    await new Promise(r => realRaf(() => realRaf(r)));
  };
  // Trailer cursor: a soft arrow that follows real mouse events, with a click ring.
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__trailer_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;pointer-events:none;z-index:2147483647;display:none;transform:translate(-4px,-2px);filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2 L4 19 L8.6 14.9 L11.7 21.6 L14.6 20.3 L11.6 13.8 L17.8 13.6 Z" fill="#fff8ec" stroke="#3a2418" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    W.__cursor = on => { c.style.display = on ? 'block' : 'none'; };
    addEventListener('mousedown', e => {
      if (c.style.display === 'none') return;
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid #ffd27a;pointer-events:none;z-index:2147483646`;
      document.documentElement.appendChild(r);
      r.animate([{transform: 'scale(.3)', opacity: 1}, {transform: 'scale(1.4)', opacity: 0}], {duration: 420, easing: 'ease-out'}).onfinish = () => r.remove();
    }, true);
  });
};

const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required']});
await mkdir(outDir, {recursive: true});
const results = [];

async function runStep(page, s) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.getByRole('button', {name: s.click, exact: s.exact ?? true}).nth(s.nth ?? 0).click({timeout: s.timeout ?? 15000});
  if (s.text) await page.getByText(s.text, {exact: s.exact ?? false}).nth(s.nth ?? 0).click({timeout: s.timeout ?? 15000});
  if (s.eval) await page.evaluate(s.eval);
  if (s.waitFor) await page.waitForFunction(s.waitFor, null, {timeout: s.timeout ?? 60000, polling: 250});
  if (s.after) await page.waitForTimeout(s.after);
}

for (const shot of shots) {
  const t0 = Date.now();
  const context = await browser.newContext({viewport: {width: 1280, height: 720}, deviceScaleFactor: Number(process.env.TRAILER_DSF ?? 1.5)});
  const storage = {...(spec.storage ?? {}), ...(shot.storage ?? {})};
  await context.addInitScript({content: `try{const s=${JSON.stringify(storage)};for(const k in s)localStorage.setItem(k,s[k]);}catch(e){}`});
  await context.addInitScript({content: `(${virtualTime})();`});
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  const frames = resolve(outDir, `${shot.id}.frames`);
  await rm(frames, {recursive: true, force: true}); await mkdir(frames, {recursive: true});
  let frame = 0;
  try {
    await page.goto(origin + (shot.url ?? spec.url));
    for (const s of shot.prep ?? []) await runStep(page, s);
    await page.waitForTimeout(shot.settle ?? 1500);
    await page.evaluate(() => window.__stepStart());
    // pre-roll frames (not recorded) let entrance animations start cleanly
    for (let i = 0; i < Math.round((shot.preroll ?? 0) * FPS); i++) await page.evaluate(dt => window.__stepFrame(dt), DT);
    const n = Math.round(shot.seconds * FPS);
    const events = [...(shot.during ?? [])].sort((a, b) => a.at - b.at);
    let mouse = shot.mouseStart ?? null, move = null;
    if (mouse) { await page.evaluate(() => window.__cursor(true)); await page.mouse.move(mouse[0], mouse[1]); }
    for (let i = 0; i < n; i++) {
      const now = i / FPS;
      while (events.length && events[0].at <= now + 1e-6) {
        const e = events.shift();
        if (e.tapBtn) {
          const box = await page.getByRole('button', {name: e.tapBtn, exact: e.exact ?? true}).nth(e.nth ?? 0).boundingBox().catch(() => null);
          if (box) {
            const c = [box.x + box.width / 2, box.y + box.height / 2];
            move = {from: mouse ?? [c[0] + 160, c[1] + 120], to: c, t0: now, dur: e.lead ?? .5};
            await page.evaluate(() => window.__cursor(true));
            events.push({at: now + (e.lead ?? .5) + .05, clickAt: c}); events.sort((a, b) => a.at - b.at);
          } else errors.push('tapBtn not found: ' + e.tapBtn);
        }
        if (e.move) { move = {from: mouse ?? e.move, to: e.move, t0: now, dur: e.dur ?? .5}; await page.evaluate(() => window.__cursor(true)); }
        if (e.clickAt) { await page.mouse.move(...e.clickAt); mouse = e.clickAt; await page.mouse.down(); await page.mouse.up(); }
        if (e.click) await page.getByRole('button', {name: e.click, exact: e.exact ?? true}).nth(e.nth ?? 0).click({timeout: 5000, noWaitAfter: true}).catch(err => errors.push('click ' + e.click + ': ' + err.message.split('\n')[0]));
        if (e.eval) await page.evaluate(e.eval).catch(err => errors.push('eval: ' + err.message.split('\n')[0]));
        if (e.hideCursor) await page.evaluate(() => window.__cursor(false));
      }
      if (move) {
        const k = Math.min(1, (now - move.t0) / move.dur), ease = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        mouse = [move.from[0] + (move.to[0] - move.from[0]) * ease, move.from[1] + (move.to[1] - move.from[1]) * ease];
        await page.mouse.move(mouse[0], mouse[1]);
        if (k >= 1) move = null;
      }
      await page.evaluate(dt => window.__stepFrame(dt), DT);
      const {data} = await cdp.send('Page.captureScreenshot', {format: 'jpeg', quality: 92});
      await writeFile(resolve(frames, `${String(frame++).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', resolve(frames, '%05d.jpg'),
      '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', resolve(outDir, `${shot.id}.mp4`)]);
    await copyFile(resolve(frames, `${String(Math.floor(frame / 2)).padStart(5, '0')}.jpg`), resolve(outDir, `${shot.id}.jpg`));
    await rm(frames, {recursive: true, force: true});
    results.push({id: shot.id, frames: frame, secs: ((Date.now() - t0) / 1000).toFixed(0), errors: errors.slice(0, 4)});
  } catch (err) {
    await page.screenshot({path: resolve(outDir, `${shot.id}.FAILED.jpg`)}).catch(() => {});
    results.push({id: shot.id, failed: err.message.split('\n')[0], errors: errors.slice(0, 4)});
  }
  console.log(JSON.stringify(results.at(-1)));
  await context.close();
}
await browser.close();
