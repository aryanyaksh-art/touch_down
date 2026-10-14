"""List the landings in one or more result folders whose Matchpoint burn failed (seed 14 of the 125 m runs: no ballistic arc to
contact existed, the targeting solve diverged and the spacecraft flew away). Stdlib only.

A landing counts as failed when `burn_converged` is false, it hit the 4,000 s timeout, or its delivery error is above 1,000 m.
Usage: python scripts/find_failures.py DIR [DIR ...]            list them
       python scripts/find_failures.py DIR [DIR ...] --move     also move each failed JSON into DIR/superseded/ so that a
                                                                re-run of the same notebook flies those seeds again
"""
import argparse
import glob
import json
import os
import shutil

ap = argparse.ArgumentParser()
ap.add_argument("dirs", nargs="+")
ap.add_argument("--move", action="store_true", help="move failed landing files into <dir>/superseded/ (kept, not deleted)")
a = ap.parse_args()

total = 0
for d in a.dirs:
    files = sorted(glob.glob(os.path.join(d, "landing_*.json")))
    bad = []
    for f in files:
        r = json.load(open(f))
        why = []
        if r.get("burn_converged") is False:
            why.append("burn_converged false")
        if r.get("timeout"):
            why.append("timeout")
        if r.get("delivery_error_m", 0) > 1000:
            why.append(f"delivery {r['delivery_error_m']:.3g} m")
        if why:
            bad.append((r["seed"], f, "; ".join(why), r.get("matchpoint_alt_true")))
    print(f"{d}: {len(files)} landings, {len(bad)} failed")
    for seed, f, why, alt in bad:
        print(f"  seed {seed}: {why}; Matchpoint at {alt if alt is None else round(alt, 1)} m")
        if a.move:
            os.makedirs(os.path.join(d, "superseded"), exist_ok=True)
            shutil.move(f, os.path.join(d, "superseded", os.path.basename(f)))
    total += len(bad)
print(f"total failed: {total}")
