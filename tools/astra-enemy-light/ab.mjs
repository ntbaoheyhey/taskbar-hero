import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const phase = process.argv[2] ?? 'A';
const root = resolve('reports/astra-enemy-light');
const dir = resolve(root, 'blind-' + phase);
const out = resolve('docs/astra-enemy-light-2026-11-21', 'blind-' + phase);
const read = async p => JSON.parse(await readFile(p, 'utf8'));
const ids = ['button-guard','sock-skipper','spool-ram','needle-moth','teacup-healer','kettle-knight',
  'yarn-giant-phase2','binding-thread','pollen-scout','rain-spool','crumb-sentinel','pantry-crown-phase2'];
const keyPath = resolve(dir, 'key.json'), picksPath = resolve(out, 'picks.json');
if (process.argv.includes('--reveal')) {
  const key = await read(keyPath), picks = await read(picksPath);
  assert.equal(picks.length,ids.length);
  const rows = key.map(({ id, after }, i) => {
    const { side, reason } = picks[i];
    assert(['L','R'].includes(side) && reason);
    return { id, after, side, reason, win: side === after };
  });
  const wins = rows.filter(r => r.win).length;
  await writeFile(resolve(out,'result.json'), JSON.stringify({ phase,wins,total:ids.length,rows },null,2)+'\n');
  console.log(phase, wins + '/' + ids.length);
} else {
  await mkdir(dir, { recursive:true }); await mkdir(out, { recursive:true });
  const reproduce = process.argv.includes('--reproduce');
  const key = reproduce ? (await read(resolve(out,'result.json'))).rows.map(({id,after})=>({id,after})) :
    ids.map(id => ({ id, after: randomInt(2) ? 'L' : 'R' }));
  // Exclusive creation keeps the first assignment and prevents a post-judgment reshuffle.
  if (!reproduce) await writeFile(keyPath, JSON.stringify(key), { flag:'wx' });
  for (let group = 0; group < 3; group++) {
    const layers = [];
    for (let j = 0; j < 4; j++) {
      const { id,after } = key[4*group+j], src = resolve(root, 'phase-' + phase, 'dpr-2',id);
      const meta = await read(resolve(src,'before.json')), b = meta.actors[meta.id].bounds, k = meta.width/meta.cssWidth;
      const left = Math.max(0,Math.floor((b.x-24)*k)), top = Math.max(0,Math.floor((b.y-12)*k));
      const width = Math.min(meta.width-left,Math.ceil((b.width+48)*k)), height = Math.min(meta.height-top,Math.ceil((b.height+40)*k));
      for (const [column,side] of ['L','R'].entries()) {
        const condition = after === side ? 'after' : 'before';
        const input = await sharp(resolve(src, condition+'-frame.png')).extract({ left,top,width,height })
          .resize(484,222,{ fit:'contain',background:'#282528' }).png().toBuffer();
        layers.push({ input,left:column*492+4,top:j*250+22 });
      }
      const label = Buffer.from('<svg width="980" height="20"><text x="12" y="15" fill="#eee" font-size="14" font-family="sans-serif">'+(4*group+j+1)+'  '+id+'</text></svg>');
      layers.push({ input:label,left:0,top:j*250 });
    }
    const path = resolve(out,'group-'+(group+1)+'.webp');
    await sharp({ create:{width:984,height:1000,channels:3,background:'#282528'} }).composite(layers).webp({quality:86}).toFile(path);
    const size = await sharp(path).metadata();
    assert(Math.max(size.width,size.height) <= 1024);
    console.log('Blind group',group+1,size.width,size.height);
  }
}
