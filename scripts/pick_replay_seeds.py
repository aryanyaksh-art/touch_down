"""Choose instructive seeds for the website replays from a folder of Monte Carlo landing JSON files.

Standard library only (it runs on any machine). Mirrors `pick_illustrative` in touchdown/analysis/export_replays.py but prefers the
clearest example of each outcome, not just the first one found.

Usage: python scripts/pick_replay_seeds.py DIR [--n-typical 3]
Prints the seeds, then the exact `--seeds` line to paste into notebooks/08_kaggle_replays.ipynb.
"""
import argparse
import glob
import json
import random


def load(d: str) -> list[dict]:
    out = []
    for f in sorted(glob.glob(f"{d}/landing_*.json")):
        r = json.load(open(f))
        r.pop("log", None)                      # frame logs are large and not needed to choose
        out.append(r)
    return out


def pick(R: list[dict], n_typical: int) -> list[tuple[int, str]]:
    used: set[int] = set()
    picks: list[tuple[int, str]] = []

    def first(pred, label, key=None):
        cand = [r for r in R if r["seed"] not in used and pred(r)]
        if not cand:
            return
        r = min(cand, key=key) if key else cand[0]
        used.add(r["seed"])
        picks.append((r["seed"], label))

    ab = lambda r, k: r["abort"].get(k, False)
    first(lambda r: not ab(r, "complete_baseline") and not r["unsafe_contact"], "Clean touchdown",
          key=lambda r: r["delivery_error_m"])
    first(lambda r: ab(r, "complete_baseline") and r["unsafe_contact"], "Justified back-away",
          key=lambda r: -r["p_hazard"]["complete_baseline"])
    first(lambda r: not ab(r, "stale_baseline") and r["unsafe_contact"] and ab(r, "stale_nn"), "Detector catches a missed boulder",
          key=lambda r: -r["p_hazard"].get("stale_nn", 0))
    first(lambda r: not ab(r, "stale_baseline") and r["unsafe_contact"] and not ab(r, "stale_nn"), "Missed hazard",
          key=lambda r: r["clearance_at_contact_m"])
    first(lambda r: ab(r, "stale_nn") and not ab(r, "stale_baseline") and not r["unsafe_contact"], "Needless back-away by the detector",
          key=lambda r: -r["p_hazard"].get("stale_nn", 0))
    rng = random.Random(0)
    rest = [r for r in R if r["seed"] not in used]
    for r in rng.sample(rest, min(n_typical, len(rest))):
        used.add(r["seed"])
        picks.append((r["seed"], "Typical descent"))
    return picks


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--n-typical", type=int, default=3)
    a = ap.parse_args()
    R = load(a.dir)
    print(f"{len(R)} landings read")
    P = pick(R, a.n_typical)
    for s, label in P:
        print(f"  seed {s:5d}  {label}")
    print("\nSEEDS = [" + ", ".join(str(s) for s, _ in P) + "]")
