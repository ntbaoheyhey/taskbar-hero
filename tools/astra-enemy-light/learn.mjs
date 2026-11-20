import { writeFile } from 'node:fs/promises';
import { launch, openRoute, makeBattle, setBattle, freeze, inspectActors, rules } from './fixture.mjs';

const browser = await launch();
try {
  const page = await openRoute(browser, { off: true }), inventory = {};
  for (let i = 0; i < rules.ENEMIES.length; i += 3) {
    const group = rules.ENEMIES.slice(i, i + 3);
    await setBattle(page, makeBattle(group.map(e => e.id), group[0].chapter));
    await freeze(page);
    const actors = await page.evaluate(inspectActors);
    for (const e of group) {
      if (!actors[e.id]?.meshes.length) throw Error('Missing actor or texture for ' + e.id);
      inventory[e.id] = { ...actors[e.id], chapter: e.chapter };
      console.log(e.id, actors[e.id].path, actors[e.id].meshes.map(m => m.texture));
    }
  }
  await writeFile('reports/astra-enemy-light/runtime.json', JSON.stringify(inventory, null, 2) + '\n');
} finally { await browser.close(); }
