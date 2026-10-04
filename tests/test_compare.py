import numpy as np

from touchdown.analysis.compare_published import markdown_table, summarize, wilson


def fake(i, delivery, unsafe, abort_c, abort_s):
    return {"delivery_error_m": delivery, "pred_vs_actual_m": 0.04, "unsafe_contact": unsafe,
            "nav_err_at_matchpoint": 0.1, "nav_err_at_decision": 0.05, "nees_at_decision": 3.0, "contact_speed": 0.1,
            "abort": {"complete_baseline": abort_c, "stale_baseline": abort_s}}


def test_wilson_interval_sane():
    lo, hi = wilson(5, 100)
    assert 0.02 < lo < 0.05 < hi < 0.12
    assert wilson(0, 0)[0] != wilson(0, 0)[0]   # NaN


def test_summary_counts_and_table():
    R = [fake(0, 0.5, False, False, False), fake(1, 0.8, True, True, False),
         fake(2, 1.5, True, False, False), fake(3, 0.4, False, True, True)]
    s = summarize(R)
    assert s["delivery_error_m"]["within_1m"]["k"] == 3
    c = s["scenarios"]["complete_baseline"]
    assert c["abort"]["k"] == 2                       # runs 1 and 3
    assert c["unsafe_contact_when_proceeding"]["k"] == 1   # run 2: proceeded and unsafe
    assert c["needless_abort"]["k"] == 1              # run 3: aborted though safe
    assert c["safe_touchdown"]["k"] == 1              # run 0
    assert "| complete_baseline |" in markdown_table(s)
