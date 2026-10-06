import numpy as np

from touchdown.vision.evaluate import evaluate_frames, markdown

F_PX = 792.0   # ~ 640 px wide, 44 degree field of view


def frame(label, probs_haz, alt):
    """probs_haz: (H,W) P(not safe), split evenly between boulder and steep."""
    p = np.stack([1 - probs_haz, probs_haz / 2, probs_haz / 2]).astype(np.float32)
    return p, label.astype(np.uint8), alt


def scene(hazard_at_centre: bool):
    lab = np.zeros((120, 160), np.uint8)
    if hazard_at_centre:
        lab[50:70, 70:90] = 1
    else:
        lab[5:25, 5:25] = 1            # hazard far from the aim point
    return lab


def test_perfect_detector_scores_perfectly_and_bins_by_altitude():
    frames = []
    for centre in (True, False):
        lab = scene(centre)
        frames.append(frame(lab, (lab > 0).astype(float) * 0.95 + 0.02, 20.0))
        frames.append(frame(lab, (lab > 0).astype(float) * 0.95 + 0.02, 30.0))
    res = evaluate_frames(frames, F_PX)
    assert set(res) == {"10-22 m", "22-50 m"}
    low = res["10-22 m"]
    assert low["n_frames"] == 2 and low["false_safe_rate"] == 0.0
    z = [c for c in low["contact_zone"] if c["threshold"] == 0.5][0]
    assert z["recall"] == 1.0 and z["false_alarm_rate"] == 0.0 and z["frames_with_hazard"] == 1


def test_missed_hazard_shows_in_false_safe_and_zone_recall():
    lab = scene(True)
    res = evaluate_frames([frame(lab, np.full(lab.shape, 0.02), 5.0)], F_PX)["0-10 m"]
    assert res["false_safe_rate"] == 1.0
    assert [c for c in res["contact_zone"] if c["threshold"] == 0.5][0]["recall"] == 0.0


def test_lower_threshold_never_lowers_recall_and_never_lowers_false_alarms_rate():
    rng = np.random.default_rng(0)
    frames = []
    for i in range(6):
        lab = scene(i % 2 == 0)
        p = np.clip((lab > 0) * 0.5 + rng.random(lab.shape) * 0.5, 0, 1)
        frames.append(frame(lab, p, 8.0))
    res = evaluate_frames(frames, F_PX)["0-10 m"]
    rec = [s["hazard_recall"] for s in res["sweep"]]
    fa = [s["false_hazard_rate"] for s in res["sweep"]]
    assert rec == sorted(rec, reverse=True) and fa == sorted(fa, reverse=True)   # thresholds ascending
    assert "threshold sweep" in markdown({"0-10 m": res})


def test_out_of_range_altitude_is_skipped():
    lab = scene(True)
    assert evaluate_frames([frame(lab, np.zeros(lab.shape), 80.0)], F_PX) == {}
