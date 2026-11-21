"""Cut the trailer picture from timeline.py + cut.json, then mux the soundtrack.

    python3 assemble.py                         # picture only -> build/picture.mp4
    python3 assemble.py --audio audio/mix_novo.wav --out out/trailer_review_noVO.mp4
    python3 assemble.py --audio audio/mix_vo.wav   --out out/trailer_tempVO.mp4 --reuse

cut.json maps every timeline `src` key to footage: file (shots/*.mp4 or a still),
in-point, zoom/pan (Ken Burns), grade and an optional `placeholder` flag (draws a
small DRAFT tag so stand-in footage is never mistaken for final).
"""
import argparse, json, os, subprocess
from timeline import SHOTS, LOWER_THIRDS, LENGTH

FPS = 30
W, H = 1920, 1080
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
GRADES = {
    "none": "",
    "night": "eq=brightness=-0.06:saturation=0.85:contrast=1.06,colorbalance=bs=0.10:bm=0.04:rh=0.04",
    "menace": "eq=brightness=-0.12:saturation=0.55:contrast=1.15,colorbalance=bs=0.12:rs=0.06",
    "warm": "eq=saturation=1.08:contrast=1.03,colorbalance=rs=0.04:rm=0.05:bh=-0.03",
    "boss": "eq=saturation=1.05:contrast=1.08,colorbalance=rs=0.05:bs=0.03",
    "freeze": "eq=saturation=0.25:contrast=1.15:brightness=-0.05",
    "plate": "gblur=sigma=18,eq=brightness=-0.22:saturation=0.8",
    "plate_dark": "gblur=sigma=22,eq=brightness=-0.32:saturation=0.7",
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"ffmpeg failed: {' '.join(cmd)[:400]}\n{r.stderr[-1500:]}")


def segment(shot, src, path):
    dur = shot["t1"] - shot["t0"]
    n = round(dur * FPS)
    f = src.get("file")
    inputs = []
    if f is None:
        inputs = ["-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={dur}"]
    else:
        p = f if os.path.isabs(f) else os.path.join(HERE, f)
        if src.get("still") or p.endswith((".webp", ".png", ".jpg", ".avif")):
            inputs = ["-loop", "1", "-framerate", str(FPS), "-t", f"{dur + 0.5}", "-i", p]
        elif src.get("freeze") is not None:
            inputs = ["-ss", f"{src['freeze']:.3f}", "-i", p]
        else:
            inputs = ["-ss", f"{src.get('in', 0):.3f}", "-t", f"{dur * src.get('speed', 1) + 0.5}", "-i", p]
    chain = []
    if src.get("freeze") is not None:
        chain.append(f"trim=end_frame=1,loop=loop={n + 10}:size=1,setpts=N/{FPS}/TB")
    if src.get("speed", 1) != 1:
        chain.append(f"setpts=PTS/{src['speed']},minterpolate=fps={FPS}:mi_mode=blend" if src.get("blend") else f"setpts=PTS/{src['speed']}")
    chain.append(f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},fps={FPS},setsar=1")
    z0, z1 = src.get("zoom", [1, 1])
    cx, cy = src.get("center", [0.5, 0.5])
    pan = src.get("pan", [0, 0])  # extra drift in output px across the shot
    whip = shot.get("tr") == "whip"
    if z0 != 1 or z1 != 1 or pan != [0, 0] or whip:
        # Ken Burns on a 2x canvas for sub-pixel smoothness
        zexpr = f"({z0})+(({z1})-({z0}))*on/{max(1, n - 1)}"
        wx = f"+{2 * 420}*pow(max(0,1-on/6),3)" if whip else ""
        xexpr = f"(iw-iw/zoom)*{cx}+{2 * pan[0]}*on/{max(1, n - 1)}{wx}"
        yexpr = f"(ih-ih/zoom)*{cy}+{2 * pan[1]}*on/{max(1, n - 1)}"
        chain.append(f"scale={2 * W}:{2 * H}:flags=bicubic")
        chain.append(f"zoompan=z='{zexpr}':x='{xexpr}':y='{yexpr}':d=1:s={W}x{H}:fps={FPS}")
    g = GRADES[src.get("grade", "none")]
    if g:
        chain.append(g)
    tr = shot.get("tr", "cut")
    if tr in ("hard_cut_flash", "flash", "title_slam"):
        chain.append(f"fade=in:st=0:d={0.16 if tr == 'title_slam' else 0.12}:color=white")
    elif tr == "whip":
        chain.append("fade=in:st=0:d=0.07:color=white")
    elif tr == "fade_from_black":
        chain.append("fade=in:st=0:d=0.9")
    elif tr in ("dip_to_dark", "crossfade"):
        chain.append("fade=in:st=0:d=0.4")
    if shot["id"] == SHOTS[-1]["id"]:
        chain.append(f"fade=out:st={dur - 1.3:.3f}:d=1.3")
    chain.append("vignette=angle=PI/5.5")
    if src.get("placeholder"):
        chain.append("drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='DRAFT FOOTAGE':"
                     "fontcolor=white@0.55:fontsize=26:x=w-tw-40:y=h-th-36:box=1:boxcolor=black@0.35:boxborderw=10")
    chain.append(f"tpad=stop_mode=clone:stop_duration=6,trim=end_frame={n},setpts=PTS-STARTPTS,format=yuv420p")
    run(["ffmpeg", "-v", "error", "-y", *inputs, "-vf", ",".join(chain), "-an", "-r", str(FPS),
         "-c:v", "libx264", "-crf", "15", "-preset", "medium", path])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio")
    ap.add_argument("--out")
    ap.add_argument("--reuse", action="store_true", help="reuse build/picture.mp4")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    cut = json.load(open(os.path.join(HERE, "cut.json")))
    os.makedirs(os.path.join(HERE, "build/seg"), exist_ok=True)
    picture = os.path.join(HERE, "build/picture.mp4")
    if not args.reuse:
        listing = []
        for s in SHOTS:
            seg = os.path.join(HERE, f"build/seg/{s['id']}.mp4")
            src = cut[s["src"]] if not s["src"].startswith("card:") or s["src"] in cut else {"file": None}
            if not args.only or s["id"] in args.only or not os.path.exists(seg):
                segment(s, src, seg)
                print("seg", s["id"], s["src"])
            listing.append(f"file '{seg}'")
        open(os.path.join(HERE, "build/seg/list.txt"), "w").write("\n".join(listing))
        base = os.path.join(HERE, "build/base.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(HERE, "build/seg/list.txt"),
             "-c", "copy", base])
        # overlays: titles + lower thirds
        ins, fc, last = ["-i", base], [], "0:v"
        k = 1
        for s in SHOTS:
            mov = os.path.join(HERE, f"build/titles/{s['id']}.mov")
            if s.get("text") and os.path.exists(mov):
                ins += ["-itsoffset", f"{s['t0']:.4f}", "-i", mov]
                fc.append(f"[{last}][{k}:v]overlay=eof_action=pass:format=auto[v{k}]"); last = f"v{k}"; k += 1
        for i, l in enumerate(LOWER_THIRDS):
            mov = os.path.join(HERE, f"build/titles/lower{i}.mov")
            if os.path.exists(mov):
                ins += ["-itsoffset", f"{l['t0']:.4f}", "-i", mov]
                fc.append(f"[{last}][{k}:v]overlay=eof_action=pass:format=auto[v{k}]"); last = f"v{k}"; k += 1
        fc.append(f"[{last}]format=yuv420p[vout]")
        run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "[vout]",
             "-t", f"{LENGTH}", "-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-preset", "slow", picture])
        print("picture", picture)
    if args.audio:
        out = args.out or os.path.join(HERE, "out/trailer.mp4")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", picture, "-i", args.audio, "-map", "0:v", "-map", "1:a",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-t", f"{LENGTH}",
             "-movflags", "+faststart", out])
        print("wrote", out)


if __name__ == "__main__":
    main()
