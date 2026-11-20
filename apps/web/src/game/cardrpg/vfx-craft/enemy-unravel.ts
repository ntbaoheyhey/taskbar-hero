// Keep PaintDeath's existing particle source and time. Its source capture sets
// uDeathAmount to -1, which must also suspend this edge in the offscreen pass.
const fibres = `
  float stitch = 0.5 + 0.5*sin(vMapUv.y*183.0 + vMapUv.x*39.0 + 2.4*sin(vMapUv.x*73.0));
  rank = 0.78*rank + 0.15*enemyDepth + 0.07*stitch;
  float frontier = rank - (amount*1.10-0.05);
  float ember = (1.0-smoothstep(0.004,0.055,abs(frontier))) * smoothstep(0.0,0.055,amount);
  vec3 yarn = mix(vec3(0.64,0.13,0.15),vec3(1.0,0.62,0.22),stitch);
  diffuseColor.rgb = mix(diffuseColor.rgb,yarn,ember*0.74);
`;

/** Vary the existing rank once. Basic sequence and puppet materials have no
 * PaintDeath hook, so their ordinary opacity fade gets the same fibre front. */
export function unravelEnemyFragment(fragment: string) {
  const originalRank = 'float rank=paintRank(vDeathObject);';
  if (fragment.includes(originalRank)) {
    return fragment.replace(originalRank, originalRank + `
      #ifdef USE_MAP
      if (enemyUnravel >= 0.0) {
        float amount = uDeathAmount;
        ${fibres}
      }
      #endif
    `);
  }
  if (fragment.includes('uDeathAmount')) return fragment;
  return fragment.replace('#include <alphatest_fragment>', `
    #ifdef USE_MAP
    if (enemyUnravel > 0.0) {
      float amount = enemyUnravel;
      float weave = fract(sin(dot(floor(vMapUv*72.0),vec2(17.31,61.71)))*4317.51);
      float rank = 0.72*body.y + 0.28*weave;
      ${fibres}
      diffuseColor.a *= 1.0-smoothstep(rank-0.025,rank+0.025,amount*1.10-0.05);
    }
    #endif
    #include <alphatest_fragment>`);
}
