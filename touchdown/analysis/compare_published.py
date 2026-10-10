"""Summarize Monte Carlo landings and compare with published OSIRIS-REx numbers (docs/references.md).

Run: python -m touchdown.analysis.compare_published DIR [--out summary.json]
"""
import argparse
import glob
import json
from math import comb
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


def bootstrap_ci(x: np.ndarray, stat, n_boot: int = 4000, seed: int = 0) -> list[float]:
    """Percentile bootstrap 95% interval of `stat(x)` (resampling landings)."""
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(x), size=(n_boot, len(x)))
    v = np.array([stat(x[i]) for i in idx])
    return [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def mcnemar_exact(b: int, c: int) -> float:
    """Two-sided exact McNemar p-value for discordant pair counts b and c (binomial test of b vs c at p=0.5)."""
    n = b + c
    if n == 0:
        return 1.0
    tail = sum(comb(n, i) for i in range(min(b, c) + 1)) / 2 ** n
    return float(min(1.0, 2 * tail))


def detector_effect(R: list[dict], prior: str, n_boot: int = 4000, seed: int = 0) -> dict | None:
    """Paired effect of adding the detector to one prior map. The same flights are judged with and without it, so
    outcomes are paired: `avoided` = hazard contacts only the baseline suffers, `introduced` = only the detector run
    suffers. Also the extra needless back-aways and their ratio to hazards avoided, with bootstrap intervals."""
    base, nn = f"{prior}_baseline", f"{prior}_nn"
    sub = [r for r in R if base in r["abort"] and nn in r["abort"]]
    if not sub:
        return None
    un = np.array([r["unsafe_contact"] for r in sub])
    ab_b = np.array([r["abort"][base] for r in sub])
    ab_n = np.array([r["abort"][nn] for r in sub])
    haz_b, haz_n = ~ab_b & un, ~ab_n & un
    need_b, need_n = ab_b & ~un, ab_n & ~un
    avoided, introduced = int((haz_b & ~haz_n).sum()), int((~haz_b & haz_n).sum())

    def stats(i):
        a = int((haz_b[i] & ~haz_n[i]).sum()) - int((~haz_b[i] & haz_n[i]).sum())
        e = int(need_n[i].sum()) - int(need_b[i].sum())
        return a, e

    rng = np.random.default_rng(seed)
    n = len(sub)
    d_haz, d_need, ratio = [], [], []
    for _ in range(n_boot):
        i = rng.integers(0, n, n)
        a, e = stats(i)
        d_haz.append(-a / n)                       # change in hazard-contact rate (negative = detector helps)
        d_need.append(e / n)                       # change in needless back-away rate
        if a > 0:
            ratio.append(e / a)
    ci = lambda v: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]
    net_avoided = avoided - introduced
    return {
        "n": n,
        "hazard_contacts_baseline": int(haz_b.sum()), "hazard_contacts_with_detector": int(haz_n.sum()),
        "avoided": avoided, "introduced": introduced, "mcnemar_p": mcnemar_exact(avoided, introduced),
        "hazard_rate_change": float(-net_avoided / n), "hazard_rate_change_ci95": ci(d_haz),
        "needless_baseline": int(need_b.sum()), "needless_with_detector": int(need_n.sum()),
        "needless_rate_change": float((need_n.sum() - need_b.sum()) / n), "needless_rate_change_ci95": ci(d_need),
        "extra_needless_per_hazard_avoided": (float((need_n.sum() - need_b.sum()) / net_avoided) if net_avoided > 0 else None),
        "extra_needless_per_hazard_avoided_ci95": ci(ratio) if len(ratio) > n_boot // 2 else None,
    }


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
                              "median_ci95": bootstrap_ci(d, np.median), "p95_ci95": bootstrap_ci(d, lambda v: np.percentile(v, 95)),
                              "within_1m": rate(int((d <= 1.0).sum()), n), "published_within_m": PUBLISHED["delivery_within_m"]},
        "pred_vs_actual_cm": {"median": float(np.median(pa)), "p95": float(np.percentile(pa, 95)),
                               "median_ci95": bootstrap_ci(pa, np.median), "published_cm": PUBLISHED["pred_vs_actual_cm"]},
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
    out["detector_effect"] = {p: e for p in ("complete", "stale") if (e := detector_effect(R, p)) is not None}
    return out


def _pr(r: dict) -> str:
    return f"{r['rate']:.1%} ({r['ci95'][0]:.1%} to {r['ci95'][1]:.1%})"


def markdown_table(s: dict) -> str:
    de, pa = s["delivery_error_m"], s["pred_vs_actual_cm"]
    lines = [
        f"Landings: {s['n_landings']}",
        "",
        "| Quantity | TouchDown | Published |",
        "|---|---|---|",
        f"| Delivery error, median / 95th pct | {de['median']:.2f} m ({de['median_ci95'][0]:.2f} to {de['median_ci95'][1]:.2f}) / "
        f"{de['p95']:.2f} m ({de['p95_ci95'][0]:.2f} to {de['p95_ci95'][1]:.2f}) | within ~{de['published_within_m']:.0f} m (one real landing) |",
        f"| Fraction within 1 m | {_pr(de['within_1m'])} | 1 of 1 |",
        f"| Predicted vs. actual contact, median / 95th pct | {pa['median']:.1f} cm ({pa['median_ci95'][0]:.1f} to {pa['median_ci95'][1]:.1f}) / "
        f"{pa['p95']:.1f} cm | {pa['published_cm']} cm |",
        f"| Back-away rate (complete prior map, baseline) | {s['scenarios']['complete_baseline']['abort']['rate']:.1%} | <{s['published_abort_probability_pre_tag']:.0%} predicted pre-TAG |",
        "",
        "| Scenario | Abort | Unsafe contact when proceeding | Needless abort | Safe touchdown |",
        "|---|---|---|---|---|",
    ]
    for k, v in s["scenarios"].items():
        lines.append(f"| {k} | {_pr(v['abort'])} | {_pr(v['unsafe_contact_when_proceeding'])} | "
                     f"{_pr(v['needless_abort'])} | {_pr(v['safe_touchdown'])} |")
    if s.get("detector_effect"):
        lines += ["", "Detector effect, paired (same flights with and without the detector; 95% bootstrap intervals):", "",
                  "| Prior map | Hazard contacts: baseline -> detector | Avoided / introduced | McNemar p | Needless back-aways: baseline -> detector | "
                  "Extra needless per hazard avoided |", "|---|---|---|---|---|---|"]
        for k, e in s["detector_effect"].items():
            r = e["extra_needless_per_hazard_avoided"]
            rc = e["extra_needless_per_hazard_avoided_ci95"]
            ratio = "n/a" if r is None else (f"{r:.1f} ({rc[0]:.1f} to {rc[1]:.1f})" if rc else f"{r:.1f}")
            lines.append(f"| {k} | {e['hazard_contacts_baseline']} -> {e['hazard_contacts_with_detector']} | "
                         f"{e['avoided']} / {e['introduced']} | {e['mcnemar_p']:.3f} | "
                         f"{e['needless_baseline']} -> {e['needless_with_detector']} | {ratio} |")
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
