"""Trailer SFX layer: designed hits (synthesised here) + CC0 / project library sounds,
placed exactly on the timeline grid. Writes audio/sfx.wav (48 kHz stereo float).

Library sources (all already cleared in the repo):
  assets/audio-sources/b2/*            Kenney packs (CC0) and Freesound CC0 ambiences
  apps/web/public/audio/v5, v9         the game's own SFX (see apps/web/public/audio/*/LICENSES.json)
"""
import os, subprocess, numpy as np
from scipy.signal import butter, sosfilt
from timeline import SFX, LENGTH, BEAT

SR = 48000
REPO = os.environ.get("REPO", "/home/user/th")
A = f"{REPO}/assets/audio-sources/b2"
G = f"{REPO}/apps/web/public/audio"
rng = np.random.default_rng(7)


def load(path, gain_db=0.0):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
    pk = np.abs(x).max() or 1
    return x / pk * 10 ** (gain_db / 20)


def st(m):
    return np.stack([m, m], axis=1)


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def boom(dur=3.2, f0=62, f1=27, drive=2.2):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt / 0.18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sub = np.sin(ph) * env_exp(n, 0.9)
    sub = np.tanh(sub * drive) / np.tanh(drive)
    click = lp(rng.standard_normal(n) * env_exp(n, 0.012), 3500)
    body = lp(rng.standard_normal(n) * env_exp(n, 0.35), 220, 4) * 2.5
    m = sub * 0.9 + click * 0.5 + body * 0.35
    s = st(m)
    # a little stereo air on the noise tail
    air = hp(rng.standard_normal((n, 2)) * env_exp(n, 0.5)[:, None], 2500) * 0.04
    return s + air


def whoosh(dur=0.9, lo=180, hi=2400, rise=0.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    e = np.where(tt < rise * dur, (tt / (rise * dur)) ** 2, np.exp(-(tt - rise * dur) / 0.08))
    out = np.zeros((n, 2))
    blocks = 24
    noise = rng.standard_normal((n, 2))
    for k in range(blocks):
        a, b_ = k * n // blocks, (k + 1) * n // blocks
        fc = lo * (hi / lo) ** (k / blocks)
        out[a:b_] = bp(noise[a:b_], fc * 0.6, min(fc * 1.6, 20000))
    pan = np.linspace(-0.6, 0.6, n)
    out[:, 0] *= (1 - pan) / 2 + 0.3; out[:, 1] *= (1 + pan) / 2 + 0.3
    return out * e[:, None]


def whip(dur=0.28):
    return whoosh(dur, 600, 7000, 0.7) * 0.9


def riser(dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    prog = tt / dur
    f = 180 * (2400 / 180) ** (prog ** 1.6)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    noise = hp(rng.standard_normal(n), 900) * 0.5
    m = (tone * 0.35 + noise) * prog ** 2.2
    s = st(m)
    s[:, 1] = np.roll(s[:, 1], 240)
    return s


def reverse_swell(dur):
    n = int(dur * SR)
    cym = hp(rng.standard_normal((n, 2)), 3000) * env_exp(n, dur / 3)[:, None]
    return cym[::-1] * 0.9


def soft_swell(dur=2.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    pad = lp(rng.standard_normal((n, 2)), 1200)
    e = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 2
    return pad * e[:, None] * 0.5


def bell_arp(notes=(74, 78, 81, 86), step=0.06, dur=1.8):
    n = int(dur * SR + step * len(notes) * SR)
    out = np.zeros(n)
    for k, m in enumerate(notes):
        f = 440 * 2 ** ((m - 69) / 12)
        a = int(k * step * SR); tt = np.arange(n - a) / SR
        tone = (np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / 0.15)
                + 0.2 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt / 0.06))
        out[a:] += tone * np.exp(-tt / 0.55) * 0.5
    s = st(out)
    s[:, 0] = np.roll(s[:, 0], 90)
    return s


def mix_in(buf, x, t, gain_db):
    a = int(round(t * SR))
    x = x * 10 ** (gain_db / 20)
    end = min(len(buf), a + len(x))
    if end > a:
        buf[a:end] += x[:end - a]


def make(kind, dur=None):
    if kind == "rain_bed":
        x = load(f"{A}/ambience/rain-window-869851.flac")
        n = int(dur * SR)
        x = np.tile(x, (n // len(x) + 1, 1))[:n]
        fade = np.minimum(1, np.minimum(np.arange(n) / (0.8 * SR), (n - np.arange(n)) / (0.05 * SR)))
        return x * fade[:, None]
    if kind == "whoosh_low":
        return whoosh(1.2, 90, 900, 0.75)
    if kind == "trailer_boom":
        return boom()
    if kind == "ult_cutin":
        tr = load(f"{G}/v9/sfx-ult-soot-transient.opus", -2)
        body = load(f"{G}/v9/sfx-ult-soot-body.opus", -6)
        out = np.zeros((max(len(tr), len(body)), 2)); out[:len(tr)] += tr; out[:len(body)] += body
        return out
    if kind == "title_hit":
        bell = load(f"{A}/impact-sounds/impactBell_heavy_000.flac", -8)
        b_ = boom(3.6, 70, 30, 2.8)
        b_[:len(bell)] += bell
        return b_
    if kind == "title_hit_soft":
        b_ = boom(2.5, 60, 32, 1.4) * 0.5
        b_[:len(bell_arp())] += bell_arp((62, 69, 74, 78)) * 0.6
        return b_
    if kind == "whip":
        return whip()
    if kind == "ui_click":
        return load(f"{A}/interface-sounds/click_002.flac", -4)
    if kind == "ui_confirm":
        return load(f"{A}/interface-sounds/confirmation_001.flac", -4)
    if kind == "card_flip":
        return load(f"{G}/v5/ui-card-flip.opus", -3)
    if kind == "impact_light":
        return load(f"{G}/v5/enemy-hit-medium.opus", -3)
    if kind == "impact_heavy":
        h = load(f"{G}/v5/enemy-hit-heavy.opus", -1)
        b_ = boom(0.9, 90, 40, 1.6) * 0.45
        b_[:len(h)] += h
        return b_
    if kind == "victory_sparkle":
        return bell_arp((74, 78, 81, 86, 90), 0.055)
    if kind == "loot_reveal":
        r = riser(0.45) * 0.5
        s = bell_arp((81, 86, 90, 93), 0.045)
        out = np.zeros((len(r) + len(s), 2)); out[:len(r)] += r; out[len(r) - 2000:len(r) - 2000 + len(s)] += s
        return out
    if kind == "forge_clang":
        m = load(f"{A}/impact-sounds/impactMetal_heavy_002.flac", -2)
        bl = load(f"{A}/impact-sounds/impactBell_heavy_001.flac", -9)
        out = np.zeros((max(len(m), len(bl)), 2)); out[:len(m)] += m; out[:len(bl)] += bl
        return out
    if kind == "soft_swell":
        return soft_swell()
    if kind == "seal_chime":
        return load(f"{G}/v9/sfx-shared-relic-mint.opus", -2)
    if kind == "coin":
        return load(f"{A}/rpg-audio/handleCoins.flac", -3)
    if kind == "tx_confirm":
        return load(f"{G}/v5/chain-tx-confirmed.opus", -3)
    if kind == "riser":
        return riser(dur)
    if kind == "reverse_swell":
        return reverse_swell(dur)
    raise KeyError(kind)


if __name__ == "__main__":
    buf = np.zeros((int((LENGTH + 4) * SR), 2))
    for e in SFX:
        mix_in(buf, make(e["kind"], e.get("dur")), e["t"], e["gain"])
    os.makedirs("audio", exist_ok=True)
    buf.astype(np.float32).tofile("audio/sfx.f32")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(SR), "-i", "audio/sfx.f32",
                    "-c:a", "pcm_s24le", "audio/sfx.wav"], check=True)
    os.remove("audio/sfx.f32")
    print("sfx peak", np.abs(buf).max())
