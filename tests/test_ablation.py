import numpy as np

from touchdown.analysis.ablation import markdown, summarize
from touchdown.sim.landing import NN_ABLATION, nn_variant_mask


def test_higher_evidence_threshold_flags_fewer_cells():
    L = np.zeros((20, 20), np.float32)
    L[2:6, 2:6] = 10.0     # strong blob
    L[12, 12] = 0.5        # one weak cell
    assert nn_variant_mask(L, 0.0).sum() == 17
    assert nn_variant_mask(L, 1.0).sum() == 16
    assert nn_variant_mask(L, 20.0).sum() == 0


def test_min_blob_removes_small_isolated_regions_only():
    L = np.zeros((20, 20), np.float32)
    L[2:6, 2:6] = 3.0      # 16 connected cells
    L[12, 12] = 3.0        # isolated cell
    m = nn_variant_mask(L, 0.0, 9)
    assert m[2:6, 2:6].all() and not m[12, 12]
    # diagonal neighbours count as connected
    L2 = np.zeros((10, 10), np.float32)
    for i in range(9):
        L2[i, i] = 1.0
    assert nn_variant_mask(L2, 0.0, 9).sum() == 9


def test_ablation_includes_the_shipped_rule_first():
    assert NN_ABLATION[0] == ("L0", 0.0, 0)
    assert len({n for n, _, _ in NN_ABLATION}) == len(NN_ABLATION)


def _result(unsafe, base_abort, variant_abort, cells=100):
    ab = {"complete_baseline": base_abort, "stale_baseline": base_abort}
    return {
        "unsafe_contact": unsafe,
        "abort": ab,
        "nn_variants": {
            "L0": {"abort": {"complete": True, "stale": True}, "flagged_cells": cells},
            "L4": {"abort": {"complete": variant_abort, "stale": variant_abort}, "flagged_cells": cells // 4},
        },
    }


def test_summary_counts_hazards_and_needless_back_aways_per_variant():
    # 10 flights: 2 unsafe (baseline misses both), 8 safe. L0 aborts everything (avoids both hazards, 8 needless);
    # L4 aborts only the two unsafe ones.
    R = [_result(True, False, True) for _ in range(2)] + [_result(False, False, False) for _ in range(8)]
    s = summarize(R, n_boot=50)
    assert s["n"] == 10
    l0, l4 = s["variants"]["L0"]["stale"], s["variants"]["L4"]["stale"]
    assert l0["hazard_contacts_baseline"] == 2 and l0["hazard_contacts"] == 0 and l0["needless"] == 10 - 2
    assert l4["hazard_contacts"] == 0 and l4["needless"] == 0
    assert l4["extra_needless_per_hazard_avoided"] == 0.0
    assert "L4" in markdown(s)
