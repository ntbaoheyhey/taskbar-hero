import * as T from 'three';
import { unravelEnemyFragment } from './enemy-unravel';

export function enemyUniforms() {
  return {
    enemyKey: { value: new T.Color() },
    enemyRim: { value: new T.Color() },
    enemyFill: { value: new T.Color() },
    enemyBox: { value: new T.Vector4(0, 0, 1, 1) },
    enemyTile: { value: new T.Vector4(0, 0, 1, 1) },
    enemyNormal: { value: null as T.Texture | null },
    enemyBaked: { value: 0 },
    enemyUnravel: { value: -1 },
    enemyRimPower: { value: 1 },
    enemyMotion: { value: new T.Vector4(1, 0, -1, -1) },
    enemyHitColour: { value: new T.Color() },
  };
}
export type EnemyUniforms = ReturnType<typeof enemyUniforms>;

const declarations = `
varying vec2 enemyWorld;
uniform vec3 enemyKey, enemyRim, enemyFill;
uniform vec4 enemyBox, enemyTile;
uniform sampler2D enemyNormal;
uniform float enemyBaked, enemyRimPower, enemyUnravel;
uniform vec4 enemyMotion;
uniform vec3 enemyHitColour;
`;

// R and G encode tangent-space normals. B is the interior distance, A is crease AO.
// Evaluate the tangent frame in screen space so mirrored or rotated UV islands
// always face the same lantern. Alpha and the original grade remain authoritative.
const shade = `
#ifdef USE_MAP
vec2 body = clamp((enemyWorld - enemyBox.xy) * enemyBox.zw, 0.0, 1.0);
vec2 ux = vec2(dFdx(vMapUv.x), dFdy(vMapUv.x));
vec2 vy = vec2(dFdx(vMapUv.y), dFdy(vMapUv.y));
vec2 du = dFdx(vMapUv), dv = dFdy(vMapUv);
// All body materials are transparent with depth writes off. Empty texels have no contribution.
if (diffuseColor.a <= 0.0) discard;
vec2 tilt;
float edge, crease, enemyDepth;
if (enemyBaked > 0.5) {
  vec4 relief = texture2D(enemyNormal, vMapUv * enemyTile.zw + enemyTile.xy);
  vec2 slope = relief.rg * 2.0 - 1.0;
  tilt = ux * inversesqrt(max(dot(ux, ux), 1e-15)) * slope.x
       + vy * inversesqrt(max(dot(vy, vy), 1e-15)) * slope.y;
  edge = 1.0 - smoothstep(0.04, 0.64, relief.b);
  crease = relief.a;
  enemyDepth = relief.b;
} else {
  // Alternate sequence/puppet UVs and failed deliveries use the current colour
  // map's alpha. These four taps point outward in physical screen coordinates.
  vec2 stepX = du * 4.0, stepY = dv * 4.0;
  tilt = vec2(texture2D(map, vMapUv-stepX).a - texture2D(map, vMapUv+stepX).a,
              texture2D(map, vMapUv-stepY).a - texture2D(map, vMapUv+stepY).a);
  edge = clamp(length(tilt), 0.0, 1.0);
  crease = 1.0;
  enemyDepth = 1.0-edge;
}
vec2 slope = tilt * 0.86 + (body - vec2(0.50, 0.48)) * vec2(1.05, 0.78);
vec3 normal = normalize(vec3(slope, max(0.28, 1.0 - 0.75*length(tilt))));
float incidence = dot(normal, vec3(-0.71, 0.56, 0.426));
float wrap = clamp(0.5 + 0.5*incidence, 0.0, 1.0);
float luma = dot(diffuseColor.rgb, vec3(0.2126,0.7152,0.0722));
float baseAO = mix(0.79, 1.0, smoothstep(0.01,0.25,body.y));
vec3 lit = diffuseColor.rgb * mix(0.55,1.32,wrap) * baseAO * crease;
lit *= mix(vec3(1.0), enemyFill, (1.0-wrap)*0.28);
lit += enemyKey * (0.11*luma) * wrap*wrap;
float rim = edge * smoothstep(0.02,0.84,dot(normal.xy,vec2(0.91,0.41)));
lit += enemyRim * rim * enemyRimPower * (0.012+0.50*luma);
float litLuma = dot(lit,vec3(0.2126,0.7152,0.0722));
diffuseColor.rgb = lit * min(1.0,1.28*luma/max(0.00001,litLuma)) * mix(1.0,enemyMotion.x,wrap);
if (enemyMotion.y > 0.0) {
  float facing = dot(normal,normalize(vec3(enemyMotion.z,0.16,0.36)));
  diffuseColor.rgb += enemyHitColour * enemyMotion.y * smoothstep(-0.18,0.91,facing) * (0.05+0.78*luma);
}
if (enemyMotion.w >= 0.0) {
  float band = 1.0 - smoothstep(0.04,0.25,abs(body.y-enemyMotion.w));
  diffuseColor.rgb += enemyRim * edge * band * sin(3.14159*enemyMotion.w) * (0.05+0.42*luma);
}
#endif
`;

export function patchEnemySurface(material: T.MeshBasicMaterial, uniforms: EnemyUniforms) {
  const previous = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 enemyWorld;\n' + shader.vertexShader.replace(
      '#include <project_vertex>', 'enemyWorld=(modelMatrix*vec4(transformed,1.)).xy;\n#include <project_vertex>');
    shader.fragmentShader = unravelEnemyFragment(declarations + shader.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\n' + shade));
  };
  material.customProgramCacheKey = () => cacheKey + '|enemy-bevel-v1';
  material.needsUpdate = true;
}
