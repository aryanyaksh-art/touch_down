from touchdown.analysis.calibration import CHI2_95_3DOF, markdown, summarize


def _row(nees, err=0.05, pva=0.03, abort=False):
    return {"nees_at_decision": nees, "nav_err_at_decision": err, "pred_vs_actual_m": pva, "abort": {"complete_baseline": abort}}


def test_consistent_filter_has_mean_near_three_and_high_coverage():
    rows = [_row(v) for v in (0.5, 1.0, 2.0, 3.0, 4.0, 5.0)]
    s = summarize(rows)
    assert abs(s["nees_mean"] - 2.58) < 0.01
    assert s["coverage_95"] == 1.0


def test_overconfident_filter_shows_low_coverage():
    rows = [_row(v) for v in (2.0, 9.0, 12.0, 15.0)]
    s = summarize(rows)
    assert s["nees_mean"] > 3 and s["coverage_95"] == 0.25
    assert CHI2_95_3DOF == 7.815
    assert "| run |" in markdown({"run": s})
