# Campaign renderer at 1710e1bc4

Chromium ran the full campaign at ?demo=1&squad=1&cardrpg2=1&a6=1 with the unchanged A6 factory and the four-cat C2 team. The learn script mounted each enemy, waited for scene readiness and inspected visible meshes at 12.000 scene seconds. All 13 catalog IDs matched the order.

| Enemy | Actor / visible path | Material | Visible colour under /units/<id>/ | Depth UV | Mask IoU |
|---|---|---|---|---|---:|
| button-guard | template / template | MeshBasicMaterial | rig-depth.half.webp | ALIGNED | 1.000 |
| sock-skipper | template / template | MeshBasicMaterial | rig-depth.half.webp | ALIGNED | 0.999 |
| spool-ram | template / template | MeshBasicMaterial | rig-depth.half.avif | ALIGNED | 1.000 |
| needle-moth | template / drawn | MeshBasicMaterial | poses/K0.avif | MISALIGNED | 0.000 |
| teacup-healer | template / drawn | MeshBasicMaterial | poses/K0.avif | MISALIGNED | 0.030 |
| kettle-knight | template / template | MeshBasicMaterial | rig-depth.half.avif | ALIGNED | 1.000 |
| yarn-giant | template / drawn | MeshBasicMaterial | poses/K0.avif | MISALIGNED | 0.046 |
| binding-thread | template / drawn | MeshBasicMaterial | poses/K0.avif | MISALIGNED | 0.001 |
| practice-cushion | template / template | MeshBasicMaterial | rig-depth.half.webp | ALIGNED | 1.000 |
| pollen-scout | template / template | MeshBasicMaterial | rig-depth.half.avif | ALIGNED | 1.000 |
| rain-spool | template / template | MeshBasicMaterial | rig-depth.half.webp | ALIGNED | 0.999 |
| crumb-sentinel | template / template | MeshBasicMaterial | rig-depth.half.avif | ALIGNED | 1.000 |
| pantry-crown | template / template | MeshBasicMaterial | rig-depth.half.webp | ALIGNED | 0.999 |

ALIGNED means the same packed islands at the same normalized UVs. The on-screen atlas is a half-resolution delivery. None of the thirteen rig-depth images is a height field. All contain the original coloured parts, including eyes and painted details. The four craft sets swap the complete drawing on one DrawingLayer. An atlas Sobel would interpret colour seams as geometry. The 50% overlays and visual verdicts are in docs/astra-enemy-light-2026-11-21/alignment; runtime.json and alignment.json preserve the measurements.

The campaign selects native CutoutMesh templates before the accepted skeleton/sequence/puppet fallbacks in assets.ts. DrawnPoses installs a DrawingLayer and hides native pages. Each material decodes painted sRGB, undoes any premultiplication and applies the existing saturation and contrast before output. A sequence changes plane.material.map. The puppet fallback has per-part basic materials. Neither was observed in normal campaign play.

SpineScene.ensureActors sets asset, lane, entered, hurtAt, koAt, phase and phaseAt. The render loop applies paintGrade, body tint, focus and healing, then pose/death timing, root motion and hurt flash. Boss phase arrives from view.bossPhases. PaintDeath wraps the original material and can temporarily suspend its dissolve while capturing the source for fragments. PaintLight renders visible craft art to an actor-sized target and projects the alpha onto the floor with two foot contacts. It hides the generic shadow and ring. Native actors keep the radial shadow mesh. BossArrival owns the landing timing; BossPhase owns the banner. The scene draws the phase-2 aura; post-fx uses its composer only on eligible actions.

The current stage-painting.ts has no arenaMood export. The battle view supplies chapter, boss, bossPhases and asset by actor ID. The judge path adds &ui=v3 and plays prerecorded legal choices. The campaign capture tool injects a battle from unchanged rules into the local review model, pauses it, seeks to fixedTime and waits for media presentation. The shader must follow actual screen facing, pose swaps, deterministic scene time and temporary death captures.
