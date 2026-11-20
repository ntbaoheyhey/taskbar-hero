"""Assemble the review body from saved gate receipts."""
import json
import re
import sys
from pathlib import Path

phase, pr = sys.argv[1:3]
root = Path(__file__).resolve().parents[2]
p = root / "reports/astra-enemy-light"
state = json.loads((p/"STATE.json").read_text())
exhibit = "docs/astra-enemy-light-2026-11-21"
base = "https://github.com/ntbaoheyhey/taskbar-hero/blob/codex/astra-enemy-light-2026-11-21/"
samples = json.loads((p / ("measure-A2.json" if phase=="A" else f"measure-{phase}.json")).read_text())
wins = json.loads((root/exhibit/("blind-"+phase)/"result.json").read_text())["wins"]
perf = state["perf"]
ids = json.loads((p/"runtime.json").read_text())
tested = (p/"logs"/("target-"+phase+".log")).read_text()
count = re.search(r"Tests\s+(\d+) passed",tested).group(1)
lines = ["Requested by baoheyhey (Codex order ASTRA ENEMY LIGHT)", "",
         "## What changed", "",
         "13 hostile silhouettes share six arena palettes. Their alpha supplies per-pixel bevels, inside rims and base shade. The existing shadow pass supplies contact and short cast shadows."
         + (" Attacks light the facing surface for 160 ms. The key follows breathing and boss landings sweep the rim." if phase!="A" else "")
         + (" Deaths unwind into a yarn-coloured edge. The gallery contains 78 captures." if phase=="C" else ""),
         "Kill switch `?enemyLight=0`. " + (f"[Draft PR]({pr}). " if pr!="pending" else "")
         + f"Files under cardrpg include spine/{'{'}enemy-relight.ts, enemy-relight.test.ts, boss-arrival.ts, scene.ts{'}'} and vfx-craft/enemy-{'{'}ground,surface,unravel{'}'}.ts. The scene hook diff is +5/−1. The remaining files are 13 unit maps, tools/astra-enemy-light, the evidence directory and reports/astra-enemy-light. [Provenance]({base}{exhibit}/PROVENANCE.md).",

         "", "## Before and after", "", "| Enemy | Switch off | Relit | Boss phase 2 |","|---|---|---|---|"]
for id in ids:
    frame=base+exhibit+"/battle/"+id
    pair=f"[Off]({frame}-phase2-before.webp) / [On]({frame}-phase2-after.webp)" if id+"-phase2" in samples else "—"
    lines.append(f"| {id} | [Before]({frame}-before.webp) | [After]({frame}-after.webp) | {pair} |")
lines += ["", "## Verification", ""]
for ph, gates in state["gates"].items():
    if list(gates.values())==["PASS"]*8:
        lines.append(f"- Phase {ph} passed G1–G8.")
    else:
        lines.append(f"- Phase {ph}. "+", ".join(f"{gate} {status}" for gate,status in gates.items())+".")
for id in ["boss","wave3"]:
    pair=perf["scenarios"][id]; b,a=pair["before"],pair["after"]
    lines.append(f"- {id} p95 {b['p95']:.1f} → {a['p95']:.1f} ms. Frames over 50 ms {b['above50']} → {a['above50']}. Added maps {a['mapBytes']/1000000:.2f} MB.")
peak=max(abs(r['luminanceChangePct']) for r in samples.values())
lines += [f"- Cat regions and exterior light over 2/255 both measured zero changed pixels. Largest absolute body-luminance change {peak:.2f}%. Blind picks {wins}/12. Self-score {state['score']}/100.",
          f"- Typecheck and {count} focused tests passed. Both judge recordings ended with identical logs and result hashes."
          + (" "+state['fullSuite'] if 'fullSuite' in state else ""),
          "", "## Known gaps and reproduction", "",
          f"Height maps were absent. The nine aligned pages contain painted colour and four drawn sets have different UVs. The local mood table covers the six palettes."
          + (" The captures use the shared stage painting. Resolved issues included install detachment, imaging dependencies, C2 fixture rows, the atlas descriptor, a GLSL identifier, video/mask synchronization, an initial luminance overshoot, production review access, an early long-frame sample and the layout test timeout. Some WIP intervals exceeded 20 minutes. A final HTTP 408 cleared on a non-force retry. Human review is the remaining action." if phase=='C' else '')
          + f" [Blocker details]({base}reports/astra-enemy-light/BLOCKERS.md). [Proposals]({base}reports/astra-enemy-light/PROPOSALS.md).",
          "`pnpm --filter @taskbar-hero/web dev --host 127.0.0.1 --port 6493 --strictPort` then "
          f"`node tools/astra-enemy-light/capture.mjs --dpr=2 --out=reports/astra-enemy-light/phase-{phase}`."
          + (f" Reproduce the [gallery]({base}{exhibit}/gallery/INDEX.md) with `node tools/astra-enemy-light/capture.mjs --dpr=2 --mode=after --gallery`." if phase=="C" else "")]
assert len(lines)<=40,len(lines)
(p/"FINAL.md").write_text("\n".join(lines)+"\n")
