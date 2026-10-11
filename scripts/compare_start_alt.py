"""Paired comparison of the same seeds flown from 125 m (`montecarlo --wide`) and from 45 m. Standard library only.

Seeds share everything random up to the approach (sun, aim point, onboard-model noise, start offsets), so differences
are paired. Reports medians and a bootstrap interval of the paired difference, and the decision counts.

Usage: python scripts/compare_start_alt.py DIR_125M DIR_45M [--min-n 20]
"""
import glob
import json
import random
import statistics as st
import sys


def load(d):
    return {r["seed"]: r for r in (json.load(open(f)) for f in glob.glob(f"{d}/landing_*.json"))}


a_dir, b_dir = sys.argv[1], sys.argv[2]
A, B = load(a_dir), load(b_dir)
seeds = sorted(set(A) & set(B))
print(f"{len(A)} landings from 125 m, {len(B)} from 45 m, {len(seeds)} paired seeds")
if len(seeds) < 2:
    sys.exit("not enough paired seeds")
rng = random.Random(0)


def boot(diffs, f=st.median, n=2000):
    vals = sorted(f(rng.choices(diffs, k=len(diffs))) for _ in range(n))
    return vals[int(0.025 * n)], vals[int(0.975 * n)]


print("\nmetric                       125 m median   45 m median   paired diff (125 - 45) median [95% CI]")
for key, label in (("delivery_error_m", "delivery error [m]"), ("pred_vs_actual_m", "predicted vs actual [m]"),
                   ("nav_err_at_decision", "nav error at decision [m]")):
    x, y = [A[s][key] for s in seeds], [B[s][key] for s in seeds]
    d = [p - q for p, q in zip(x, y)]
    lo, hi = boot(d)
    print(f"{label:28s} {st.median(x):10.3f}   {st.median(y):10.3f}      {st.median(d):+.3f} [{lo:+.3f}, {hi:+.3f}]")

print("\ndecisions (counts of the paired seeds)                        125 m   45 m   differ")
for name in sorted(A[seeds[0]]["abort"]):
    if name not in B[seeds[0]]["abort"]:
        continue
    x, y = [A[s]["abort"][name] for s in seeds], [B[s]["abort"][name] for s in seeds]
    print(f"back-away, {name:20s}                        {sum(x):5d}  {sum(y):5d}  {sum(p != q for p, q in zip(x, y)):5d}")
x, y = [A[s]["unsafe_contact"] for s in seeds], [B[s]["unsafe_contact"] for s in seeds]
print(f"touching down would hit a hazard                              {sum(x):5d}  {sum(y):5d}  {sum(p != q for p, q in zip(x, y)):5d}")
print(f"\nmedian wall time per landing: {st.median(A[s].get('wall_s', 0) for s in seeds):.0f} s (125 m) vs "
      f"{st.median(B[s].get('wall_s', 0) for s in seeds):.0f} s (45 m)")
