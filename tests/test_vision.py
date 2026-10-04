import numpy as np
import pytest

from touchdown.vision.metrics import (IGNORE, boulder_recall_by_size, confusion, hazard_stats, iou_per_class,
                                      merge_size_tables)


def test_confusion_ignores_255_and_iou():
    lab = np.array([[0, 0, 1, 1], [2, 2, IGNORE, IGNORE]], np.uint8)
    pred = np.array([[0, 1, 1, 1], [2, 0, 1, 1]], np.uint8)
    cm = confusion(pred, lab)
    assert cm.sum() == 6
    iou = iou_per_class(cm)
    assert np.isclose(iou[0], 1 / 3) and np.isclose(iou[1], 2 / 3) and np.isclose(iou[2], 0.5)


def test_hazard_stats_false_safe():
    cm = np.array([[8, 1, 1], [2, 6, 0], [1, 0, 4]])   # rows true, cols pred
    s = hazard_stats(cm)
    assert np.isclose(s["false_safe_rate"], 3 / 13)    # 2 boulder + 1 steep predicted safe, of 13 hazard pixels
    assert np.isclose(s["false_hazard_rate"], 2 / 10)


def test_boulder_recall_by_size_bins():
    lab = np.zeros((100, 100), np.uint8)
    lab[10:30, 10:30] = 1                 # 20x20 px
    lab[60:64, 60:64] = 1                 # 4x4 px
    pred = np.zeros_like(lab)
    pred[10:30, 10:30] = 1                # large one found, small one missed
    t = boulder_recall_by_size(lab, pred, m_per_px=0.05)   # 20 px -> ~1.1 m, 4 px -> ~0.23 m
    m = merge_size_tables([t])
    big = [b for b in m if b["lo"] <= 1.0 < b["hi"] or b["lo"] <= 1.1 < b["hi"]]
    assert sum(b["n"] for b in m) == 2 and sum(b["detected"] for b in m) == 1
    assert [b for b in m if b["lo"] == 0.2][0]["recall"] == 0.0


def test_unet_forward_and_training_step():
    torch = pytest.importorskip("torch")
    from touchdown.vision.train import seg_loss
    from touchdown.vision.unet import UNet
    m = UNet(base=8)
    x = torch.rand(2, 1, 64, 96)
    y = torch.randint(0, 3, (2, 64, 96))
    y[:, :4] = 255
    out = m(x)
    assert out.shape == (2, 3, 64, 96)
    loss = seg_loss(out, y, torch.ones(3))
    loss.backward()
    assert torch.isfinite(loss) and all(p.grad is not None for p in m.parameters())
