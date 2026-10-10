"""Build the small data files the website reads from a folder of Monte Carlo landing JSON files.

Standard library only. Writes, into --out (normally web/public/data):
  landings.json  one small record per landing (seed, delivery error, contact point, outcome flags) for the dashboard scatter
It copies summary.json from --summary when given (produced by `python -m touchdown.analysis.compare_published DIR --out summary.json`).

Usage: python scripts/build_web_data.py DIR --out web/public/data [--summary DIR/summary.json]
"""
import argparse
import glob
import json
import os
import shutil

KEYS = ("seed", "delivery_error_m", "unsafe_contact", "contact_true", "abort")

ap = argparse.ArgumentParser()
ap.add_argument("dir")
ap.add_argument("--out", required=True)
ap.add_argument("--summary", default=None)
a = ap.parse_args()

rows = []
for f in sorted(glob.glob(f"{a.dir}/landing_*.json")):
    r = json.load(open(f))
    rows.append({k: r[k] for k in KEYS})
os.makedirs(a.out, exist_ok=True)
json.dump(rows, open(f"{a.out}/landings.json", "w"), separators=(",", ":"))
print(f"wrote {len(rows)} landings to {a.out}/landings.json ({os.path.getsize(f'{a.out}/landings.json') // 1024} KB)")
if a.summary:
    shutil.copy(a.summary, f"{a.out}/summary.json")
    print("copied summary.json")
