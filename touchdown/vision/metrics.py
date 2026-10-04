"""Segmentation metrics (NumPy only). Classes: 0 safe, 1 boulder, 2 steep; label 255 = ignore.

For landing, the costly error is calling hazardous ground safe, so we report that rate separately from IoU."""
import numpy as np
from scipy import ndimage

IGNORE = 255
CLASS_NAMES = ["safe", "boulder", "steep"]


def confusion(pred: np.ndarray, label: np.ndarray, n: int = 3) -> np.ndarray:
    """cm[true, pred], ignoring label == 255."""
    m = label != IGNORE
    idx = label[m].astype(np.int64) * n + pred[m].astype(np.int64)
    return np.bincount(idx, minlength=n * n).reshape(n, n)


def iou_per_class(cm: np.ndarray) -> np.ndarray:
    tp = np.diag(cm).astype(float)
    denom = cm.sum(0) + cm.sum(1) - np.diag(cm)
    return np.where(denom > 0, tp / np.maximum(denom, 1), np.nan)


def hazard_stats(cm: np.ndarray) -> dict:
    """Binary view: hazard = boulder or steep. false_safe = hazardous pixels predicted safe."""
    haz_true = cm[1:, :].sum()
    haz_as_safe = cm[1:, 0].sum()
    safe_true = cm[0, :].sum()
    safe_as_haz = cm[0, 1:].sum()
    tp = cm[1:, 1:].sum()
    return {
        "false_safe_rate": float(haz_as_safe / max(haz_true, 1)),      # miss rate on hazards
        "false_hazard_rate": float(safe_as_haz / max(safe_true, 1)),   # needless caution
        "hazard_iou": float(tp / max(haz_true + safe_as_haz, 1)),
    }


def boulder_recall_by_size(label: np.ndarray, pred: np.ndarray, m_per_px: float,
                           bins=(0.2, 0.5, 1.0, 2.0, 5.0, 100.0), min_frac: float = 0.5) -> list[dict]:
    """A true boulder component counts as detected if >= min_frac of its pixels are predicted boulder.
    Size = equivalent-circle diameter in metres, from the (approximate) metres-per-pixel of the frame."""
    comp, n = ndimage.label(label == 1)
    out = [{"lo": bins[i], "hi": bins[i + 1], "n": 0, "detected": 0} for i in range(len(bins) - 1)]
    if n == 0:
        return out
    idx = np.arange(1, n + 1)
    areas = ndimage.sum(np.ones_like(comp), comp, idx)
    hit = ndimage.sum((pred == 1).astype(float), comp, idx) / np.maximum(areas, 1)
    # skip components cut by the frame edge or too small to measure
    d = 2.0 * np.sqrt(areas / np.pi) * m_per_px
    for dd, h in zip(d, hit):
        for b in out:
            if b["lo"] <= dd < b["hi"]:
                b["n"] += 1
                b["detected"] += int(h >= min_frac)
    return out


def merge_size_tables(tables: list[list[dict]]) -> list[dict]:
    out = [dict(b, n=0, detected=0) for b in tables[0]]
    for t in tables:
        for o, b in zip(out, t):
            o["n"] += b["n"]
            o["detected"] += b["detected"]
    for o in out:
        o["recall"] = o["detected"] / o["n"] if o["n"] else float("nan")
    return out
