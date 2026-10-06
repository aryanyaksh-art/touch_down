import numpy as np

from touchdown.analysis.sensitivity import geometry_sweep, markdown, outcome_rates, threshold_sweep
from touchdown.sim.assets import assets_from_dtm
from tests.test_landing_sim import synthetic_site


def fake_landings(site, n=30, seed=0):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        xy = site.target_xy + rng.normal(0, 1.2, 2)
        out.append({"contact_true": xy.tolist(), "contact_pred": (xy + rng.normal(0, 0.05, 2)).tolist(),
                    "contact_pred_sigma": [0.05, 0.05], "unsafe_contact": bool(rng.random() < 0.2),
                    "p_hazard": {"complete_baseline": float(rng.random()), "stale_baseline": float(rng.random())}})
    return out


def test_outcome_rates_partition_the_landings():
    abort = np.array([True, True, False, False, False])
    unsafe = np.array([True, False, True, False, False])
    r = outcome_rates(abort, unsafe)
    assert r["abort"]["k"] == 2 and r["unsafe_when_proceeding"]["k"] == 1
    assert r["needless_abort"]["k"] == 1 and r["safe_touchdown"]["k"] == 2
    assert sum(r[k]["k"] for k in ("unsafe_when_proceeding", "needless_abort", "safe_touchdown")) + \
        int((abort & unsafe).sum()) == 5


def test_higher_threshold_never_increases_aborts():
    R = fake_landings(assets_from_dtm(synthetic_site(), margin_m=8.0))
    rows = [r for r in threshold_sweep(R) if r["scenario"] == "complete_baseline"]
    aborts = [r["abort"]["k"] for r in rows]
    assert aborts == sorted(aborts, reverse=True)


def test_geometry_sweep_runs_and_larger_head_aborts_more():
    site = assets_from_dtm(synthetic_site(), margin_m=8.0)
    R = fake_landings(site)
    rows = geometry_sweep(R, site, radii=(0.15, 1.0), stale_cutoffs=(0.8,))
    small = [r for r in rows if r["head_radius_m"] == 0.15 and r["scenario"] == "complete_baseline"][0]
    big = [r for r in rows if r["head_radius_m"] == 1.0 and r["scenario"] == "complete_baseline"][0]
    assert big["abort"]["k"] >= small["abort"]["k"]
    assert "complete_baseline" in markdown(threshold_sweep(R), rows)
