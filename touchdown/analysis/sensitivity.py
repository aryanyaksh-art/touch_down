"""Sensitivity of the Monte Carlo conclusions to parameters that are assumptions, not mission values.

Everything here is recomputed from saved landings, without re-flying:
  1. abort-probability threshold (all four scenarios, from the stored hazard probabilities);
  2. sampler-head radius and the 'stale map' cutoff (baseline scenarios only: the neural-detector scenarios depend
     on the live hazard grid, which is not stored, so they cannot be recomputed offline).

Run: python -m touchdown.analysis.sensitivity MC_DIR [--out sensitivity.json] [--dtm path]
"""
import argparse
import json
from pathlib import Path

import numpy as np

from touchdown.analysis.compare_published import load_results, rate
from touchdown.gnc.backaway import clearance_map, hazard_probability
from touchdown.sim.assets import SiteAssets, stale_mask


def outcome_rates(abort: np.ndarray, unsafe: np.ndarray) -> dict:
    n = len(abort)
    return {"abort": rate(int(abort.sum()), n),
            "unsafe_when_proceeding": rate(int((~abort & unsafe).sum()), n),
            "needless_abort": rate(int((abort & ~unsafe).sum()), n),
            "safe_touchdown": rate(int((~abort & ~unsafe).sum()), n)}


def threshold_sweep(R: list[dict], thresholds=(0.01, 0.02, 0.05, 0.10, 0.20, 0.30, 0.50)) -> list[dict]:
    """Vary the abort threshold using the stored per-landing hazard probabilities (all scenarios)."""
    unsafe = np.array([r["unsafe_contact"] for r in R])
    rows = []
    for name in R[0]["p_hazard"]:
        sub = [r for r in R if name in r["p_hazard"]]
        p = np.array([r["p_hazard"][name] for r in sub])
        u = np.array([r["unsafe_contact"] for r in sub])
        for t in thresholds:
            rows.append({"scenario": name, "p_abort": t, **outcome_rates(p > t, u)})
    return rows


def _cell(arr: np.ndarray, xy, res: float):
    ny, nx = arr.shape
    c, r = int(np.floor(xy[0] / res + nx / 2)), int(np.floor(xy[1] / res + ny / 2))
    return (r, c) if (0 <= r < ny and 0 <= c < nx) else None


def recompute_baseline(R: list[dict], site: SiteAssets, head_radius_m: float, stale_cutoff_m: float,
                       p_abort: float = 0.10, seed: int = 0) -> dict:
    """Re-decide the baseline scenarios for a different head radius and stale-map cutoff.

    Contact covariance is rebuilt from the stored 1-sigma per axis (cross-correlation was not stored; a small
    approximation). 'Unsafe' is re-evaluated at the true contact point with the same head radius."""
    res = site.dtm.res_m
    clr_stale = clearance_map(stale_mask(site.hazards, stale_cutoff_m), res)
    out = {}
    unsafe = []
    pc, ps = [], []
    for r in R:
        cell = _cell(site.clr_true, r["contact_true"], res)
        unsafe.append(True if cell is None else bool(site.clr_true[cell] <= head_radius_m))
        s = np.asarray(r["contact_pred_sigma"], float)
        mean = np.asarray(r["contact_pred"], float)
        pc.append(hazard_probability(site.clr_complete, res, mean, np.diag(s ** 2), head_radius_m, seed=seed))
        ps.append(hazard_probability(clr_stale, res, mean, np.diag(s ** 2), head_radius_m, seed=seed))
    unsafe = np.array(unsafe)
    out["complete_baseline"] = outcome_rates(np.array(pc) > p_abort, unsafe)
    out["stale_baseline"] = outcome_rates(np.array(ps) > p_abort, unsafe)
    return out


def geometry_sweep(R: list[dict], site: SiteAssets, radii=(0.15, 0.30, 0.50, 1.00),
                   stale_cutoffs=(0.5, 0.8, 1.5, 2.5, 4.0)) -> list[dict]:
    rows = []
    for rad in radii:
        for cut in stale_cutoffs:
            res = recompute_baseline(R, site, rad, cut)
            for name, rates in res.items():
                rows.append({"head_radius_m": rad, "stale_cutoff_m": cut, "scenario": name, **rates})
    return rows


def markdown(rows_thr: list[dict], rows_geo: list[dict]) -> str:
    f = lambda r: f"{r['rate']:.1%}"
    lines = ["### Abort threshold (all scenarios)", "",
             "| Scenario | Threshold | Back-away | Hit hazard | Needless back-away | Safe touchdown |", "|---|---|---|---|---|---|"]
    for r in rows_thr:
        lines.append(f"| {r['scenario']} | {r['p_abort']:.2f} | {f(r['abort'])} | {f(r['unsafe_when_proceeding'])} | "
                     f"{f(r['needless_abort'])} | {f(r['safe_touchdown'])} |")
    if rows_geo:
        lines += ["", "### Head radius and stale-map cutoff (baseline scenarios, threshold 0.10)", "",
                  "| Head radius (m) | Stale cutoff (m) | Scenario | Back-away | Hit hazard | Needless back-away |", "|---|---|---|---|---|---|"]
        for r in rows_geo:
            lines.append(f"| {r['head_radius_m']} | {r['stale_cutoff_m']} | {r['scenario']} | {f(r['abort'])} | "
                         f"{f(r['unsafe_when_proceeding'])} | {f(r['needless_abort'])} |")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out", default=None)
    ap.add_argument("--dtm", default=None)
    a = ap.parse_args()
    R = load_results(a.dir)
    thr = threshold_sweep(R)
    geo = []
    from touchdown.bennu.paths import data_dir
    from touchdown.sim.assets import load_assets
    dtm = Path(a.dtm) if a.dtm else data_dir() / "nightingale_dtm_5cm.npz"
    if dtm.exists():
        geo = geometry_sweep(R, load_assets(dtm))
    print(f"{len(R)} landings\n")
    print(markdown(thr, geo))
    if a.out:
        json.dump({"n": len(R), "threshold": thr, "geometry": geo}, open(a.out, "w"), indent=1)
