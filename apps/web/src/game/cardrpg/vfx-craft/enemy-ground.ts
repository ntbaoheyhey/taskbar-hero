import * as T from 'three';
import type { PaintLight } from './paint-light';

/** Shape the existing floor material. Actor, ring and floor draw counts stay fixed. */
export function groundEnemy(shadow: T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>, craft: PaintLight | undefined, boss: boolean) {
  if (craft) {
    // PaintLight already owns the contacts, projection, death source and floor
    // bounds for a drawn pose. Widen its footprint toward lower right using max
    // coverage so the two foot contacts never sum into a second dark puddle.
    const mesh = craft.ground.children.find((child): child is T.Mesh<T.PlaneGeometry,T.ShaderMaterial> =>
      child instanceof T.Mesh && child.material instanceof T.ShaderMaterial);
    if (!mesh) return;
    const mat = mesh.material;
    const previous = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.onBeforeCompile = function (shader, renderer) {
      previous.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('if(opacity<.001)discard;', `
        vec2 center = (uFeet.xy + uFeet.zw)*0.5;
        vec2 radius = max(uRadius,vec2(0.001));
        vec2 offset = (vWorld-center)/radius;
        offset.x -= ${boss ? '1.65' : '0.70'};
        offset.y += ${boss ? '1.12' : '0.48'};
        offset.x += offset.y*0.70;
        offset /= vec2(${boss ? '3.45,1.56' : '2.10,1.04'});
        opacity=max(opacity,exp(-dot(offset,offset))*uOpacity*${boss ? '0.38' : '0.30'});
        if(opacity<.001)discard;`);
    };
    mat.customProgramCacheKey = () => key + '|enemy-contact-' + Number(boss);
    mat.needsUpdate = true;
    return;
  }
  const mat = shadow.material, previous = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      vec2 ground = vMapUv - vec2(0.56,0.46);
      vec2 contact = ground / vec2(0.225,0.215);
      vec2 castOffset = (ground - vec2(0.13,-0.10)) / vec2(0.255,0.235);
      castOffset.x += 0.35*castOffset.y;
      float cover = 0.44*exp(-dot(contact,contact)*2.0);
      ${boss ? 'cover=max(cover,0.32*exp(-dot(castOffset,castOffset)*2.0));' : ''}
      float border = min(min(vMapUv.x,1.0-vMapUv.x),min(vMapUv.y,1.0-vMapUv.y));
      diffuseColor.a = max(diffuseColor.a,opacity*cover*smoothstep(0.0,0.08,border));
      diffuseColor.rgb = min(diffuseColor.rgb,vec3(0.035,0.021,0.039));`);
  };
  mat.customProgramCacheKey = () => key + '|enemy-ground-' + Number(boss);
  mat.needsUpdate = true;
}
