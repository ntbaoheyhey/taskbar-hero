"""Generate VO-SCRIPT.md (the recording script) from timeline.py, so the script,
the cut and the music can never drift apart.   python3 gen_script.py"""
from timeline import VO, SHOTS, SECTIONS, b, LENGTH

VI = {  # meaning of each line in Vietnamese, to help the read (not to be recorded)
    "vo01": "Mỗi việc còn dang dở... đều đi về đâu đó.",
    "vo02": "Ngoài kia, chúng rối lại thành một khối.",
    "vo03": "Vẫn còn một quán cà phê giữ ngọn đèn lồng sáng... và những chú mèo quyết giữ nó sáng mãi.",
    "vo04": "Chọn đường đi của bạn: trận đánh, cuộc gặp kỳ lạ, kho báu... và một con boss ở cuối đường.",
    "vo05": "Mèo của bạn tự chiến đấu. Bạn quyết định lúc nào tung chiêu tối thượng.",
    "vo06": "Mỗi chiến thắng có thể rơi trang bị mới. Trang bị, rèn mạnh hơn, rồi tiến sang chương tiếp theo.",
    "vo07": "Ở đây, sức mạnh có được nhờ chơi. Không bao giờ mua được.",
    "vo08": "Nhưng khi một món đồ có ý nghĩa với bạn, hãy niêm phong nó trên Avalanche. Giờ nó thật sự là của bạn.",
    "vo09": "Giữ lại, hoặc giao dịch trên Relic Market.",
    "vo10": "Mỗi lần niêm phong và giao dịch đều đốt YARN, một token có nguồn cung cố định. Phần thưởng rút ra được điều tiết theo lượng đốt đó.",
    "vo11": "Nhưng Tangle đang lớn dần.",
    "vo12": "Thắp đèn lồng lên.",
    "vo13": "Lantern Cat Café. Một game nhập vai thẻ bài ấm áp... nơi ánh sáng bạn bảo vệ là của bạn.",
    "vo14": "Chơi miễn phí ngay trên trình duyệt.",
}
SAY = {  # pronunciation help
    "vo03": "café = 'ka-FAY'",
    "vo08": "Avalanche = 'AV-uh-lanch'",
    "vo10": "YARN = the word 'yarn' (not spelled out)",
    "vo13": "Lantern Cat Café = 'LAN-tern cat ka-FAY'; RPG = 'R-P-G'",
}


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def shot_at(t):
    for s in SHOTS:
        if s["t0"] <= t < s["t1"]:
            return s
    return SHOTS[-1]


def section_at(t):
    for sid, a, z, purpose, music in SECTIONS:
        if b(a) <= t < b(z):
            return sid, purpose, music
    return SECTIONS[-1][0], SECTIONS[-1][3], SECTIONS[-1][4]


out = []
w = out.append
w("# Lantern Cat Café: trailer voiceover script\n")
w(f"Length **{mmss(LENGTH)}** · 14 lines · about 150 words · music at 96 BPM (one bar = 2.5 s). "
  "Generated from `trailer/timeline.py`; if a time changes there, run `python3 gen_script.py` again.\n")
w("## How to record (10 minutes)\n")
w("1. Quiet room with soft furnishings (a closet full of clothes is ideal). Phone or USB mic 15–20 cm from your mouth, slightly off-axis to avoid pops.")
w("2. Record **WAV, 48 kHz, 24-bit** if you can (an iPhone Voice Memo .m4a also works). Peaks around −12 dBFS; never clipping.")
w("3. Record **each line as its own file**, named exactly `vo01.wav`, `vo02.wav` … `vo14.wav` (`.m4a` is fine). Do 2–3 takes of each and keep the best; or record one continuous take named `take.wav` with a clear **1-second pause between lines** and the script splits it.")
w("4. Read the line, not the clock. Each line has a **slot** (the longest it may run). Natural pace is about 2.7 words per second; every line below fits that with room to spare.")
w("5. Put the files in `trailer/vo/final/` (or send them to me) and run the two commands in *Inserting your voice*.\n")
w("Overall voice: a warm storyteller who is a little excited to tell you about this place. Smile on the warm lines, drop lower and slower for the Tangle, whisper the one line in the silence. Never a hard-sell announcer.\n")
w("## The script, timed\n")
w("| # | Starts | Slot | Picture | Line | Delivery | Sync cue |")
w("|---|---|---|---|---|---|---|")
for v in VO:
    s = shot_at(v["t0"] + 0.01)
    pic = s.get("note") or (s.get("text") or {}).get("main") or s["src"]
    w(f"| {v['id'][2:]} | {mmss(v['t0'])} | {v['max']:.1f}s | {pic} | **{v['text']}** | {v['tone']} Stress: *{v['emphasis']}*. | {v['cue']} |")
w("")
w("## Line by line (read this while recording)\n")
cur = None
for v in VO:
    sid, purpose, music = section_at(v["t0"])
    if sid != cur:
        cur = sid
        w(f"### {sid.replace('_', ' ').title()}: {purpose}\n")
        w(f"Music: {music}\n")
    w(f"**{v['id'].upper()}** · starts {mmss(v['t0'])} · must end by {mmss(v['t0'] + v['max'])}\n")
    w(f"> {v['text']}\n")
    w(f"- Delivery: {v['tone']}")
    w(f"- Emphasis: *{v['emphasis']}*")
    w(f"- Cue: {v['cue']}")
    if v["id"] in SAY:
        w(f"- Say: {SAY[v['id']]}")
    w(f"- Nghĩa: {VI[v['id']]}\n")
w("## The whole read, with pauses\n")
w("`/` = short breath, `//` = full pause (the music plays here).\n")
txt = []
for a, c in zip(VO, VO[1:] + [None]):
    txt.append(a["text"])
    if c:
        gap = c["t0"] - (a["t0"] + a["max"])
        txt.append("//" if c["t0"] - a["t0"] > a["max"] + 1.5 else "/")
w("> " + " ".join(txt) + "\n")
w("## Inserting your voice\n")
w("```sh\ncd trailer\npython3 place_vo.py vo/final audio/vo_final.wav     # checks each line fits its slot\n"
  "python3 mix.py --vo audio/vo_final.wav --out audio/mix_final.wav\n"
  "python3 assemble.py --reuse --audio audio/mix_final.wav --out out/lantern-cat-cafe-trailer.mp4\n```\n")
w("`place_vo.py` prints each line's length against its slot. A line marked TOO LONG will overlap the next cue: "
  "re-record it a touch faster, or nudge its `t0`/`max` in `timeline.py` (the music and picture do not move). "
  "The music ducks under your voice automatically; nothing else needs rebuilding.\n")
w("## Facts behind the economy lines\n")
w("Every economy claim is something the game actually does, shown with real Fuji transactions (see `CHAIN-FACTS.md`). "
  "The script never mentions earnings, prices or returns, and the end card says the tokens are testnet only.\n")
open("VO-SCRIPT.md", "w").write("\n".join(out))
print("VO-SCRIPT.md", len("\n".join(out)), "chars")
