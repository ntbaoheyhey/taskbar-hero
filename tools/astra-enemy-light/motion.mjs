import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { launch,openRoute,makeBattle,setBattle,freeze } from './fixture.mjs';

const phase = process.argv[2] ?? 'B';
const path = 'docs/astra-enemy-light-2026-11-21/motion';
await mkdir(path,{recursive:true});
const browser = await launch(), rows = [];
try {
  const page = await openRoute(browser,{dpr:2});
  async function record(id, name) {
    const { png, box, scale, size, ...row } = await page.evaluate(id => {
      const s=window.__depthScene, e=[...s.actors.values()].find(e=>e.asset===id);
      const node=[];e.actor.root.traverseVisible(n=>{if(n.isMesh)node.push(n);});
      const u=s.renderer.properties.get(node[0].material).uniforms;
      return { id, png:s.renderer.domElement.toDataURL(), box:s.bounds(e), scale:s.renderer.getPixelRatio(),
        size:[s.renderer.domElement.width,s.renderer.domElement.height], motion:u.enemyMotion.value.toArray(),
        colour:u.enemyHitColour.value.toArray(), rim:u.enemyRim.value.getHexString(), normal:u.enemyBaked.value,
        pose:e.craftPose?.drawing.key, death:u.uDeathAmount?.value, visible:e.actor.root.visible };
    },id);
    const left=Math.max(0,Math.floor((box.x-15)*scale)),top=Math.max(0,Math.floor((box.y-12)*scale));
    const width=Math.min(size[0]-left,Math.ceil((box.width+32)*scale)),height=Math.min(size[1]-top,Math.ceil((box.height+36)*scale));
    const file=name+'.webp';
    const pixels=await sharp(Buffer.from(png.split(',')[1],'base64')).extract({left,top,width,height}).resize({width:560,height:520,fit:'inside'}).webp({quality:83}).toBuffer();
    assert(pixels.length<600000); await writeFile(path+'/'+file,pixels);
    rows.push({name,...row});page.check();return row;
  }
  await setBattle(page,makeBattle(['button-guard'],1));
  await freeze(page);
  const action=await page.evaluate(async()=>{
    const m=window.__depthReview;
    for(let i=0;i<30;i++){
      while(m.plan)m.finishMoment();
      m.paused=false;m.step();m.paused=true;m.notify(false);
      const plan=m.plan,event=plan?.events.find(e=>e.type==='damage'&&e.amount>0&&e.targetIds.some(id=>m.battle.actors.find(a=>a.id===id)?.catalogId==='button-guard'));
      if(event)return {actor:event.actorId,contact:plan.beats[2].start,skill:plan.skillId};
      await new Promise(r=>requestAnimationFrame(r));
    }
    throw Error('Could not find a legal hit');
  });
  for(const [age,reduced] of [[20,false],[90,false],[165,false],[20,true]]) {
    await page.evaluate(({ms,reduced})=>{
      const m=window.__depthReview,s=window.__depthScene;
      m.animationAt=ms;s.render({...s.view(),frame:m.frame,fixedTime:12+ms/1000,paused:true,reducedMotion:reduced},0);
    },{ms:action.contact+age,reduced});
    const row=await record('button-guard','impact-'+age+(reduced?'-reduced':''));
    assert.equal(row.motion[1]>0,!reduced&&age<160);
    if(!reduced&&age<160)assert.equal(row.motion[2],-1);
  }
  await setBattle(page,makeBattle(['yarn-giant'],1));await freeze(page);
  for(const [name,settings] of [['arrival',{landing:.37}],['phase-two',{phase:2}],['reduced-arrival',{landing:.37,reduced:true}]]) {
    await freeze(page,settings);const row=await record('yarn-giant',name);
    if(name==='arrival')assert(Math.abs(row.motion[3]-.5)<.01);
    if(name==='reduced-arrival')assert.deepEqual(row.motion,[1,0,-1,-1]);
  }
  if(phase==='C') {
    for(const [id,chapter] of [['yarn-giant',1],['rain-spool',2]]) {
      await setBattle(page,makeBattle([id],chapter));await freeze(page);
      for(const death of [.10,.30,.50]) {
        await freeze(page,{death});const row=await record(id,id+'-death-'+Math.round(death*1000));
        assert(row.death>0&&row.death<1);
      }
    }
  }
  await writeFile('reports/astra-enemy-light/motion-'+phase+'.json',JSON.stringify({action,rows},null,2)+'\n');
  console.log(action,rows.map(row=>row.name));
} finally { await browser.close(); }
