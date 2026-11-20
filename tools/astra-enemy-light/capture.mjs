import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { launch, openRoute, makeBattle, setBattle, freeze, inspectActors, rules } from './fixture.mjs';

const args = new URLSearchParams(process.argv.slice(2).map(arg => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? '1'];
}));
const mode = args.get('mode') ?? 'both';
const dpr = Number(args.get('dpr') ?? 2);
const raw = resolve(args.get('out') ?? 'reports/astra-enemy-light/raw', 'dpr-' + dpr);
const selected = args.get('ids')?.split(',') ?? rules.ENEMIES.map(e => e.id);
const gallery = args.has('gallery');
const output = resolve('docs/astra-enemy-light-2026-11-21');
const palette = ['garden', 'rain', 'pantry', 'tangle', 'storm', 'crown'];
const bosses = ['yarn-giant', 'rain-spool', 'pantry-crown'];
const decode = url => Buffer.from(url.split(',')[1], 'base64');
const browser = await launch();

async function capture(page, id, label, condition, settings, evidence) {
  await freeze(page, settings);
  const file = label + '-' + condition, dir = resolve(raw, label);
  await mkdir(dir, { recursive: true });
  const actors = await page.evaluate(inspectActors);
  const result = await page.evaluate(({ id, gallery }) => {
    const s = window.__depthScene, r = s.renderer, canvas = r.domElement;
    const entry = [...s.actors.values()].find(e => e.asset === id);
    const frame = canvas.toDataURL();
    if (gallery) return { frame, width: canvas.width, height: canvas.height, cssWidth: s.width, cssHeight: s.height };
    // Render the identical body on black and white. Their difference recovers
    // actual coverage including MSAA, translucent paint and overlapping parts.
    const old = r.getClearColor(entry.shadow.material.color.clone()), alpha = r.getClearAlpha();
    const bodyOn = colour => {
      r.setClearColor(colour, 1);
      r.clear();
      r.render(entry.actor.root, s.camera);
      return canvas.toDataURL();
    };
    let black, white, enemies;
    const autoClear = r.autoClear;
    try {
      black = bodyOn(0x000000); white = bodyOn(0xffffff);
      r.autoClear = false;
      const allOn = colour => {
        r.setClearColor(colour, 1); r.clear();
        for (const e of s.actors.values()) if (e.actor.unit.side === 'enemy') r.render(e.actor.root, s.camera);
        const flat = document.createElement('canvas'); flat.width = canvas.width; flat.height = canvas.height;
        const ctx = flat.getContext('2d'); ctx.drawImage(canvas, 0, 0);
        return ctx.getImageData(0, 0, flat.width, flat.height);
      };
      const low = allOn(0), high = allOn(0xffffff), mask = document.createElement('canvas');
      mask.width = canvas.width; mask.height = canvas.height;
      for (let i = 0; i < low.data.length; i += 4) {
        const covered = [0, 1, 2].some(c => low.data[i+c] !== 0 || high.data[i+c] !== 255);
        low.data[i] = low.data[i+1] = low.data[i+2] = covered ? 255 : 0;
      }
      mask.getContext('2d').putImageData(low, 0, 0); enemies = mask.toDataURL();
    }
    finally { r.autoClear = autoClear; r.setClearColor(old, alpha); r.render(s.scene, s.camera); }
    return { frame, black, white, enemies, width: canvas.width, height: canvas.height,
      cssWidth: s.width, cssHeight: s.height, textures: r.info.memory.textures };
  }, { id, gallery });
  const { frame, black, white, enemies, ...metadata } = result;
  if (!gallery) await Promise.all([['frame', frame], ['black', black], ['white', white], ['enemies', enemies]].map(
    ([key, image]) => writeFile(resolve(dir, condition + '-' + key + '.png'), decode(image))));
  await writeFile(resolve(dir, condition + '.json'), JSON.stringify({ id, label, settings, dpr, actors, ...metadata }, null, 2) + '\n');
  if (evidence) {
    // Preserve one complete 2x battlefield for each reviewed comparison.
    const path = resolve(output, gallery ? 'gallery' : 'battle');
    await mkdir(path, { recursive: true });
    let photograph;
    if (gallery) {
      const b = actors[id].bounds, k = metadata.width / metadata.cssWidth;
      const left = Math.max(0, Math.floor((b.x-18)*k)), top = Math.max(0, Math.floor((b.y-12)*k));
      const width = Math.min(metadata.width-left, Math.ceil((b.width+36)*k));
      const height = Math.min(metadata.height-top, Math.ceil((b.height+34)*k));
      photograph = sharp(decode(frame)).extract({ left, top, width, height }).resize({ width: 440, height: 420, fit: 'inside' });
    } else {
      // Include the live HUD and separate boss aura canvases in review screenshots.
      await freeze(page, settings);
      photograph = sharp(await page.screenshot({ animations: 'disabled' }));
    }
    const bytes = await photograph.webp({ quality: 75 }).toBuffer();
    assert(bytes.length <= 600000, 'Evidence exceeds 600 KB');
    await writeFile(resolve(path, file + '.webp'), bytes);
  }
  page.check();
  console.log(file, result.width + 'x' + result.height);
}

try {
  for (const condition of mode === 'both' ? ['before', 'after'] : [mode]) {
    assert(['before', 'after'].includes(condition));
    const page = await openRoute(browser, { off: condition === 'before', dpr });
    for (const id of selected) {
      const e = rules.ENEMY_BY_ID[id];
      assert(e, 'Unknown enemy ' + id);
      await setBattle(page, makeBattle([id], e.chapter));
      if (gallery) {
        for (const [i, mood] of palette.entries()) {
          const bossAsset = bosses[i - 3];
          const settings = { mood: { chapter: i % 3 + 1, boss: i >= 3,
            bossPhases: bossAsset ? { paletteBoss: 1 } : {},
            models: { ...await page.evaluate(() => window.__depthScene.view().models), paletteBoss: bossAsset } } };
          await capture(page, id, id + '-' + mood, condition, settings, dpr === 2);
        }
      } else {
        await capture(page, id, id, condition, {}, dpr === 2 && !args.has('local'));
        if (bosses.includes(id)) await capture(page, id, id + '-phase2', condition, { phase: 2 }, dpr === 2 && !args.has('local'));
      }
    }
    await page.close();
  }
} finally { await browser.close(); }
