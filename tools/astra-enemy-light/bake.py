"""Bake painterly bevel data from the original alpha only. Run from any directory."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

ROOT = Path(__file__).resolve().parents[2]
UNITS = ROOT / "apps/web/public/units"
IDS = """button-guard sock-skipper spool-ram needle-moth teacup-healer kettle-knight
yarn-giant binding-thread practice-cushion pollen-scout rain-spool crumb-sentinel pantry-crown""".split()
KEYS = ("K0", "K1", "K2", "K4", "K5")


def bevel(path, size):
    with Image.open(path) as image:
        alpha = image.convert("RGBA").getchannel("A").resize(size, Image.Resampling.LANCZOS)
    inside = np.asarray(alpha) >= 96
    distance = distance_transform_edt(inside)
    # A broad shoulder and a soft ridge are stable under minification and skinning.
    radius = max(3.0, distance.max() * 0.55)
    height = gaussian_filter(1 - np.exp(-distance / radius), 1.05)
    dy, dx = np.gradient(height)
    x, y = -dx * radius * 2.4, dy * radius * 2.4
    length = np.sqrt(1 + x*x + y*y)
    crease = np.maximum(0, gaussian_filter(height, max(1, radius * 0.24)) - height)
    channels = np.stack([0.5 + 0.5*x/length, 0.5 + 0.5*y/length,
                         np.clip(distance / radius, 0, 1), 1 - np.clip(crease * 1.8, 0, 0.25)], axis=-1)
    # Extend valid vectors a texel past antialiased boundaries; albedo alone owns coverage.
    nearest = distance_transform_edt(~inside, return_distances=False, return_indices=True)
    rgba = np.rint(channels[tuple(nearest)] * 255).astype(np.uint8)
    rgba[distance_transform_edt(~inside) > 4] = (128, 128, 0, 255)
    return Image.fromarray(rgba)


def main():
    rows = []
    for unit in IDS:
        directory = UNITS / unit
        manifest = directory / "poses/manifest.json"
        if manifest.exists():
            poses = json.loads(manifest.read_text())["poses"]
            sources = [manifest]
            atlas = Image.new("RGBA", (960, 640), (128, 128, 0, 255))
            for slot, key in enumerate(KEYS):
                source = manifest.parent / poses[key]["image"]
                sources.append(source)
                atlas.paste(bevel(source, (320, 320)), (slot % 3 * 320, slot // 3 * 320))
        else:
            source = directory / "rig-depth.png"
            sources = [source]
            with Image.open(source) as im:
                size = (512, round(512 * im.height / im.width))
            atlas = bevel(source, size)
        out = directory / "relight-normal.webp"
        atlas.save(out, lossless=True, method=6, exact=True)
        rows.append(dict(file=str(out.relative_to(ROOT)), size=list(atlas.size),
                         sha256=hashlib.sha256(out.read_bytes()).hexdigest(),
                         sources=[str(p.relative_to(ROOT)) for p in dict.fromkeys(sources)]))
    records = ROOT / "docs/astra-enemy-light-2026-11-21"
    (records / "maps.json").write_text(json.dumps(rows, indent=2) + "\n")


if __name__ == "__main__":
    main()
