"""List the seeds where the spacecraft would touch a hazard, from a folder of Monte Carlo landing JSON files.

Standard library only. These are the only landings where the detector can earn its keep, so the false-alarm ablation
(notebooks/11_kaggle_ablation.ipynb, `--nn-ablation`) is re-run on exactly them: with random seeds the benefit side is
empty (the first 300 seeds contained no hazard contact at all).

Usage: python scripts/pick_hazard_seeds.py DIR
Prints counts and a `SEED_LIST = [...]` line to paste into the notebook.
"""
import glob
import json
import sys

d = sys.argv[1]
rows = []
for f in sorted(glob.glob(f"{d}/landing_*.json")):
    r = json.load(open(f))
    rows.append((r["seed"], bool(r["unsafe_contact"]), r["abort"]))
unsafe = [s for s, u, _ in rows if u]
missed_stale = [s for s, u, ab in rows if u and not ab["stale_baseline"]]
missed_complete = [s for s, u, ab in rows if u and not ab["complete_baseline"]]
print(f"{len(rows)} landings; unsafe contact would happen in {len(unsafe)}")
print(f"baseline proceeds into a hazard: complete map {len(missed_complete)}, stale map {len(missed_stale)}")
print("SEED_LIST =", sorted(unsafe))
