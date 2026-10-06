"""Task-aligned evaluation of the hazard detector (no retraining).

The headline per-pixel IoU over every frame mixes two things the landing does not care about: frames from altitudes
where the detector is not used (it runs below ~22 m in flight) and pixels far from the contact point. This reports:
  * metrics by altitude bin;
  * boulder recall by physical size, per bin;
  * a threshold sweep on P(not safe): hazard recall vs. false-hazard rate (the trade-off that sets needless back-aways);
  * a contact-zone metric: is there a hazard within `zone_m` of the aim point (image centre)? precision/recall per threshold.

The pure-NumPy core (`evaluate_frames`) is unit-tested; `evaluate_checkpoint` adds PyTorch inference.

Run: python -m touchdown.vision.evaluate --data DATASET --ckpt best.pt --split test --out eval.json
"""
import argparse
import json
from pathlib import Path

import numpy as np

from touchdown.vision.metrics import (CLASS_NAMES, IGNORE, boulder_recall_by_size, confusion, hazard_stats,
                                      iou_per_class, merge_size_tables)

ALT_BINS = ((0.0, 10.0), (10.0, 22.0), (22.0, 50.0))
THRESHOLDS = (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8)


def _zone_mask(h: int, w: int, radius_px: float) -> np.ndarray:
    yy, xx = np.ogrid[:h, :w]
    return (yy - (h - 1) / 2) ** 2 + (xx - (w - 1) / 2) ** 2 <= radius_px ** 2


class _Acc:
    def __init__(self, thresholds):
        self.cm = np.zeros((3, 3), np.int64)
        self.sizes = []
        self.n = 0
        self.thr = thresholds
        self.sweep = np.zeros((len(thresholds), 4), np.int64)   # tp, fp, fn, tn over valid pixels (hazard = not safe)
        self.zone = np.zeros((len(thresholds), 4), np.int64)    # frame-level tp, fp, fn, tn for the contact zone


def evaluate_frames(frames, f_px: float, alt_bins=ALT_BINS, thresholds=THRESHOLDS, zone_m: float = 1.0,
                    zone_min_frac: float = 0.01) -> dict:
    """frames: iterable of (probs (3,H,W) float, label (H,W) uint8 with 255 = ignore, alt_m).

    Contact-zone truth: at least `zone_min_frac` of the valid zone pixels are hazards. Prediction at threshold t: at
    least `zone_min_frac` of the zone pixels have P(not safe) > t."""
    accs = {b: _Acc(thresholds) for b in alt_bins}
    for probs, label, alt in frames:
        key = next((b for b in alt_bins if b[0] <= alt < b[1]), None)
        if key is None:
            continue
        a = accs[key]
        a.n += 1
        pred = probs.argmax(0).astype(np.uint8)
        a.cm += confusion(pred, label)
        m_per_px = alt / f_px
        a.sizes.append(boulder_recall_by_size(label, pred, m_per_px))
        valid = label != IGNORE
        truth_haz = (label > 0) & valid
        p_haz = 1.0 - probs[0]
        zone = _zone_mask(*label.shape, radius_px=max(zone_m / m_per_px, 8.0)) & valid
        zone_truth = zone.sum() > 0 and truth_haz[zone].sum() >= zone_min_frac * zone.sum()
        for i, t in enumerate(thresholds):
            ph = (p_haz > t) & valid
            a.sweep[i] += [int((ph & truth_haz).sum()), int((ph & ~truth_haz & valid).sum()),
                           int((~ph & truth_haz).sum()), int((~ph & ~truth_haz & valid).sum())]
            zone_pred = zone.sum() > 0 and ph[zone].sum() >= zone_min_frac * zone.sum()
            a.zone[i] += [int(zone_pred and zone_truth), int(zone_pred and not zone_truth),
                          int((not zone_pred) and zone_truth), int((not zone_pred) and not zone_truth)]
    out = {}
    for b, a in accs.items():
        if a.n == 0:
            continue
        iou = iou_per_class(a.cm)
        sweep = []
        for t, (tp, fp, fn, tn) in zip(thresholds, a.sweep):
            sweep.append({"threshold": t, "hazard_recall": tp / max(tp + fn, 1), "false_hazard_rate": fp / max(fp + tn, 1),
                          "hazard_iou": tp / max(tp + fp + fn, 1)})
        zone = []
        for t, (tp, fp, fn, tn) in zip(thresholds, a.zone):
            zone.append({"threshold": t, "recall": tp / max(tp + fn, 1), "false_alarm_rate": fp / max(fp + tn, 1),
                         "precision": tp / max(tp + fp, 1), "frames_with_hazard": int(tp + fn), "frames_clear": int(fp + tn)})
        out[f"{b[0]:.0f}-{b[1]:.0f} m"] = {
            "n_frames": a.n, "miou": float(np.nanmean(iou)), "iou": dict(zip(CLASS_NAMES, map(float, iou))),
            **hazard_stats(a.cm), "boulder_recall_by_size": merge_size_tables(a.sizes), "sweep": sweep, "contact_zone": zone}
    return out


def evaluate_checkpoint(ckpt: str, data: str, split: str, f_px: float, limit: int | None = None) -> dict:
    from PIL import Image
    from touchdown.vision.infer import HazardNet
    net = HazardNet(ckpt)
    root = Path(data)
    rows = [json.loads(l) for l in open(root / "meta.jsonl")]
    rows = [r for r in rows if r["split"] == split][:limit]

    def gen():
        for r in rows:
            img = np.array(Image.open(root / "images" / f"{r['frame']}.png").convert("L"))
            lab = np.array(Image.open(root / "labels" / f"{r['frame']}.png"))
            _, probs = net.predict(img)
            yield probs, lab, r["alt_m"]

    return evaluate_frames(gen(), f_px)


def markdown(res: dict) -> str:
    lines = ["| Altitude | Frames | mIoU | Boulder IoU | Hazard pixels called safe | Safe called hazard |", "|---|---|---|---|---|---|"]
    for k, v in res.items():
        lines.append(f"| {k} | {v['n_frames']} | {v['miou']:.2f} | {v['iou']['boulder']:.2f} | "
                     f"{v['false_safe_rate']:.1%} | {v['false_hazard_rate']:.1%} |")
    for k, v in res.items():
        lines += ["", f"**{k}: boulder recall by size** " + ", ".join(
            f"{b['lo']}-{b['hi']} m: {b['recall']:.0%} (n={b['n']})" for b in v["boulder_recall_by_size"] if b["n"]),
            "", f"**{k}: threshold sweep and contact-zone (hazard within 1 m of the aim point)**", "",
            "| P(not safe) > | pixel hazard recall | pixel false-hazard | zone recall | zone false alarms |", "|---|---|---|---|---|"]
        for s, z in zip(v["sweep"], v["contact_zone"]):
            lines.append(f"| {s['threshold']:.1f} | {s['hazard_recall']:.0%} | {s['false_hazard_rate']:.0%} | "
                         f"{z['recall']:.0%} | {z['false_alarm_rate']:.0%} |")
    return "\n".join(lines)


if __name__ == "__main__":
    import yaml
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--split", default="test")
    ap.add_argument("--out", default=None)
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    cam = yaml.safe_load(open(Path(__file__).resolve().parents[2] / "configs" / "camera.yaml"))
    f_px = (cam["render_px"][0] / 2) / np.tan(np.radians(cam["hfov_deg"]) / 2)
    res = evaluate_checkpoint(a.ckpt, a.data, a.split, f_px, a.limit)
    print(markdown(res))
    if a.out:
        json.dump(res, open(a.out, "w"), indent=1)
