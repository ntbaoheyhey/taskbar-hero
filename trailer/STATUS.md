# Trailer status / continuation notes

Updated 2026-11-20 23:50 UTC. Branch `claude/project-thread-5cwqjb`. Game build filmed: main `f8cd3aa`, with the route map,
ult-hint battle (`f_ch1_tap`) and chapter intro cards re-shot on `4699a30` (the v5-m2.17 tree), spec `finalH.json`.

## Done
- Structure, 96 BPM grid, 42 shots, 14 VO lines (`timeline.py`).
- Original score + SFX + mix chain (hall, ducking, stop-down gate, −14 LUFS / −1 dBTP, verified with ebur128).
- Temp VO (Kokoro) placed; recording script `VO-SCRIPT.md`.
- Titles in game fonts; real Fuji proof cards (`CHAIN-FACTS.md`). Captions sit in the lower third.
- **Final cut**: every shot is real footage from main `f8cd3aa` (no placeholders, no DRAFT tags).
  Capture specs: `finalA.json` (ch1 manual ult, boss 1, win), `finalB.json` (ch1 battle, bosses 2/3, boss win),
  `finalC.json` (UI: café, cats, route map, prepare, forge, economy), `finalD.json` (Chimney Comet finisher, 13.5 s),
  `finalE.json` (cats grid scrolling through all 12), `finalF.json`/`finalG.json` (Forge enhance, Bag equip on Clover).
- Deliverables in project files `trailer-2026-11-21/`:
  `lantern-cat-cafe-trailer_noVO.mp4`, `lantern-cat-cafe-trailer_tempVO.mp4` (+ `_light` preview),
  `VO-SCRIPT.md`, `for-editing/music_sfx_bed.wav` and `for-editing/temp_vo_guide.wav`.

## Rebuild the final picture
Game on :6301 from the main worktree (`node tools/v5int/run-chain-mode.mjs --fixture`), then from that worktree:
`TRAILER_REPO=$PWD node <this>/trailer/capture_shot.mjs <this>/trailer/finalA.json` (same for B–G).
Battles render ~1.25 s per frame on SwiftShader; A+B take ~35 min in parallel on 4 cores.
Then in `trailer/`: `python3 assemble.py --audio audio/mix_novo.wav --out out/trailer_review_noVO.mp4` and
`python3 assemble.py --reuse --audio audio/mix_vo.wav --out out/trailer_tempVO.mp4`.

## Waiting on the owner
- Voiceover recording (see `VO-SCRIPT.md`; three commands drop it in).
- Optional: a live sponsored seal on Fuji (needs café wallet funded + functions redeployed); the trailer
  already uses earlier real Fuji transactions, so this is not blocking.

## Known limits
- Music is rendered from a General MIDI soundfont; arrangement, humanising and the hall reverb carry it,
  but it is not a recorded orchestra.
- The Fuji proof section uses motion-graphic cards of real transactions, not a live in-game seal, because
  the fixture build has no funded sponsor wallet.
- Reddit reference post could not be opened (blocked from cloud fetch and the desktop browser pane).
- Chapter montage (s20) is the three in-game intro story cards (re-shot on 4699a30).
