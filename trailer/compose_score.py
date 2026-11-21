"""Original trailer score for Lantern Cat Cafe, composed to the trailer grid.

Written note by note here (no samples of other music, no generators). Rendered
with FluidSynth and the MuseScore_General soundfont (MIT licence) into stems
that mix.py balances and ducks under the voiceover.

    python3 compose_score.py            # writes audio/stems/*.wav and audio/score.mid
"""
import os, subprocess, pretty_midi as pm
from timeline import BEAT, BAR, LENGTH

SF2 = os.environ.get("SF2", "/home/user/sf/MuseScore_General.sf2")
OUT = "audio/stems"
os.makedirs(OUT, exist_ok=True)

N = {n: i for i, n in enumerate("C C# D D# E F F# G G# A A# B".split())}
N.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def p(name):
    """'F#5' -> midi number."""
    pc, octv = (name[:2], name[2:]) if len(name) > 2 and name[1] in "#b" else (name[:1], name[1:])
    return 12 * (int(octv) + 1) + N[pc]


def t(bar, beat=0.0):
    return bar * BAR + beat * BEAT


# chord name -> (root pitch class, quality)
CH = {"D": ("D", "maj"), "Bm": ("B", "min"), "G": ("G", "maj"), "A": ("A", "maj"), "Em": ("E", "min"),
      "F#m": ("F#", "min"), "A/C#": ("A", "maj")}


def chord_tones(name, base_oct):
    r, q = CH[name]
    root = 12 * (base_oct + 1) + N[r]
    third = 4 if q == "maj" else 3
    return [root, root + third, root + 7]


STEMS = {}


def inst(stem, program, name, drum=False):
    key = (stem, name)
    if key not in STEMS:
        STEMS[key] = pm.Instrument(program=program, is_drum=drum, name=name)
    return STEMS[key]


import random
_rng = random.Random(1121)


def note(i, pitch, start, dur, vel=80):
    if isinstance(pitch, str):
        pitch = p(pitch)
    if not i.is_drum and dur > 0.05:          # humanise: a few ms of timing, a little velocity
        start = max(0.0, start + _rng.gauss(0, 0.006))
        vel = vel + _rng.randint(-6, 6)
    elif i.is_drum:
        vel = vel + _rng.randint(-4, 4)
    i.notes.append(pm.Note(velocity=int(max(1, min(127, vel))), pitch=int(pitch), start=start, end=start + dur))


def melody(i, start_bar, seq, vel=82, transpose=0, legato=0.95):
    """seq: list of (pitch or None, beats)."""
    at = t(start_bar)
    for pitch, beats in seq:
        if pitch:
            note(i, p(pitch) + transpose, at, beats * BEAT * legato, vel)
        at += beats * BEAT


# The main theme: four bars over D | Bm | G | A
THEME = [("F#5", 1), ("E5", .5), ("D5", .5), ("A4", 1), ("D5", 1),
         ("B4", 1), ("D5", .5), ("E5", .5), ("F#5", 2),
         ("G5", 1), ("F#5", .5), ("E5", .5), ("D5", 1), ("B4", 1),
         ("C#5", 1), ("D5", .5), ("E5", .5), ("A4", 2)]
THEME_END = [("E5", 1), ("C#5", 1), ("D5", 2)]  # cadence replacing the last bar
# Minor colour of the same contour (B minor) for the cold open and the bosses
THEME_MIN = [("D5", 1), ("C#5", .5), ("B4", .5), ("F#4", 1), ("B4", 1),
             ("G4", 1), ("B4", .5), ("C#5", .5), ("D5", 2)]


def pad(stem, program, name, bars_chords, oct=3, vel=60, top=True):
    i = inst(stem, program, name)
    for bar, ch, length in bars_chords:
        tones = chord_tones(ch, oct)
        if top:
            tones = tones + [tones[0] + 12]
        for x in tones:
            note(i, x, t(bar), length * BAR * 0.99, vel)


def bass_roots(stem, program, name, bars_chords, oct=1, vel=78, pattern=(0,), dur=4):
    i = inst(stem, program, name)
    for bar, ch, length in bars_chords:
        r = chord_tones(ch, oct)[0]
        for k in range(length):
            for beat in pattern:
                note(i, r, t(bar + k, beat), dur * BEAT * 0.95, vel)


def arp(stem, program, name, bars_chords, oct=4, vel=62, step=.5, shape=(0, 1, 2, 3, 2, 1, 0, 1), legato=1.6):
    i = inst(stem, program, name)
    for bar, ch, length in bars_chords:
        tones = chord_tones(ch, oct)
        tones = tones + [tones[0] + 12]
        n = int(length * 4 / step)
        for k in range(n):
            note(i, tones[shape[k % len(shape)]], t(bar, k * step), step * BEAT * legato, vel + (6 if k % 4 == 0 else 0))


def ostinato(stem, program, name, bars_chords, oct=3, vel=70, step=.5, accent=(0, 3, 6), stacc=.45):
    """Driving repeated-note figure on root/fifth (string ostinato)."""
    i = inst(stem, program, name)
    for bar, ch, length in bars_chords:
        r, _, f = chord_tones(ch, oct)
        n = int(length * 4 / step)
        for k in range(n):
            pitch = f if k % 8 in (2, 5) else r
            note(i, pitch, t(bar, k * step), step * BEAT * stacc, vel + (14 if k % 8 in accent else 0))


def hit(bar, beat, ch, big=True, vel=118):
    """Orchestral tutti hit."""
    st = t(bar, beat)
    brass = inst("hits", 61, "brass_hits")
    strings = inst("hits", 48, "string_hits")
    tim = inst("perc", 47, "timpani")
    tones = chord_tones(ch, 3)
    for x in tones + [tones[0] + 12, tones[1] + 12]:
        note(brass, x, st, BEAT * (1.5 if big else .7), vel)
    for x in [tones[0] - 12] + tones + [tones[2] + 12]:
        note(strings, x, st, BEAT * (2 if big else .8), vel - 6)
    note(tim, chord_tones(ch, 2)[0], st, BEAT * 2, vel)
    if big:
        ch_ = inst("pad", 52, "choir")
        for x in tones:
            note(ch_, x + 12, st, BEAT * 3, vel - 20)


DR = lambda: inst("perc", 0, "drums", drum=True)
KICK, SNARE, CLAP, HAT, CRASH, SHAKER, TOM_L, TOM_M, TOM_H, RIDE, TAMB = 36, 38, 39, 42, 49, 70, 41, 45, 48, 51, 54


def drum(pitch, bar, beat, vel=90, dur=.25):
    note(DR(), pitch, t(bar, beat), dur * BEAT, vel)


def groove_light(bar, n):
    for k in range(n):
        for e in range(8):
            drum(SHAKER, bar + k, e * .5, 46 + (12 if e % 2 == 0 else 0))
        drum(KICK, bar + k, 0, 62); drum(KICK, bar + k, 2, 54)
        drum(CLAP, bar + k, 1, 38); drum(CLAP, bar + k, 3, 42)


def groove_full(bar, n, fill_last=True):
    for k in range(n):
        last = fill_last and k == n - 1
        for e in range(8):
            drum(HAT, bar + k, e * .5, 52 + (14 if e % 2 == 0 else 0))
        drum(KICK, bar + k, 0, 96); drum(KICK, bar + k, 1.5, 78); drum(KICK, bar + k, 2, 90)
        drum(SNARE, bar + k, 1, 84); drum(SNARE, bar + k, 3, 88)
        if last:
            for j, (pt, bt) in enumerate([(TOM_H, 2.5), (TOM_H, 2.75), (TOM_M, 3), (TOM_M, 3.25), (TOM_L, 3.5), (TOM_L, 3.75)]):
                drum(pt, bar + k, bt, 80 + j * 6)


def taiko(bar, n):
    """Boss pattern: low toms + kick in a driving 16th feel."""
    pat = [(0, KICK, 112), (0, TOM_L, 100), (.75, TOM_L, 80), (1.5, TOM_M, 92), (2, KICK, 108), (2, TOM_L, 104),
           (2.5, TOM_L, 78), (2.75, TOM_L, 84), (3, TOM_M, 96), (3.5, TOM_H, 90), (3.75, TOM_H, 96)]
    for k in range(n):
        for bt, pt, v in pat:
            drum(pt, bar + k, bt, v)
        drum(SNARE, bar + k, 1, 70); drum(SNARE, bar + k, 3, 80)


def crash(bar, beat=0, vel=100):
    drum(CRASH, bar, beat, vel, dur=4)


def roll(pitch, bar, beats, v0, v1, step=.25, stem_inst=None):
    n = int(beats / step)
    for k in range(n):
        v = v0 + (v1 - v0) * k / max(1, n - 1)
        if stem_inst is not None:
            note(stem_inst, pitch, t(bar, k * step), step * BEAT, v)
        else:
            drum(pitch, bar, k * step, v)


# ============================================================ COLD OPEN (bars 0-2)
pad("pad", 49, "slow_strings", [(0, "Bm", 1), (1, "G", 1)], oct=2, vel=52)
pad("pad", 89, "warm_pad", [(0, "Bm", 1), (1, "G", 1)], oct=3, vel=40)
cel = inst("lead", 8, "celesta")
melody(cel, 0, [(None, .5)] + THEME_MIN[:4] + [("D5", .5)], vel=70)
melody(cel, 1, [("G4", 1), ("B4", .5), ("C#5", .5), ("D5", 1), ("F#5", 1)], vel=66)
# bar 2: THE HIT on Soot's ultimate, ring for 2.5 beats then silence
hit(2, 0, "Bm", big=True, vel=124)
crash(2, 0, 112)
drum(KICK, 2, 0, 127)
low = inst("bass", 43, "contrabass")
note(low, "B1", t(2), BEAT * 2.6, 110)
note(inst("pad", 49, "slow_strings"), "F#3", t(2), BEAT * 2.6, 80)

# ============================================================ PREMISE (bars 3-7)
hit(3, 0, "D", big=True, vel=120)
crash(3, 0, 108)
drum(KICK, 3, 0, 120)
prem = [(3, "D", 1), (4, "D", 1), (5, "Bm", 1), (6, "G", 1), (7, "A", 1)]
arp("rhythm", 46, "harp", prem[1:], oct=4, vel=58)
ostinato("rhythm", 45, "pizz", prem[1:], oct=3, vel=64, step=.5, stacc=.35)
bass_roots("bass", 45, "pizz_bass", prem[1:], oct=2, vel=74, pattern=(0, 2), dur=1)
pad("pad", 49, "slow_strings", prem[1:], oct=3, vel=42, top=False)
melody(cel, 4, THEME, vel=78)
glk = inst("lead", 9, "glock")
melody(glk, 4, THEME[:5], vel=46)  # doubled softly on the first bar
groove_light(4, 4)

# ============================================================ CORE LOOP (bars 8-15)
core = [(8, "D", 1), (9, "Bm", 1), (10, "G", 1), (11, "A", 1), (12, "D", 1), (13, "Bm", 1), (14, "G", 1), (15, "A", 1)]
crash(8, 0, 96)
ostinato("rhythm", 48, "string_ostinato", core, oct=3, vel=66, step=.5, stacc=.4)
arp("rhythm", 46, "harp", core[:4], oct=4, vel=50)
bass_roots("bass", 43, "contrabass", core, oct=1, vel=82, pattern=(0, 2.5), dur=1.5)
pad("pad", 49, "slow_strings", core, oct=3, vel=48, top=False)
fl = inst("lead", 73, "flute")
melody(fl, 8, THEME, vel=84)
vln = inst("lead", 40, "violin")
melody(vln, 12, THEME[:14] + THEME_END[:0] + [("C#5", 1), ("E5", .5), ("F#5", .5), ("A5", 2)], vel=80)
melody(fl, 12, THEME[:9], vel=60, transpose=12)
groove_full(8, 8)
# brass punches with the battle
br = inst("lead", 61, "brass")
for bar, beat in [(12, 0), (12, 1.5), (13, 0), (13, 1.5)]:
    for x in chord_tones(core[bar - 8][1], 3):
        note(br, x, t(bar, beat), BEAT * .4, 96)
note(cel, "A6", t(13, 2), BEAT * 1.5, 90)    # the 'tap' on the ultimate portrait
hit(14, 0, "G", big=False, vel=118)          # Mochi's ultimate lands
crash(14, 0, 104)
# victory fanfare (bar 15)
tp = inst("lead", 56, "trumpet")
melody(tp, 15, [("A4", .5), ("D5", .5), ("F#5", .5), ("A5", 1.5), ("G5", .5), ("A5", .5)], vel=96)

# ============================================================ PROGRESSION (bars 16-21)
prog = [(16, "D", 1), (17, "A/C#", 1), (18, "Bm", 1), (19, "G", 1), (20, "Em", 1), (21, "A", 1)]
crash(16, 0, 104)
ostinato("rhythm", 48, "string_ostinato", prog, oct=3, vel=70, step=.5, stacc=.4)
arp("rhythm", 46, "harp", prog, oct=4, vel=56, step=.25, shape=(0, 1, 2, 3))
bass_roots("bass", 43, "contrabass", prog, oct=1, vel=86, pattern=(0, 2.5), dur=1.5)
pad("pad", 48, "strings", prog, oct=3, vel=58)
melody(vln, 16, THEME[:9], vel=92)
melody(inst("lead", 60, "horns"), 16, THEME[:9], vel=70, transpose=-12)
melody(vln, 18, [("G5", 1), ("F#5", .5), ("E5", .5), ("D5", 1), ("B4", 1),
                 ("E5", 1), ("F#5", .5), ("G5", .5), ("B5", 2),
                 ("A5", 1), ("G5", .5), ("F#5", .5), ("E5", 1), ("C#5", 1)], vel=90)
for bar, beat in [(16, 0), (16, .5), (16, 1), (19, 2), (19, 2.5), (19, 3)]:
    note(glk, p("D6") + [0, 4, 7][int(beat * 2) % 3], t(bar, beat), BEAT * .6, 92)
groove_full(16, 6)

# ============================================================ OWNERSHIP (bars 22-29) breakdown
own = [(22, "D", 1), (23, "A", 1), (24, "Bm", 1), (25, "G", 1), (26, "D", 1), (27, "A", 1), (28, "G", 1), (29, "A", 1)]
pno = inst("rhythm", 0, "piano")
for bar, ch, _ in own:
    tones = chord_tones(ch, 3)
    seq = [tones[0] - 12, tones[2] - 12, tones[1], tones[2], tones[0] + 12, tones[2], tones[1], tones[2] - 12]
    for k, x in enumerate(seq):
        note(pno, x, t(bar, k * .5), BEAT * 1.4, 54 + (8 if k == 0 else 0))
pad("pad", 89, "warm_pad", own, oct=3, vel=50)
pad("pad", 49, "slow_strings", own[4:], oct=3, vel=40, top=False)
bass_roots("bass", 43, "contrabass", own, oct=1, vel=60, pattern=(0,), dur=4)
# sparse piano melody, theme fragments (leaves room for the voice)
pmel = inst("lead", 0, "piano_melody")
melody(pmel, 22, [(None, 2), ("F#5", 1), ("E5", 1), ("E5", 2), ("C#5", 2)], vel=58)
melody(pmel, 26, [(None, 2), ("A5", 1), ("F#5", 1), ("E5", 2), ("C#5", 1), ("E5", 1)], vel=58)
for k in range(4):           # soft pulse returns, building into the climax
    for e in range(8):
        drum(SHAKER, 26 + k, e * .5, 34 + k * 6 + (8 if e % 2 == 0 else 0))
    drum(KICK, 26 + k, 0, 50 + k * 8)
roll(47, 29, 4, 40, 110, step=.125, stem_inst=inst("perc", 47, "timpani"))  # timpani roll A
for x in chord_tones("A", 2):
    note(inst("perc", 47, "timpani"), x, t(29), 0.01, 1)  # (keeps track alive)

# ============================================================ CLIMAX (bars 30-41)
boss = [(30, "Bm", 1), (31, "G", 1), (32, "D", 1)]
for bar, ch, _ in boss:
    hit(bar, 0, ch, big=True, vel=124)
    crash(bar, 0, 110)
ost = inst("bass", 42, "cello_ostinato")
mont = [(33, "Bm", 1), (34, "G", 1), (35, "D", 1), (36, "A", 1)]
for bar, ch, length in boss + mont:
    r = chord_tones(ch, 2)[0]
    for k in range(16):
        note(ost, r + (7 if k % 8 == 6 else 0), t(bar, k * .25), BEAT * .22, 84 + (20 if k % 4 == 0 else 0))
bass_roots("bass", 43, "contrabass", boss + mont, oct=1, vel=96, pattern=(0, 2), dur=2)
taiko(30, 7)
pad("pad", 52, "choir", mont, oct=3, vel=74)
pad("pad", 48, "strings", mont, oct=3, vel=72)
melody(inst("lead", 60, "horns"), 33, THEME_MIN + [("E5", 1), ("D5", .5), ("C#5", .5), ("B4", 1), ("G4", 1),
                                                   ("A4", 1), ("C#5", .5), ("D5", .5), ("E5", 2)], vel=104)
melody(tp, 33, THEME_MIN, vel=90, transpose=12)
for bar in (33, 34, 35, 36):    # stabs on the montage cuts (every half bar)
    for beat in (0, 2):
        for x in chord_tones(mont[bar - 33][1], 3):
            note(inst("hits", 61, "brass_hits"), x, t(bar, beat), BEAT * .35, 110)
# riser bars 37-38: tremolo strings G -> A, snare + timpani rolls
trem = inst("pad", 44, "tremolo")
for bar, ch in [(37, "G"), (38, "A")]:
    tones = chord_tones(ch, 3)
    for x in tones + [tones[0] + 12, tones[1] + 12]:
        note(trem, x, t(bar), BAR * .99, 92 + (bar - 37) * 30)
bass_roots("bass", 43, "contrabass", [(37, "G", 1), (38, "A", 1)], oct=1, vel=100, pattern=(0,), dur=4)
for k in range(2):
    for bt in range(4):
        drum(KICK, 37 + k, bt, 90 + k * 14)
roll(SNARE, 37, 8, 40, 122, step=.25)
roll(SNARE, 38, 4, 80, 127, step=.125)
roll(47, 37, 8, 50, 120, step=.25, stem_inst=inst("perc", 47, "timpani"))
# bar 39: SILENCE. One celesta note, the only music in the bar.
note(cel, "B5", t(39), BEAT * 3, 60)
# bars 40-41: tutti, D major, the theme in triumph
hit(40, 0, "D", big=True, vel=127)
crash(40, 0, 120)
fin = [(40, "D", 1), (41, "G", 1)]
pad("pad", 52, "choir", fin, oct=3, vel=92)
pad("pad", 48, "strings", fin, oct=3, vel=88)
melody(inst("lead", 60, "horns"), 40, THEME[:9], vel=112)
melody(vln, 40, THEME[:9], vel=110, transpose=12)
melody(tp, 41, [(None, 2), ("A5", .5), ("B5", .5), ("C#6", 1)], vel=104)
bass_roots("bass", 43, "contrabass", fin, oct=1, vel=104, pattern=(0, 2), dur=2)
taiko(40, 2)
crash(41, 2, 100)

# ============================================================ RESOLVE (bars 42-47)
res = [(42, "D", 1), (43, "Bm", 1), (44, "G", 1), (45, "A", 1), (46, "D", 2)]
hit(42, 0, "D", big=False, vel=96)
mbox = inst("lead", 10, "music_box")
melody(mbox, 42, THEME[:-2] + [("E5", 1), ("C#5", 1)], vel=76)
melody(mbox, 46, [("D5", 4)], vel=74)
note(mbox, "D6", t(46, 2), BEAT * 6, 64)
pad("pad", 49, "slow_strings", res, oct=3, vel=56)
arp("rhythm", 46, "harp", res[:4], oct=4, vel=48, step=.5)
bass_roots("bass", 43, "contrabass", res, oct=1, vel=66, pattern=(0,), dur=4)
note(inst("lead", 60, "horns"), "F#4", t(44), BAR * 2, 62)
note(inst("lead", 60, "horns"), "A4", t(46), BAR * 1.9, 60)
arp("rhythm", 46, "harp", [(46, "D", 1)], oct=4, vel=52, step=.25, shape=(0, 1, 2, 3, 3, 3, 3, 3))
crash(46, 0, 64)


# ============================================================ render
def render(stem_name, instruments):
    midi = pm.PrettyMIDI(initial_tempo=BPM_)
    for i in instruments:
        midi.instruments.append(i)
    # anchor length so every stem is exactly LENGTH + tail
    anchor = pm.Instrument(program=0, name="anchor")
    anchor.notes.append(pm.Note(velocity=1, pitch=21, start=LENGTH + 3.9, end=LENGTH + 4.0))
    midi.instruments.append(anchor)
    mid = f"{OUT}/{stem_name}.mid"
    midi.write(mid)
    wav = f"{OUT}/{stem_name}.wav"
    subprocess.run(["fluidsynth", "-ni", "-q", "-g", "0.5", "-r", "48000",
                    "-o", "synth.reverb.active=1", "-o", "synth.reverb.room-size=0.78",
                    "-o", "synth.reverb.damp=0.35", "-o", "synth.reverb.width=0.9", "-o", "synth.reverb.level=0.55",
                    "-o", "synth.chorus.active=0",
                    "-F", wav, SF2, mid], check=True)
    return wav


BPM_ = 96
if __name__ == "__main__":
    groups = {}
    for (stem, _), i in STEMS.items():
        groups.setdefault(stem, []).append(i)
    # channel limit: fluidsynth has 16 channels per file; pretty_midi assigns them per instrument
    full = pm.PrettyMIDI(initial_tempo=BPM_)
    for stem, insts in groups.items():
        assert len(insts) <= 15, (stem, len(insts))
        print(stem, [i.name for i in insts], render(stem, insts))
    for i in STEMS.values():
        full.instruments.append(i)
    full.write("audio/score.mid")
