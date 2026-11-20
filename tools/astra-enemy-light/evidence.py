"""Index the compact review exhibit and its exact source recipes."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/astra-enemy-light-2026-11-21"
REPORT = ROOT / "reports/astra-enemy-light"
rows = []
maps = json.loads((OUT / "maps.json").read_text())
align = json.loads((REPORT / "alignment.json").read_text())
for image in sorted(OUT.rglob("*.webp")):
    section = image.parent.name
    command, inputs = "", []
    if section == "alignment":
        command = "node tools/astra-enemy-light/learn.mjs && python tools/astra-enemy-light/overlay.py"
        sources = list(align.values())
        if image.stem.startswith("review-"):
            n = (int(image.stem.split("-")[1]) - 1) * 4
            sources = sources[n:n+4]
        else:
            sources = [align[image.stem]]
        inputs = [v[k] for v in sources for k in ["texture","source"]]
    elif section.startswith("blind-"):
        phase = section.split("-")[-1]
        command = f"node tools/astra-enemy-light/ab.mjs {phase} --reproduce"
        inputs = [f"reports/astra-enemy-light/phase-{phase}/dpr-2", str((image.parent/'result.json').relative_to(ROOT))]
    elif section in ("gallery","battle"):
        phase = "C" if (REPORT / "measure-C.json").exists() else "B" if (REPORT / "measure-B.json").exists() else "A"
        gallery = section == "gallery"
        command = "node tools/astra-enemy-light/capture.mjs --dpr=2 " + ("--mode=after --gallery" if gallery else f"--out=reports/astra-enemy-light/phase-{phase}")
        unit = next(k for k in align if image.name.startswith(k+"-"))
        inputs = [align[unit]["texture"], "apps/web/public/units/"+unit+"/relight-normal.webp",
                  "apps/web/src/game/cardrpg/spine/scene.ts", "tools/astra-enemy-light/fixture.mjs"]
    elif section == "motion":
        command = "node tools/astra-enemy-light/motion.mjs C"
        inputs = ["tools/astra-enemy-light/fixture.mjs", "apps/web/src/game/cardrpg/spine/scene.ts"]
    else:
        raise ValueError(section)
    data = image.read_bytes()
    assert len(data) <= 600000, image
    rows.append(dict(file=str(image.relative_to(OUT)), sha256=hashlib.sha256(data).hexdigest(),
                     bytes=len(data), command=command, sources=inputs, date="2026-11-21"))
(OUT / "evidence.json").write_text(json.dumps(rows, indent=2)+"\n")
provenance = [
    "# Enemy lighting provenance", "",
    "All assets below were derived from the project's own art and code on 21 November 2026 in Vietnam.",
    "The map bake uses Python 3.12, Pillow 13.0.0, NumPy 2.5.5 and SciPy 1.18.1. Run `python tools/astra-enemy-light/bake.py` from the repository root. All thirteen outputs use this command. Its source alpha threshold is 96/255. Native pages are 512 pixels wide. Pose tiles are 320 × 320 and follow K0, K1, K2, K4 and K5.",
    "The output channels contain tangent normal X/Y, interior distance and crease occlusion. No colour values enter the height estimate.",
    "", "## Runtime maps", "", "| File | Source files | SHA-256 |", "|---|---|---|",
]
for m in maps:
    provenance.append(f"| `{m['file']}` | " + ", ".join(f"`{source}`" for source in m['sources']) + f" | `{m['sha256']}` |")
provenance += ["", "## Verification images", "",
    "The browser uses Chromium with a 1280 × 720 viewport and DPR 2 for committed captures. Serve the app on port 6493. The alignment directory stores the half-strength UV overlays. The battle directory contains whole-viewport screenshots. The gallery and blind comparisons crop the original battlefield render.",
    "For historical A/B reproduction use the phase A revision 69ee323f7 or phase B revision 1bfcc7c84, capture both conditions with the matching phase output directory, then apply the recorded assignment using the current ab.mjs --reproduce. The C exhibit uses the integrated branch. Pixel comparisons use lossless originals before WebP encoding.",
    "", "| File | Source | Command from repository root | SHA-256 |", "|---|---|---|---|"]
for row in rows:
    sources = ", ".join(f"`{s}`" for s in row["sources"])
    provenance.append(f"| [{row['file']}]({row['file']}) | {sources} | `{row['command']}` | `{row['sha256']}` |")
(OUT / "PROVENANCE.md").write_text("\n".join(provenance)+"\n")
total = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
assert total <= 25000000, total
print(len(rows), "review images;", total, "total evidence bytes")
