"""Summarise descents flown from Checkpoint over the wide terrain (`montecarlo --wide`). Standard library only.

Prints, per landing, the Matchpoint altitude actually reached and the delivery numbers, and across landings the
navigation error and the number of NFT landmarks used by altitude band (the part of the descent that the 45 m runs
never covered).

Usage: python scripts/wide_report.py DIR
"""
import glob
import json
import statistics as st
import sys

BANDS = ((100, 1e9), (54, 100), (22, 54), (5, 22))

rows = [json.load(open(f)) for f in sorted(glob.glob(f"{sys.argv[1]}/landing_*.json"))]
print(f"{len(rows)} landings")
print("seed  mp_alt  nav_err@mp  nav_err@dec  delivery  pred-vs-actual  frames  wall_s  abort(complete)")
for r in rows:
    print(f"{r['seed']:4d}  {r.get('matchpoint_alt_true', float('nan')):6.1f}  {r.get('nav_err_at_matchpoint', float('nan')):9.3f}  "
          f"{r['nav_err_at_decision']:10.3f}  {r['delivery_error_m']:8.2f}  {r['pred_vs_actual_m']:13.3f}  {r['n_frames']:6d}  "
          f"{r.get('wall_s', 0):6.0f}  {r['abort']['complete_baseline']}")
print()
print("by altitude band (true altitude): frames, median nav error [m], median landmarks used, frames with no NFT update")
for lo, hi in BANDS:
    e, u, none = [], [], 0
    for r in rows:
        for f in r["log"]:
            if lo <= f["alt"] < hi:
                e.append(f["err"])
                u.append(f["used"])
                none += f["used"] == 0
    if e:
        print(f"{lo:>4.0f}-{min(hi, 999):>3.0f} m  n={len(e):4d}  err {st.median(e):7.3f} (max {max(e):7.3f})  used {st.median(u):4.1f}  no-update {none}")
