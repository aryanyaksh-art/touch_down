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


def test_mcnemar_exact_known_values():
    from touchdown.analysis.compare_published import mcnemar_exact
    assert mcnemar_exact(0, 5) == 2 / 32           # one tail is 1/32, doubled
    assert mcnemar_exact(3, 3) == 1.0
    assert mcnemar_exact(0, 0) == 1.0


def _paired(unsafe, abort_base, abort_nn):
    return {"unsafe_contact": unsafe, "abort": {"stale_baseline": abort_base, "stale_nn": abort_nn}}


def test_detector_effect_counts_avoided_hazards_and_extra_false_alarms():
    from touchdown.analysis.compare_published import detector_effect
    # 3 hazards the detector catches; 2 safe landings it needlessly aborts; 5 untouched safe landings
    R = ([_paired(True, False, True)] * 3 + [_paired(False, False, True)] * 2 + [_paired(False, False, False)] * 5)
    e = detector_effect(R, "stale", n_boot=500)
    assert (e["avoided"], e["introduced"]) == (3, 0)
    assert e["hazard_contacts_baseline"] == 3 and e["hazard_contacts_with_detector"] == 0
    assert abs(e["mcnemar_p"] - 0.25) < 1e-9       # exact: 2 * (1/8)
    assert e["needless_baseline"] == 0 and e["needless_with_detector"] == 2
    assert abs(e["extra_needless_per_hazard_avoided"] - 2 / 3) < 1e-9
    assert e["hazard_rate_change"] < 0


def test_summary_includes_intervals_and_detector_section():
    R = [{**fake(i, 0.3 + 0.01 * i, False, False, False),
          "abort": {"complete_baseline": False, "stale_baseline": False, "complete_nn": False, "stale_nn": False}} for i in range(20)]
    s = summarize(R)
    lo, hi = s["delivery_error_m"]["median_ci95"]
    assert lo <= s["delivery_error_m"]["median"] <= hi
    assert set(s["detector_effect"]) == {"complete", "stale"}
    assert "Detector effect, paired" in markdown_table(s)
