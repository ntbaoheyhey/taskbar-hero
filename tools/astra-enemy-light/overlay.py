"""Compare normalized colour UVs against the nominal depth atlas from this checkout."""
import json
from pathlib import Path
from urllib.parse import urlparse, unquote

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "reports/astra-enemy-light"
OUT = ROOT / "docs/astra-enemy-light-2026-11-21/alignment"


def texture_file(url):
    path = unquote(urlparse(url).path)
    if path.startswith("/units/"):
        return ROOT / "apps/web/public" / path.lstrip("/")
    if path.startswith("/@fs/"):
        return Path(path[4:])
    if path.startswith("/assets/") and (ROOT / path.lstrip("/")).exists():
        return ROOT / path.lstrip("/")
    return ROOT / "apps/web" / path.lstrip("/")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = json.loads((REPORT / "runtime.json").read_text())
    rows, tiles = {}, []
    for unit, trace in data.items():
        paths = {texture_file(m["texture"]) for m in trace["meshes"]}
        if len(paths) != 1:
            raise RuntimeError(f"Inspect multiple visible maps for {unit}: {paths}")
        colour_path = paths.pop()
        depth_path = ROOT / "apps/web/public/units" / unit / "rig-depth.webp"
        with Image.open(colour_path) as im:
            colour = im.convert("RGBA")
        with Image.open(depth_path) as im:
            depth = im.convert("RGBA")
        # Mesh UVs cover the complete atlas on both axes. Preserve their coordinates.
        shape = (360, round(360 * colour.height / colour.width))
        c = colour.resize(shape, Image.Resampling.LANCZOS)
        d = depth.resize(shape, Image.Resampling.LANCZOS)
        ca = np.asarray(c.getchannel("A")) > 96
        da = np.asarray(d.getchannel("A")) > 96
        iou = np.count_nonzero(ca & da) / np.count_nonzero(ca | da)
        rgb = np.asarray(depth, dtype=np.int16)
        opaque = rgb[:, :, 3] >= 240
        chromatic = (np.ptp(rgb[:, :, :3], axis=2)[opaque] > 8).mean()
        bg = Image.new("RGBA", shape, "#33313a")
        cp = Image.alpha_composite(bg, c).convert("RGB")
        dp = Image.alpha_composite(bg, d).convert("RGB")
        overlay = Image.blend(cp, dp, 0.5)
        tile = Image.new("RGB", (360, shape[1] + 32), "#23212a")
        tile.paste(overlay, (0, 32))
        ImageDraw.Draw(tile).text((8, 8), f"{unit}   mask IoU {iou:.3f}", fill="white")
        tile.save(OUT / f"{unit}.webp", quality=82)
        rows[unit] = dict(texture=str(colour_path.relative_to(ROOT)), source=str(depth_path.relative_to(ROOT)),
                          colourSize=colour.size, candidateSize=depth.size, maskIoU=round(iou, 4),
                          chromaticOpaque=round(chromatic, 4))
        tiles.append(tile)
    for n in range(0, len(tiles), 4):
        group = tiles[n:n + 4]
        h = max(t.height for t in group)
        sheet = Image.new("RGB", (720, h * ((len(group) + 1) // 2)), "#23212a")
        for i, tile in enumerate(group):
            sheet.paste(tile, (i % 2 * 360, i // 2 * h))
        sheet.save(OUT / f"review-{n//4 + 1}.webp", quality=82)
    (REPORT / "alignment.json").write_text(json.dumps(rows, indent=2) + "\n")


if __name__ == "__main__":
    main()
