"""Summarize Monte Carlo landings and compare with published OSIRIS-REx numbers (docs/references.md).

Run: python -m touchdown.analysis.compare_published DIR [--out summary.json]
"""
import argparse
import glob
import json
from pathlib import Path

import numpy as np

PUBLISHED = {
    "delivery_within_m": 1.0,           # TAG contact within ~1 m of target (Lauretta/Olds; VERIFY exact figure)
    "pred_vs_actual_cm": 3.5,           # NFT predicted vs actual contact (Olds et al.)
    "abort_probability_pre_tag": 0.06,  # pre-TAG predicted chance of a back-away (NASA)
}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (float(c - h), float(c + h))


def load_results(d: str | Path) -> list[dict]:
    return [json.load(open(f)) for f in sorted(glob.glob(str(Path(d) / "landing_*.json")))]


def rate(k: int, n: int) -> dict:
    lo, hi = wilson(k, n)
    return {"k": int(k), "n": int(n), "rate": k / n if n else float("nan"), "ci95": [lo, hi]}


def summarize(R: list[dict]) -> dict:
    n = len(R)
    d = np.array([r["delivery_error_m"] for r in R])
    pa = np.array([r["pred_vs_actual_m"] for r in R]) * 100.0   # cm
    unsafe = np.array([r["unsafe_contact"] for r in R])
    out = {
        "n_landings": n,
        "delivery_error_m": {"median": float(np.median(d)), "mean": float(d.mean()), "p90": float(np.percentile(d, 90)),
                              "p95": float(np.percentile(d, 95)), "max": float(d.max()),
                              "within_1m": rate(int((d <= 1.0).sum()), n), "published_within_m": PUBLISHED["delivery_within_m"]},
        "pred_vs_actual_cm": {"median": float(np.median(pa)), "p95": float(np.percentile(pa, 95)),
                               "published_cm": PUBLISHED["pred_vs_actual_cm"]},
        "nav_err_at_matchpoint_m_median": float(np.median([r["nav_err_at_matchpoint"] for r in R if "nav_err_at_matchpoint" in r])),
        "nav_err_at_decision_m_median": float(np.median([r["nav_err_at_decision"] for r in R])),
        "nees_at_decision_mean": float(np.mean([r["nees_at_decision"] for r in R])),   # chi-square, 3 dof: expect ~3
        "contact_speed_mps_median": float(np.median([r["contact_speed"] for r in R])),
        "unsafe_if_never_abort": rate(int(unsafe.sum()), n),
        "scenarios": {},
        "published_abort_probability_pre_tag": PUBLISHED["abort_probability_pre_tag"],
    }
    for name in R[0]["abort"]:
        sub = [r for r in R if name in r["abort"]]
        ab = np.array([r["abort"][name] for r in sub])
        un = np.array([r["unsafe_contact"] for r in sub])
        m = len(sub)
        out["scenarios"][name] = {
            "abort": rate(int(ab.sum()), m),
            "unsafe_contact_when_proceeding": rate(int((~ab & un).sum()), m),       # the failure that matters
            "needless_abort": rate(int((ab & ~un).sum()), m),                       # aborted although contact would be safe
            "safe_touchdown": rate(int((~ab & ~un).sum()), m),
        }
    return out


def markdown_table(s: dict) -> str:
    de, pa = s["delivery_error_m"], s["pred_vs_actual_cm"]
    lines = [
        f"Landings: {s['n_landings']}",
        "",
        "| Quantity | TouchDown | Published |",
        "|---|---|---|",
        f"| Delivery error, median / 95th pct | {de['median']:.2f} m / {de['p95']:.2f} m | within ~{de['published_within_m']:.0f} m (one real landing) |",
        f"| Fraction within 1 m | {de['within_1m']['rate']:.1%} | 1 of 1 |",
        f"| Predicted vs. actual contact, median / 95th pct | {pa['median']:.1f} cm / {pa['p95']:.1f} cm | {pa['published_cm']} cm |",
        f"| Back-away rate (complete prior map, baseline) | {s['scenarios']['complete_baseline']['abort']['rate']:.1%} | <{s['published_abort_probability_pre_tag']:.0%} predicted pre-TAG |",
        "",
        "| Scenario | Abort | Unsafe contact when proceeding | Needless abort | Safe touchdown |",
        "|---|---|---|---|---|",
    ]
    for k, v in s["scenarios"].items():
        lines.append(f"| {k} | {v['abort']['rate']:.1%} | {v['unsafe_contact_when_proceeding']['rate']:.1%} | "
                     f"{v['needless_abort']['rate']:.1%} | {v['safe_touchdown']['rate']:.1%} |")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    s = summarize(load_results(a.dir))
    print(markdown_table(s))
    if a.out:
        json.dump(s, open(a.out, "w"), indent=1)
