import * as T from 'three';
import { describe, expect, it } from 'vitest';
import { ENEMY_LIGHT_BY_MOOD, enemyLightEnabled, enemyMood, receivesEnemyLight, updateEnemyLight, hitLightPulse } from './enemy-relight';
import { bossLandingSweep } from './boss-arrival';
import { enemyUniforms, patchEnemySurface } from '../vfx-craft/enemy-surface';
import { SPINE_UNIT_BY_ID } from './config';
import { enemyIdleLife } from './enemy-life';
import { usePaintedAtlasColor } from '../../rig/atlas-color';

describe('painted enemy lighting', () => {
  it('defaults on and recognizes the explicit off query among campaign flags', () => {
    expect(enemyLightEnabled('')).toBe(true);
    expect(enemyLightEnabled('?demo=1&enemyLight=0&a6=1')).toBe(false);
    expect(enemyLightEnabled('?enemyLight=1')).toBe(true);
  });
  it('resolves chapter, boss fallback and boss identity in mixed encounters', () => {
    expect([1,2,3].map(c => enemyMood(c))).toEqual(['garden','rain','pantry']);
    expect([1,2,3].map(c => enemyMood(c,true))).toEqual(['tangle','storm','crown']);
    expect(enemyMood(3,true,'yarn-giant')).toBe('tangle');
    expect(enemyMood(1,true,'rain-spool')).toBe('storm');
    expect(enemyMood(1,true,'pantry-crown')).toBe('crown');
    for (const palette of Object.values(ENEMY_LIGHT_BY_MOOD)) {
      for (const colour of Object.values(palette)) expect(colour).toMatch(/^#[a-f0-9]{6}$/);
    }
  });
  it('rejects both a cat on the hostile side and a hostile asset on the party side before touching materials', () => {
    const cat = SPINE_UNIT_BY_ID.get('mochi')!, hostile = SPINE_UNIT_BY_ID.get('button-guard')!;
    expect(receivesEnemyLight('enemy',cat)).toBe(false);
    expect(receivesEnemyLight('party',hostile)).toBe(false);
    expect(receivesEnemyLight('enemy',hostile)).toBe(true);
    const actor = { unit: cat, get root() { throw Error('cat traversed'); } };
    expect(updateEnemyLight({ actor } as never, {} as never, { side:'enemy' } as never, {} as never, 5, 1)).toBe(false);
  });
  it('binds independent uniforms and retains the atlas decode and grade', () => {
    const u = enemyUniforms(), other = enemyUniforms(), material = new T.MeshBasicMaterial();
    u.enemyTile.value.x = 0.5;
    expect(other.enemyTile.value.x).toBe(0);
    expect(u.enemyBaked.value).toBe(0);
    usePaintedAtlasColor(material,true);
    patchEnemySurface(material,u);
    const shader = { vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>', uniforms: {} };
    material.onBeforeCompile(shader as never, {} as never);
    expect(shader.uniforms).toMatchObject({ enemyBox: u.enemyBox, enemyNormal: u.enemyNormal });
    expect(shader.fragmentShader).toContain('sampledDiffuseColor.rgb /=');
    expect(shader.fragmentShader).toContain('paintGrade.x');
    expect(material.customProgramCacheKey()).toContain('pma');
    expect(shader.fragmentShader).not.toMatch(/diffuseColor\.a\s*=/);
  });
  it('reproduces identical samples after seeking away and back', () => {
    const sample = () => enemyIdleLife('yarn-giant',5.43,1,720,false);
    const first = sample();
    enemyIdleLife('yarn-giant',19,1,720,false);
    expect(sample()).toEqual(first);
    expect(hitLightPulse(.08,false)).toBe(.5);
    expect(hitLightPulse(.16,false)).toBe(0);
    expect(hitLightPulse(.01,true)).toBe(0);
    expect(bossLandingSweep(370,false)).toBe(.5);
    expect(bossLandingSweep(370,true)).toBe(-1);
    expect(bossLandingSweep(501,false)).toBe(-1);
  });
});
