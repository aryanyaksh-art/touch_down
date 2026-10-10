"""Is the navigation filter's covariance honest? Summarise NEES at the decision point for one or more Monte Carlo folders.

NEES = e' P^-1 e for the 3-D position error at the 5 m decision. For a consistent filter it is chi-square with 3 degrees of
freedom: mean 3, and 95% of landings below 7.81. A filter that is over-confident has mean NEES above 3 and coverage below 95%.
Standard library only.

Usage: python -m touchdown.analysis.calibration DIR [DIR ...]
"""
import glob
import json
import statistics
import sys

CHI2_95_3DOF = 7.815          # 95th percentile of chi-square with 3 degrees of freedom
EXPECTED_MEAN = 3.0


def summarize(rows: list[dict]) -> dict:
    nees = [r["nees_at_decision"] for r in rows]
    n = len(nees)
    return {
        "n": n,
        "nees_mean": statistics.fmean(nees),
        "nees_median": statistics.median(nees),
        "coverage_95": sum(v < CHI2_95_3DOF for v in nees) / n,
        "nav_err_decision_m_median": statistics.median(r["nav_err_at_decision"] for r in rows),
        "contact_pred_vs_actual_cm_median": 100 * statistics.median(r["pred_vs_actual_m"] for r in rows),
        "backaway_rate": sum(r["abort"]["complete_baseline"] for r in rows) / n,
    }


def load(d: str) -> list[dict]:
    rows = []
    for f in sorted(glob.glob(f"{d}/landing_*.json")):
        r = json.load(open(f))
        r.pop("log", None)
        rows.append(r)
    return rows


def markdown(named: dict[str, dict]) -> str:
    lines = ["| Config | n | NEES mean (expect 3) | NEES median | Within 95% bound (expect 95%) | Nav error at decision, median | "
             "Contact pred. vs actual, median | Back-away |", "|---|---|---|---|---|---|---|---|"]
    for k, s in named.items():
        lines.append(f"| {k} | {s['n']} | {s['nees_mean']:.1f} | {s['nees_median']:.1f} | {s['coverage_95']:.0%} | "
                     f"{s['nav_err_decision_m_median'] * 100:.1f} cm | {s['contact_pred_vs_actual_cm_median']:.1f} cm | "
                     f"{s['backaway_rate']:.1%} |")
    return "\n".join(lines)


if __name__ == "__main__":
    out = {d: summarize(load(d)) for d in sys.argv[1:]}
    print(markdown(out))
