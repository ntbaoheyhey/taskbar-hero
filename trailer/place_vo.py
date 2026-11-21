"""Place voiceover lines on the trailer timeline -> one VO track.

Per-line files (recommended): a folder with vo01.wav ... vo14.wav (any format
ffmpeg reads: wav, m4a, mp3). Each line starts at its cue time in timeline.py.

    python3 place_vo.py vo/temp  audio/vo_temp.wav
    python3 place_vo.py vo/final audio/vo_final.wav

One continuous take: put it at vo/final/take.wav (or .m4a); the script splits it
on pauses of >= 0.7 s into exactly 14 lines (read the lines in order with a
clear pause between them) and saves the pieces as vo01.wav ... for checking.

Each line gets: high-pass 80 Hz, de-click fades, light compression, level match.
A line that runs past its slot is reported (it will overlap the next cue).
"""
import sys, os, glob, subprocess, numpy as np
from timeline import VO, LENGTH

SR = 48000


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af",
                          "highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2",
                          "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, thr=0.012):
    idx = np.where(np.abs(x) > thr * np.abs(x).max())[0]
    if not len(idx):
        return x
    x = x[max(0, idx[0] - int(.03 * SR)): idx[-1] + int(.12 * SR)]
    f = int(.01 * SR)
    x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    return x


def split_take(x, n_lines, min_gap=0.7):
    blk = int(.02 * SR)
    nb = len(x) // blk
    rms = np.sqrt((x[:nb * blk].reshape(nb, blk) ** 2).mean(axis=1))
    voiced = rms > 0.06 * rms.max()
    segs, start, gap = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            if start is None:
                start = i
            gap = 0
        elif start is not None:
            gap += 1
            if gap * blk >= min_gap * SR:
                segs.append((start, i - gap + 1)); start = None; gap = 0
    if start is not None:
        segs.append((start, nb))
    segs = [s for s in segs if (s[1] - s[0]) * blk > .25 * SR]
    if len(segs) != n_lines:
        sys.exit(f"Found {len(segs)} spoken segments, expected {n_lines}. Leave a clear 1-second pause between lines, "
                 f"or record one file per line (vo01.wav ...).")
    return [x[a * blk:(b + 1) * blk] for a, b in segs]


def main(folder, out):
    takes = glob.glob(f"{folder}/take.*")
    lines = {}
    if takes:
        for v, seg in zip(VO, split_take(load(takes[0]), len(VO))):
            lines[v["id"]] = seg
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f64le", "-ac", "1", "-ar", str(SR), "-i", "-",
                            f"{folder}/{v['id']}.split.wav"], input=seg.astype(np.float64).tobytes(), check=True)
    else:
        for v in VO:
            hits = sorted(glob.glob(f"{folder}/{v['id']}.*"))
            hits = [h for h in hits if ".split." not in h]
            if not hits:
                print(f"MISSING {v['id']}: \"{v['text']}\" (left silent)")
                continue
            lines[v["id"]] = load(hits[0])
    buf = np.zeros(int((LENGTH + 2) * SR))
    for v in VO:
        if v["id"] not in lines:
            continue
        x = trim(lines[v["id"]])
        x = x / (np.sqrt((x ** 2).mean()) + 1e-9) * 0.11     # level match (~-19 dBFS RMS)
        x = np.clip(x, -0.98, 0.98)
        dur = len(x) / SR
        flag = "ok" if dur <= v["max"] + 0.15 else f"TOO LONG by {dur - v['max']:.2f}s"
        print(f"{v['id']} at {v['t0']:6.2f}s  {dur:4.2f}s / slot {v['max']:.2f}s  {flag}")
        a = int(v["t0"] * SR)
        buf[a:a + len(x)] += x[:len(buf) - a]
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f64le", "-ac", "1", "-ar", str(SR), "-i", "-",
                    "-ac", "2", "-c:a", "pcm_s24le", out], input=buf.tobytes(), check=True)
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
