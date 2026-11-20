"""Summarize measured gates and fail visibly on any missing fixture or failed limit."""
import json
import re
import sys
from pathlib import Path

phase, perf_name, metrics_name, tests_name = sys.argv[1:]
root = Path(__file__).resolve().parents[2]
p = root / "reports/astra-enemy-light"
exhibit = root / "docs/astra-enemy-light-2026-11-21"
load = lambda loc: json.loads(loc.read_text())
metrics = load(p / metrics_name)
ids = set(load(p/"runtime.json"))
expected = ids | {x+"-phase2" for x in ("yarn-giant","rain-spool","pantry-crown")}
perf = load(p / perf_name)
judge = load(p / ("judge-"+phase+".json"))
ab = load(exhibit / ("blind-"+phase) / "result.json")
tests = (p / "logs" / tests_name).read_text()
rows = list(metrics.values())
assert len(rows) == 16
checks = dict(
    G1=set(metrics) == expected and all((exhibit/"battle"/(key+"-"+mode+".webp")).exists()
                                         for key in expected for mode in ("before","after")),
    G2=all(r["changedCatBoxPixels"]==0 for r in rows),
    G3=all(r["outsideAddedOver2"]==r["outsideBodyPassOver2"]==0 for r in rows),
    G4=all(abs(r["luminanceChangePct"]) <= 12 and r['litSideTowardsKey'] for r in rows),
    G5=ab["wins"] >= 10,
    G6=all(perf["scenarios"][f]["green"] for f in ("wave3","boss")) and perf["allMapBytes"]<24000000,
    G7=bool(re.search(r"Test Files\s+\d+ passed \(\d+\)",tests)) and
       "error TS" not in (p/"logs"/("type-"+phase+"2.log")).read_text(),
    G8=judge["off"]==judge["on"] and len(judge["on"])==2 and all(row["result"]=="party" for row in judge["on"]),
)
summary = {key:"PASS" if passed else "FAIL" for key,passed in checks.items()}
state = load(p/"STATE.json")
state.setdefault("gates",{})[phase]=summary
state["perf"]=perf
state["step"]="verified" if all(checks.values()) else "diagnose"
(p/"STATE.json").write_text(json.dumps(state,indent=2)+"\n")
print(summary)
if not all(checks.values()):
    sys.exit(1)
