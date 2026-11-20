import assert from 'node:assert/strict';
import { chromium } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { loadRules } from '../cardrpg-big/a4-load.mjs';

export const origin = process.env.ENEMY_LIGHT_ORIGIN ?? 'http://127.0.0.1:6493';
const modules = await loadRules();
export const rules = await modules.load('packages/game-rules/src/cardrpg/depth/index.ts');
await modules.vite.close();

export function launch() {
  return chromium.launch({
    headless: true, channel: 'chromium',
    args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
  });
}

export async function openRoute(browser, { off = false, judge = false, dpr = 1 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  page.on('console', msg => {
    if (/THREE.WebGLProgram: Shader Error|GL_INVALID_OPERATION/i.test(msg.text())) faults.push(msg.text());
  });
  await page.addInitScript(() => localStorage.setItem('lantern.coach.v3', JSON.stringify({ disabled: true })));
  const query = '?demo=1&squad=1&cardrpg2=1&a6=1' + (judge ? '&ui=v3' : '') + (off ? '&enemyLight=0' : '');
  // Production campaign builds expose the review model during the explicit dev visit.
  const url = origin + '/' + query;
  await page.goto(url + (process.env.ENEMY_LIGHT_PRODUCTION === '1' && !judge ? '&dev=1' : ''));
  await page.waitForFunction(() => window.__depthReview || [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Play free'), null, { timeout: 90000 });
  if (!await page.evaluate(() => !!window.__depthReview)) await page.getByRole('button', { name: 'Play free', exact: true }).click();
  await page.waitForFunction(() => !!window.__depthReview, null, { timeout: 90000 });
  await page.evaluate(url => history.replaceState(null, '', url), url);
  const skip = page.getByRole('button', { name:'Skip story', exact:true });
  if (await skip.isVisible()) await skip.click();
  page.check = () => assert.deepEqual(faults, []);
  return page;
}

export function makeBattle(enemies, chapter) {
  const R = rules;
  const state = R.setFormationC2(R.setGameplayA6(R.createDepthAccount(71), true));
  state.tutorial = 4;
  // Use the campaign's legal four-companion, two-row starter formation.
  for (const card of state.account.cards) {
    card.level = 6;
    state.skills[card.cardId] = R.CAT_BY_ID[card.cardId].skills.map(s => s.id);
  }
  Object.assign(state.settings, { speed: 1, quality: 'high', reducedMotion: false });
  const battle = R.createBattle({ seed: 71, chapter, enemies, cats: R.battleCats(state),
    gameplayV4: true, skillsV5: true, gameplayA6: true, formationC2: true });
  battle.v4.committed = true;
  return { state, battle };
}

export async function setBattle(page, fixture) {
  await page.evaluate(() => {
    const m = window.__depthReview;
    Object.assign(m, { sceneStarted: false, watching: false, tutorialBattle: null, screen: 'hub' });
    m.notify(false);
  });
  await page.waitForFunction(() => !window.__depthScene);
  await page.evaluate(({ state, battle }) => {
    const m = window.__depthReview;
    Object.assign(m, { state, tutorialBattle: battle, galleryBattle: null, replay: null, plan: null,
      roundPlan: null, watching: true, paused: true, sceneStarted: true, screen: 'map',
      beforeImpact: null, afterImpact: null, animationAt: 0 });
    m.notify(false);
  }, fixture);
  await page.waitForFunction(() => {
    const m = window.__depthReview, s = window.__depthScene;
    if (m.sceneError) throw Error(m.sceneError);
    return s?.ready && m.sceneReady && s.stage.audit().source === 'painted' && s.actors.size === m.battle.actors.length;
  }, null, { timeout: 90000 });
  page.check();
}

export async function freeze(page, options = {}) {
  await page.evaluate(async ({ time = 12, phase = 1, mood, hit, death, landing, reduced = false }) => {
    const m = window.__depthReview, s = window.__depthScene;
    cancelAnimationFrame(s.raf);
    m.paused = true;
    const view = { ...s.view(), fixedTime: time, paused: true, frame: null, reducedMotion: reduced };
    if (mood) Object.assign(view, mood);
    view.bossPhases = Object.fromEntries(Object.keys(view.bossPhases).map(id => [id, phase]));
    for (const [id, e] of s.actors) {
      e.entered = landing === undefined ? 0 : time - landing;
      e.entranceDone = true;
      const media = e.actor.designerMedia?.media;
      if (media?.hold && !media.isHeld) media.hold(24);
      e.hurtAt = hit === undefined ? -100 : time - hit;
      e.phase = phase;
      if (death !== undefined && e.actor.unit.side !== 'party' && view.actors.find(a => a.id === id)?.side === 'enemy') {
        view.actors = view.actors.map(a => a.id === id ? { ...a, hp: 0 } : a);
        e.koAt = time - death;
      }
    }
    const draw = () => s.render(view, 0);
    draw();
    await Promise.all([...s.actors.values()].map(async e => {
      const video = e.actor.designerMedia?.media?.video;
      if (!video) return;
      video.pause();
      if (video.seeking) await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
    }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    draw();
  }, options);
  page.check();
}

export function inspectActors() {
  const s = window.__depthScene, result = {};
  for (const [id, e] of s.actors) {
    const meshes = [];
    e.actor.root.traverseVisible(node => {
      if (!node.isMesh) return;
      const mat = node.material, tex = mat.map, img = tex?.image;
      meshes.push({ name: node.name, material: mat.type, texture: img?.currentSrc || img?.src || img?.tagName || null,
        width: img?.width, height: img?.height, flipY: tex?.flipY,
        normalReady: s.renderer.properties.get(mat).uniforms?.enemyBaked?.value,
        keyColour: s.renderer.properties.get(mat).uniforms?.enemyKey?.value?.getHexString() });
    });
    result[e.asset] = { id, source: e.actor.source, path: e.craftPose ? 'drawn' : e.actor.source,
      meshes, pose: e.craftPose?.drawing.key, bounds: s.bounds(e), tier: e.actor.unit.tier };
  }
  return result;
}
