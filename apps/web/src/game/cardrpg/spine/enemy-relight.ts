import * as T from 'three';
import type { SpineActor } from './assets';
import type { TurnActor } from '@taskbar-hero/game-rules/src/squad/turn/types';
import { hitColor } from './enemy-life';
import { bossLandingSweep } from './boss-arrival';
import type { SceneView } from '../../squad/turn3d/scene';
import type { PaintLight } from '../vfx-craft/paint-light';
import { enemyUniforms, patchEnemySurface, type EnemyUniforms } from '../vfx-craft/enemy-surface';
import { groundEnemy } from '../vfx-craft/enemy-ground';

export const ENEMY_LIGHT_BY_MOOD = {
  garden: { key: '#ffcb84', rim: '#b5acff', fill: '#a7a2bb' },
  rain:   { key: '#c7dded', rim: '#d4edff', fill: '#8195b3' },
  pantry: { key: '#ffbf72', rim: '#dac2c9', fill: '#ac826b' },
  tangle: { key: '#f3b5ce', rim: '#bda1ff', fill: '#b798ba' },
  storm:  { key: '#bad4f2', rim: '#a7e6ff', fill: '#8d9bb9' },
  crown:  { key: '#ffdc8a', rim: '#ffcc90', fill: '#ad8c78' },
} as const;
export type EnemyMood = keyof typeof ENEMY_LIGHT_BY_MOOD;

export function enemyLightEnabled(search: string) {
  return new URLSearchParams(search).get('enemyLight') !== '0';
}
export function enemyMood(chapter = 1, boss = false, bossAsset?: string): EnemyMood {
  if (boss) {
    if (bossAsset === 'yarn-giant') return 'tangle';
    if (bossAsset === 'rain-spool') return 'storm';
    if (bossAsset === 'pantry-crown') return 'crown';
    return chapter === 3 ? 'crown' : chapter === 2 ? 'storm' : 'tangle';
  }
  return chapter === 3 ? 'pantry' : chapter === 2 ? 'rain' : 'garden';
}
export function receivesEnemyLight(side: string, unit: SpineActor['unit']) {
  return side === 'enemy' && unit.side === 'enemy' && unit.tier !== 'cat';
}

interface LightEntry {
  asset: string;
  actor: SpineActor;
  hurtAt: number;
  koAt: number;
  entered: number;
  phase: number;
  craftLight?: PaintLight;
  shadow: T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;
}
interface SharedMap {
  texture: T.Texture;
  ready: boolean;
  listeners: Set<() => void>;
}
const maps = new Map<string,SharedMap>();
function acquireMap(asset: string, repaint: () => void) {
  let item = maps.get(asset);
  if (!item) {
    const listeners = new Set<() => void>();
    const texture = new T.TextureLoader().load('/units/' + asset + '/relight-normal.webp', () => {
      shared.ready = true;
      for (const notify of listeners) notify();
    }, undefined, () => { /* Alternate or absent deliveries keep the alpha sampler. */ });
    texture.name = asset + ' enemy bevel';
    texture.colorSpace = T.NoColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = T.LinearFilter;
    const shared: SharedMap = { texture, ready: false, listeners };
    maps.set(asset, shared);
    item = shared;
  }
  item.listeners.add(repaint);
  return item;
}

interface ActorLight {
  uniforms: EnemyUniforms;
  map?: SharedMap;
  mood?: EnemyMood;
  hot?: boolean;
}
const lights = new WeakMap<SpineActor,ActorLight | null>();
const slots = { K0: 0, K1: 1, K2: 2, K4: 3, K5: 4 } as const;

function install(entry: LightEntry, renderer: T.WebGLRenderer, repaint: () => void): ActorLight | null {
  if (!enemyLightEnabled(typeof location === 'undefined' ? '' : location.search) ||
      !renderer.capabilities.isWebGL2 || renderer.capabilities.maxTextures < 4) return null;
  const { actor, asset } = entry, uniforms = enemyUniforms();
  const drawing = actor.mesh?.drawing;
  const native = actor.source === 'template' && actor.mesh?.data.pages[0]?.name === 'rig-depth.png';
  const map = drawing || native ? acquireMap(asset, repaint) : undefined;
  if (map) uniforms.enemyNormal.value = map.texture;
  let patched = false;
  actor.root.traverse(node => {
    if (!(node instanceof T.Mesh) || !(node.material instanceof T.MeshBasicMaterial) || !node.material.map) return;
    // A drawn actor's deferred native page has independent UVs and no decoded pixels.
    if (drawing && node !== drawing) return;
    patchEnemySurface(node.material, uniforms);
    patched = true;
  });
  if (map) {
    entry.shadow.material.addEventListener('dispose', () => {
      map.listeners.delete(repaint);
      if (!map.listeners.size) { maps.delete(asset); map.texture.dispose(); }
    });
  }
  if (!patched) return null;
  groundEnemy(entry.shadow, entry.craftLight, actor.unit.tier === 'boss');
  return { uniforms, map };
}

export function hitLightPulse(age: number, reduced: boolean) {
  if (reduced || age < 0 || age >= 0.16) return 0;
  const t = age / 0.16;
  return 1 - t*t*(3-2*t);
}

interface LightScene {
  renderer: T.WebGLRenderer;
  actors: ReadonlyMap<string,{ actor: SpineActor }>;
  invalidate(): void;
}
const hotRim = new T.Color('#ff7946');

/** Called after deformation and world bounds, before any paint/mask capture. */
export function updateEnemyLight(entry: LightEntry, view: SceneView, unit: TurnActor, scene: LightScene,
                                 time: number, breathScale: number, damageAge?: number) {
  const { actor } = entry;
  if (!receivesEnemyLight(unit.side, actor.unit)) return false;
  let light = lights.get(actor);
  if (light === undefined) {
    light = install(entry, scene.renderer, () => scene.invalidate());
    lights.set(actor, light);
  }
  if (!light) return false;
  const u = light.uniforms, box = actor.opaqueWorld;
  if (box) u.enemyBox.value.set(box.x, box.y, 1/Math.max(1,box.width), 1/Math.max(1,box.height));
  const drawing = actor.mesh?.drawing;
  const key = drawing?.key;
  const slot = key && key in slots ? slots[key as keyof typeof slots] : undefined;
  if (slot !== undefined) u.enemyTile.value.set(slot%3/3, (1-Math.floor(slot/3))/2, 1/3, 1/2);
  u.enemyBaked.value = light.map?.ready && (!drawing || slot !== undefined) ? 1 : 0;
  const bossId = view.boss && Object.keys(view.bossPhases ?? {})[0];
  const mood = enemyMood(view.chapter, view.boss, bossId ? view.models?.[bossId] : undefined);
  const boss = actor.unit.tier === 'boss', hot = boss && entry.phase > 1 && unit.hp > 0;
  if (mood !== light.mood || hot !== light.hot) {
    const palette = ENEMY_LIGHT_BY_MOOD[mood];
    u.enemyKey.value.set(palette.key); u.enemyFill.value.set(palette.fill); u.enemyRim.value.set(palette.rim);
    if (hot) u.enemyRim.value.lerp(hotRim, 0.86);
    u.enemyRimPower.value = hot ? 2.15 : boss ? 1.5 : 1;
    light.mood = mood; light.hot = hot;
  }
  const reduced = !!view.reducedMotion;
  u.enemyUnravel.value = unit.hp <= 0 && !reduced ? Math.min(1,Math.max(0,(time-entry.koAt)/0.6)) : -1;
  const pulse = unit.hp > 0 ? hitLightPulse(damageAge ?? (time-entry.hurtAt), reduced) : 0;
  let direction = -1;
  if (pulse > 0) {
    const plan = view.frame?.plan;
    const event = plan?.events.find(e => e.type === 'damage' && e.amount > 0 && e.targetIds.includes(unit.id));
    const sourceId = event?.actorId ?? plan?.actorId;
    const source = sourceId ? scene.actors.get(sourceId)?.actor : undefined;
    if (source) direction = source.root.position.x < actor.root.position.x ? -1 : 1;
    u.enemyHitColour.value.setRGB(...hitColor(source?.unit.id));
  }
  const landing = boss && unit.hp > 0 && !view.model && !view.galleryPreview
    ? bossLandingSweep((time-entry.entered)*1000, reduced) : -1;
  u.enemyMotion.value.set(reduced ? 1 : 1+(breathScale-1)*0.15, pulse, direction, landing);
  return pulse > 0;
}
