import numpy as np
import pytest

from touchdown.vision.compare import false_hazard_at_recall, markdown
from touchdown.vision.mining import false_alarm_stats, random_control, select_hard


def _probs(p_haz):
    p_haz = np.asarray(p_haz, np.float32)
    return np.stack([1 - p_haz, p_haz / 2, p_haz / 2])


def test_false_alarm_stats_counts_only_confident_safe_pixels_in_blobs():
    lab = np.zeros((40, 40), np.uint8)
    lab[0:4] = 255                       # ignored rows never count
    lab[30:36, 30:36] = 1                # a real boulder: detections there are correct
    p = np.full(lab.shape, 0.05)
    p[10:20, 10:20] = 0.9                # 100-pixel confident false alarm on safe ground
    p[25, 5] = 0.9                       # isolated single-pixel false alarm
    p[30:36, 30:36] = 0.9                # true detection
    p[0:4] = 0.9                         # ignored
    s = false_alarm_stats(_probs(p), lab, thr=0.5, min_blob_px=64)
    assert s["fp_px"] == 101 and s["fp_blob_px"] == 100
    assert s["safe_px"] == (36 * 40) - 36


def test_false_alarm_stats_zero_when_detector_is_right():
    lab = np.zeros((20, 20), np.uint8)
    lab[5:10, 5:10] = 2
    p = (lab > 0).astype(float) * 0.95 + 0.02
    s = false_alarm_stats(_probs(p), lab)
    assert s["fp_px"] == 0 and s["fp_blob_px"] == 0


def test_select_hard_ranks_by_blob_pixels_and_drops_clean_frames():
    scores = {f"f{i}": {"fp_blob_px": v} for i, v in enumerate([0, 500, 0, 120, 900, 0, 0, 30, 0, 0])}
    assert select_hard(scores, top_frac=0.3) == ["f4", "f1", "f3"]
    assert select_hard(scores, top_frac=0.9) == ["f4", "f1", "f3", "f7"]    # frames with no false alarm are never "hard"


def test_random_control_matches_the_hard_sets_split_mix_and_is_reproducible():
    scores = {f"p{i}": {"fp_blob_px": i, "split": "pool"} for i in range(40)}
    scores.update({f"t{i}": {"fp_blob_px": i, "split": "train"} for i in range(40)})
    hard = ["p39", "p38", "p37", "p36", "p35", "t39"]            # 5 pool + 1 train
    a, b = random_control(scores, hard, seed=3), random_control(scores, hard, seed=3)
    assert a == b and len(set(a)) == 6
    assert sum(s.startswith("p") for s in a) == 5 and sum(s.startswith("t") for s in a) == 1
    assert a != random_control(scores, hard, seed=4)


def test_false_hazard_at_recall_interpolates_and_reports_na_out_of_range():
    sweep = [{"hazard_recall": 0.5, "false_hazard_rate": 0.05}, {"hazard_recall": 0.9, "false_hazard_rate": 0.25}]
    assert np.isclose(false_hazard_at_recall(sweep, 0.7), 0.15)
    assert false_hazard_at_recall(sweep, 0.95) is None and false_hazard_at_recall(sweep, 0.4) is None


def test_compare_markdown_has_one_row_per_detector():
    ev = {n: {"0-10 m": {"sweep": [{"hazard_recall": 0.5, "false_hazard_rate": f}, {"hazard_recall": 0.95, "false_hazard_rate": 2 * f}],
                         "miou": 0.5, "iou": {"boulder": 0.6}}} for n, f in (("v2", 0.2), ("hn", 0.1))}
    md = markdown(ev)
    assert "| v2 |" in md and "| hn |" in md and "recall 80%" in md


def test_hard_negative_loss_looks_only_at_the_worst_safe_pixels():
    torch = pytest.importorskip("torch")
    from touchdown.vision.train import hard_negative_loss
    logits = torch.zeros(1, 3, 10, 10)
    logits[0, 1, 0, 0] = 6.0             # one safe pixel confidently called boulder
    target = torch.zeros(1, 10, 10, dtype=torch.long)
    top = hard_negative_loss(logits, target, top_frac=0.01)
    avg = hard_negative_loss(logits, target, top_frac=1.0)
    assert top > 4 * avg                # the worst pixel dominates the top-k term but not the plain average
    target[:] = 1                        # no safe pixels: term is exactly zero
    assert float(hard_negative_loss(logits, target)) == 0.0
