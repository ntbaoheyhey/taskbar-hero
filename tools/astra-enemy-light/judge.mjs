import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { launch, openRoute } from './fixture.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const browser = await launch(), evidence = {};
try {
  for (const off of [true, false]) {
    const page = await openRoute(browser, { off, judge: true });
    const rows = [];
    for (const button of ['Guard the café', 'Face the Yarn Giant']) {
      await page.getByRole('button', { name: button, exact: true }).click();
      await page.waitForFunction(() => window.__depthScene?.ready && window.__depthReview?.sceneReady);
      const final = await page.evaluate(async () => {
        const m = window.__depthReview, replay = m.replay, s = window.__depthScene;
        let step = 0;
        while (!replay.result && ++step < 200) {
          if (m.plan) m.finishMoment();
          else if (m.canAct) m.replayStep();
          await new Promise(r => requestAnimationFrame(r));
          if (s.ready && m.showBattle) s.render({ ...s.view(), fixedTime: 15 + step / 10 }, 0);
        }
        if (!replay.result) throw Error('Recorded choices did not resolve');
        const final = structuredClone(replay);
        while (m.plan) m.finishMoment();
        if (m.showBattle) m.showResult();
        return final;
      });
      assert.equal(final.result, 'party');
      rows.push({ battle: button, result: final.result, rounds: final.round, choices: final.choices.length,
        events: final.log.length, logSha256: hash(final.log), resultSha256: hash(final) });
    }
    page.check();
    evidence[off ? 'off' : 'on'] = rows;
    await page.close();
  }
  assert.deepEqual(evidence.off, evidence.on);
  await writeFile(process.argv[2] ?? 'reports/astra-enemy-light/judge.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(evidence.on);
} finally { await browser.close(); }
