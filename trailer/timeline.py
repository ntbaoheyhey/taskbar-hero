"""Single source of truth for the Lantern Cat Cafe trailer.

Everything is placed on a musical grid: 96 BPM, 4/4, so one beat = 0.625 s and
one bar = 2.5 s. The score (compose_score.py), the SFX layer (build_sfx.py), the
temp/final voiceover placement (place_vo.py) and the picture edit (assemble.py)
all read this file, so changing a time here moves picture, music and VO together.

Run `python3 timeline.py` to export timeline.json and the script tables.
"""
import json, sys

BPM = 96
BEAT = 60 / BPM          # 0.625 s
BAR = 4 * BEAT           # 2.5 s
LENGTH_BARS = 48
LENGTH = LENGTH_BARS * BAR  # 120 s


def b(bar, beat=0.0):
    """Seconds at bar (0-based) + beat offset."""
    return round(bar * BAR + beat * BEAT, 4)


# ---------------------------------------------------------------- sections
SECTIONS = [
    # id, start bar, end bar, purpose, music
    ("cold_open", 0, 3, "Hook: the last lit cafe, the Tangle, one ultimate, title",
     "B minor. Rain, celesta music-box motif over a dark pad; BOOM on Soot's ultimate (bar 2); 2 beats of silence; title hit on bar 3."),
    ("premise", 3, 8, "World + the three heroes + the collection",
     "D major cafe groove: pizzicato, harp, celesta theme, brushed percussion."),
    ("core_loop", 8, 16, "What you do: route map, story choices, battle, manual ultimates, win",
     "Adds drums, string ostinato and brass punches; theme on flute/strings."),
    ("progression", 16, 22, "Gear drops, equip, Forge, three chapters",
     "Bright full theme, glockenspiel sparkles on every reward."),
    ("ownership", 22, 30, "Economy: earned by play, sealed on Avalanche, traded, YARN burned",
     "Breakdown: piano + warm pad + soft pulse, room for the voice."),
    ("climax", 30, 42, "Three bosses, ultimate montage, stop-down, final blow",
     "B minor epic: 16th-note low strings, taiko, brass, choir; silence on bar 39; tutti D major from bar 40."),
    ("resolve", 42, 48, "Cafe warm again, title lockup, call to action",
     "Theme reprise on music box + strings, final chord rings out."),
]

# ---------------------------------------------------------------- picture
# Each shot: start/end seconds, footage source key (see shots.py), on-screen
# text (None or dict), transition INTO this shot.
# Footage keys starting with "card:" are rendered title cards, not game capture.
SHOTS = [
    # ---- cold open
    dict(id="s01", t0=b(0), t1=b(1), src="landing_night_push", tr="fade_from_black",
         note="Slow push on the landing art: the cafe at night, lantern glow."),
    dict(id="s02", t0=b(1), t1=b(2), src="tangle_closeup", tr="cut",
         note="Tangle enemies (Needle Moth / Sock Skipper) close, dim, menacing; slow push."),
    dict(id="s03", t0=b(2), t1=b(2, 3), src="soot_ult_cutin", tr="hard_cut_flash",
         note="HIT on bar 2: Soot's 'Chimney Comet' cut-in fills the frame."),
    dict(id="s04", t0=b(2, 3), t1=b(3), src="card:black", tr="cut",
         note="Two beats of black + silence before the title."),
    # ---- premise
    dict(id="s05", t0=b(3), t1=b(4, 2), src="cafe_home", tr="title_slam",
         text=dict(kind="title", main="LANTERN CAT CAFÉ"),
         note="Title slam over the living cafe home."),
    dict(id="s06", t0=b(4, 2), t1=b(5, 2), src="mochi_idle", tr="whip",
         text=dict(kind="name", main="MOCHI", sub="Guards the team")),
    dict(id="s07", t0=b(5, 2), t1=b(6, 2), src="clover_idle", tr="whip",
         text=dict(kind="name", main="CLOVER", sub="Keeps everyone standing")),
    dict(id="s08", t0=b(6, 2), t1=b(7, 2), src="soot_idle", tr="whip",
         text=dict(kind="name", main="SOOT", sub="Lands the final blow")),
    dict(id="s09", t0=b(7, 2), t1=b(8), src="collection_12", tr="cut",
         text=dict(kind="caption", main="12 cats to befriend")),
    # ---- core loop
    dict(id="s10", t0=b(8), t1=b(10), src="route_map_ch1", tr="cut",
         text=dict(kind="caption", main="Choose your route"),
         note="Route map: battle, event, elite, treasure, shop, campfire, boss. Cursor picks a node."),
    dict(id="s11", t0=b(10), t1=b(11), src="event_card", tr="cut",
         note="Prepare screen: formation set, cursor taps Fight."),
    dict(id="s12", t0=b(11), t1=b(12), src="battle_wave_start", tr="cut",
         note="Battle opens: wave banner, cats advance."),
    dict(id="s13", t0=b(12), t1=b(13), src="battle_auto", tr="cut",
         note="Auto attacks, hit sparks, damage numbers."),
    dict(id="s14", t0=b(13), t1=b(14), src="battle_tap_ult", tr="cut",
         text=dict(kind="caption", main="Time your ultimates"),
         note="Cursor taps Mochi's portrait (TAP badge) to queue the ultimate."),
    dict(id="s15", t0=b(14), t1=b(15), src="mochi_ult", tr="cut",
         note="Mochi's 'Last Lantern Vow' lands on the downbeat."),
    dict(id="s16", t0=b(15), t1=b(16), src="battle_victory", tr="cut",
         note="Victory."),
    # ---- progression
    dict(id="s17", t0=b(16), t1=b(17, 2), src="gear_drop", tr="flash",
         text=dict(kind="caption", main="Every win can drop gear"),
         note="Gear drop reveal with rarity glow."),
    dict(id="s18", t0=b(17, 2), t1=b(19), src="equip_gear", tr="cut",
         note="Equip the new piece on a cat (Team / Bag)."),
    dict(id="s19", t0=b(19), t1=b(20, 2), src="forge_enhance", tr="cut",
         text=dict(kind="caption", main="Forge it stronger"),
         note="Forge enhance panel, stat goes up."),
    dict(id="s20", t0=b(20, 2), t1=b(22), src="chapters_123", tr="cut",
         text=dict(kind="caption", main="3 chapters · 3 bosses"),
         note="In-game chapter intro story cards: Tangled Cafe, Rooftop Orchard, Midnight Pantry (1.25 s each)."),
    # ---- ownership / economy
    dict(id="s21", t0=b(22), t1=b(24), src="card:earned", tr="dip_to_dark",
         text=dict(kind="statement", main="Power is earned by playing.", sub="Never bought."),
         note="Calm statement card over a soft-focus cafe plate."),
    dict(id="s22", t0=b(24), t1=b(26), src="seal_gear_nft", tr="cut",
         text=dict(kind="chain", head="Live on Avalanche Fuji", big="Seal · <b>2 YARN</b> burned",
                   rows=[["Method", "<code>seal(bytes32 intent, uint256 amount)</code>"], ["Sent to", "<code>0x0000…0000</code> &nbsp;(burned)"],
                         ["Tx", "<code>0xdcd5ced1…4d80e53f</code>"]],
                   foot="testnet.snowtrace.io · YARN 0x3ae1…2d6b · testnet tokens, no real-world value"),
         note="Real Fuji proof card: a gear seal that burned 2 YARN (tx on Snowtrace) over the Forge."),
    dict(id="s23", t0=b(26), t1=b(28), src="relic_market", tr="cut",
         text=dict(kind="chain", head="Relic Market · live on Fuji", big="Sold for <b>1.23 YARN</b>",
                   rows=[["Method", "<code>buy(uint256 id)</code>"], ["Fee burned", "<code>0.0247 YARN</code> &nbsp;(2% of the sale)"],
                         ["Tx", "<code>0xb0240565…0120b273</code>"]],
                   foot="RelicMarketV2 0x6Fe4…7eb4 · Avalanche Fuji testnet"),
         note="Real Fuji proof card: a Relic Market sale and its 2% fee burn."),
    dict(id="s24", t0=b(28), t1=b(30), src="yarn_burn_explorer", tr="cut",
         text=dict(kind="chain", head="YARN · fixed supply", big="{n} <b>YARN</b>", countFrom=1000000000, countTo=999999997.98, dp=2,
                   rows=[["Minted once", "1,000,000,000 at genesis · no mint function"], ["Burned so far", "2.02 YARN by seals and market fees"]],
                   foot="Player payouts are paced to burns · read live from Fuji, 20 Nov 2026"),
         note="YARN total supply counting down from 1,000,000,000 to the live figure."),
    # ---- climax
    dict(id="s25", t0=b(30), t1=b(31), src="boss_yarn_giant", tr="flash",
         text=dict(kind="boss", main="THE YARN GIANT", sub="Chapter 1 · Tangled Café")),
    dict(id="s26", t0=b(31), t1=b(32), src="boss_rain_spool", tr="flash",
         text=dict(kind="boss", main="THE RAIN SPOOL", sub="Chapter 2 · Rooftop Orchard")),
    dict(id="s27", t0=b(32), t1=b(33), src="boss_pantry_crown", tr="flash",
         text=dict(kind="boss", main="THE PANTRY CROWN", sub="Chapter 3 · Midnight Pantry")),
    # 8 half-bar montage cuts
    dict(id="s28", t0=b(33), t1=b(33, 2), src="m_clover_ult", tr="cut"),
    dict(id="s29", t0=b(33, 2), t1=b(34), src="m_boss_attack", tr="cut"),
    dict(id="s30", t0=b(34), t1=b(34, 2), src="m_mochi_block", tr="cut"),
    dict(id="s31", t0=b(34, 2), t1=b(35), src="m_soot_crit", tr="cut"),
    dict(id="s32", t0=b(35), t1=b(35, 2), src="m_rain_spool_attack", tr="cut"),
    dict(id="s33", t0=b(35, 2), t1=b(36), src="m_clover_heal", tr="cut"),
    dict(id="s34", t0=b(36), t1=b(36, 2), src="m_pantry_crown_attack", tr="cut"),
    dict(id="s35", t0=b(36, 2), t1=b(37), src="m_mochi_ult", tr="cut"),
    dict(id="s36", t0=b(37), t1=b(39), src="boss_final_pressure", tr="cut",
         note="Riser: the final boss winds up, team HP low, Clover heals just in time."),
    dict(id="s37", t0=b(39), t1=b(40), src="soot_portrait_freeze", tr="cut",
         note="STOP-DOWN: frozen frame on Soot's ultimate portrait, desaturated, silence + whisper."),
    dict(id="s38", t0=b(40), t1=b(41, 2), src="soot_ult_final", tr="flash",
         note="Final blow: Chimney Comet hits the boss on bar 40."),
    dict(id="s39", t0=b(41, 2), t1=b(42), src="chapter_clear", tr="cut",
         note="Boss defeated / chapter clear."),
    # ---- resolve
    dict(id="s40", t0=b(42), t1=b(44), src="cafe_home_warm", tr="crossfade",
         note="Back at the cafe, warm light, cats idle together."),
    dict(id="s41", t0=b(44), t1=b(46), src="card:lockup", tr="crossfade",
         text=dict(kind="lockup", main="LANTERN CAT CAFÉ", sub="A cosy card RPG on Avalanche")),
    dict(id="s42", t0=b(46), t1=b(48), src="card:cta", tr="cut",
         text=dict(kind="cta", main="Play free in your browser",
                   sub="taskbarhero-eight.vercel.app",
                   fine="Avalanche Fuji testnet · YARN and NFTs have no real-world value")),
]

# Small persistent disclaimer while the economy is on screen.
LOWER_THIRDS = [
    dict(t0=b(24), t1=b(30), text="Avalanche Fuji testnet · no real-world value"),
]

# ---------------------------------------------------------------- voiceover
# t0 = where the line STARTS; max = the longest the read may run before it
# collides with the next cue. Tone notes are for the recording session.
VO = [
    dict(id="vo01", t0=b(0, 0.3), max=2.4, text="Every unfinished task... goes somewhere.",
         tone="Hushed, close to the mic, slow. Like telling a secret at night.",
         emphasis="unfinished", cue="Rain ambience; celesta motif starts under you."),
    dict(id="vo02", t0=b(1, 0.2), max=2.3, text="Out here, they knot together.",
         tone="Still hushed, a little ominous. Slow down on 'knot together'.",
         emphasis="knots", cue="Tangle close-up. Finish before the BOOM at 0:05.0."),
    dict(id="vo03", t0=b(4, 0.5), max=6.5,
         text="One café still keeps its lantern lit... and its cats intend to keep it that way.",
         tone="Warm, smiling, storyteller. Medium pace.",
         emphasis="lantern lit / its cats", cue="Starts just after the title slam settles; ends as Clover appears."),
    dict(id="vo04", t0=b(8, 0.3), max=5.8,
         text="Choose your path: battles, strange encounters, treasure... and a boss at the end.",
         tone="Brisk and inviting. Lift on 'treasure', small pause, then drop on 'boss'.",
         emphasis="boss", cue="Route map on screen; drums enter at 0:20."),
    dict(id="vo05", t0=b(11, 0.3), max=4.6,
         text="Your cats fight on their own. You decide when they unleash their ultimates.",
         tone="Confident, a grin in the voice.",
         emphasis="You decide", cue="Hit 'ultimates' as the cursor taps the portrait (0:32.5)."),
    dict(id="vo06", t0=b(16, 0.3), max=7.2,
         text="Every victory can drop new gear. Equip it, forge it stronger, and push into the next chapter.",
         tone="Upbeat, building. Three clear beats: equip / forge / push.",
         emphasis="new gear / next chapter", cue="Glockenspiel sparkle on the drop at 0:40."),
    dict(id="vo07", t0=b(22, 0.3), max=4.2,
         text="Here, power is earned by playing. Never bought.",
         tone="Calm, sincere, slower. Full stop before 'Never bought'.",
         emphasis="earned / Never", cue="Music drops to piano; this is the honest moment."),
    dict(id="vo08", t0=b(24, 0.2), max=5.45,
         text="But when a piece of gear matters to you, seal it on Avalanche. Now it's truly yours.",
         tone="Calm, clear, a little proud on 'truly yours'.",
         emphasis="Avalanche / yours", cue="Seal animation on screen."),
    dict(id="vo09", t0=b(26, 1.0), max=2.9,
         text="Keep it, or trade it on the Relic Market.",
         tone="Light, matter-of-fact.",
         emphasis="trade", cue="Market panel."),
    dict(id="vo10", t0=b(27, 2.4), max=6.0,
         text="Seals burn YARN, a fixed-supply token... and every sale burns part of its fee.",
         tone="Precise, confident, not salesy. Steady pace.",
         emphasis="burn / fixed-supply / every sale", cue="Starts on the market card and carries into the supply counter. No hype here."),
    dict(id="vo11", t0=b(30, 0.2), max=2.2, text="But the Tangle is growing.",
         tone="Darker, lower, slower. Let it hang.",
         emphasis="growing", cue="Over the Yarn Giant reveal; music turns to B minor."),
    dict(id="vo12", t0=b(39, 0.6), max=1.4, text="Light the lantern.",
         tone="Whisper-intense, close mic. The only sound in the silence.",
         emphasis="lantern", cue="Total silence bar (1:37.5). End before 1:39.4; the hit lands at 1:40.0."),
    dict(id="vo13", t0=b(42, 0.6), max=8.0,
         text="Lantern Cat Café. A cosy card RPG... where the light you protect is yours to keep.",
         tone="Warm, proud, slower. Small pause after 'card RPG'. Smile on 'yours to keep'.",
         emphasis="Lantern Cat Café / yours to keep", cue="Back in the warm cafe; lockup appears at 1:50."),
    dict(id="vo14", t0=b(46, 0.4), max=2.6, text="Play free in your browser.",
         tone="Friendly, direct, like an invitation.",
         emphasis="free", cue="CTA card. Finish before the final chord fades."),
]

# ---------------------------------------------------------------- SFX hits
# Designed/library sounds placed on picture events (all on the grid).
SFX = [
    dict(t=b(0), kind="rain_bed", dur=b(2, 3), gain=-20),
    dict(t=b(1, 2), kind="whoosh_low", gain=-14),
    dict(t=b(2), kind="trailer_boom", gain=-10),
    dict(t=b(2), kind="ult_cutin", gain=-8),
    dict(t=b(3), kind="title_hit", gain=-9),
    dict(t=b(4, 2), kind="whip", gain=-14), dict(t=b(5, 2), kind="whip", gain=-14), dict(t=b(6, 2), kind="whip", gain=-14),
    dict(t=b(9, 1), kind="ui_click", gain=-12),
    dict(t=b(10, 2), kind="card_flip", gain=-12),
    dict(t=b(11), kind="impact_light", gain=-12),
    dict(t=b(12), kind="impact_light", gain=-13), dict(t=b(12, 2), kind="impact_light", gain=-13),
    dict(t=b(13, 2), kind="ui_click", gain=-10),
    dict(t=b(14), kind="impact_heavy", gain=-7),
    dict(t=b(15), kind="victory_sparkle", gain=-10),
    dict(t=b(16), kind="loot_reveal", gain=-8),
    dict(t=b(17, 2), kind="ui_confirm", gain=-12),
    dict(t=b(19, 2), kind="forge_clang", gain=-10),
    dict(t=b(22), kind="soft_swell", gain=-12),
    dict(t=b(25), kind="seal_chime", gain=-9),
    dict(t=b(27), kind="coin", gain=-12),
    dict(t=b(29), kind="tx_confirm", gain=-11),
    dict(t=b(30), kind="trailer_boom", gain=-11), dict(t=b(31), kind="trailer_boom", gain=-12), dict(t=b(32), kind="trailer_boom", gain=-11),
    *[dict(t=b(33 + i // 2, 2 * (i % 2)), kind="impact_heavy" if i % 2 == 0 else "impact_light", gain=-9) for i in range(8)],
    dict(t=b(37), kind="riser", dur=b(2), gain=-4),
    dict(t=b(39, 3), kind="reverse_swell", dur=BEAT, gain=-8),
    dict(t=b(40), kind="trailer_boom", gain=-7),
    dict(t=b(40), kind="impact_heavy", gain=-5),
    dict(t=b(41, 2), kind="victory_sparkle", gain=-9),
    dict(t=b(44), kind="title_hit_soft", gain=-8),
]


def export():
    data = dict(bpm=BPM, beat=BEAT, bar=BAR, length=LENGTH,
                sections=[dict(id=s[0], t0=b(s[1]), t1=b(s[2]), purpose=s[3], music=s[4]) for s in SECTIONS],
                shots=SHOTS, lower_thirds=LOWER_THIRDS, vo=VO, sfx=SFX)
    return data


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


if __name__ == "__main__":
    data = export()
    json.dump(data, open("timeline.json", "w"), indent=1, ensure_ascii=False)
    # sanity: contiguous shots, VO non-overlapping
    for a, c in zip(SHOTS, SHOTS[1:]):
        assert abs(a["t1"] - c["t0"]) < 1e-6, (a["id"], c["id"])
    assert abs(SHOTS[-1]["t1"] - LENGTH) < 1e-6
    for a, c in zip(VO, VO[1:]):
        assert a["t0"] + a["max"] <= c["t0"] + 1e-6, (a["id"], c["id"])
    words = sum(len(v["text"].split()) for v in VO)
    combat = sum(s["t1"] - s["t0"] for s in SHOTS if s["src"].startswith(("battle", "mochi_ult", "soot_ult", "m_", "boss")))
    print(f"shots={len(SHOTS)} vo_lines={len(VO)} vo_words={words} combat_seconds={combat:.1f} length={LENGTH}")
    for v in VO:
        print(f"{v['id']} {mmss(v['t0'])}-{mmss(v['t0'] + v['max'])}  {v['text']}")
