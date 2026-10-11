"""Hard-negative mining for the hazard detector (extension; the real mission had no onboard detector).

A "hard negative" here is a frame where the detector calls safe ground a hazard with confidence. Those false alarms
are what turn into needless back-aways in the closed loop (docs/validation.md 6e), so retraining should concentrate
on them. This module finds them; `touchdown/vision/train.py` then oversamples those frames (`--hard`) and adds a
pixel-level loss on the hardest safe pixels (`--hn-lambda`).

What counts as a false alarm follows the live hazard map: the fused evidence only reacts to confident, spatially
coherent hazard calls, so a frame is scored by the number of confident false-hazard pixels that sit in connected
blobs of at least `min_blob_px` pixels (isolated pixels are noise the map fusion already ignores).

The pure-NumPy core (`false_alarm_stats`, `select_hard`) is unit-tested; `mine_checkpoint` adds PyTorch inference.

Run: python -m touchdown.vision.mining --data DATASET --ckpt best.pt --splits train real_train pool --out hard.json
"""
import argparse
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

IGNORE = 255


def false_alarm_stats(probs: np.ndarray, label: np.ndarray, thr: float = 0.5, min_blob_px: int = 64) -> dict:
    """probs (3,H,W) float, label (H,W) uint8 (0 safe, 1 boulder, 2 steep, 255 ignore).

    fp_px: safe pixels with P(not safe) > thr. fp_blob_px: the part of those in 8-connected blobs of at least
    min_blob_px pixels. safe_px: all valid safe pixels (the denominator)."""
    valid = label != IGNORE
    safe = (label == 0) & valid
    fp = ((1.0 - probs[0]) > thr) & safe
    blob_px = 0
    if fp.any():
        lab, n = ndimage.label(fp, structure=np.ones((3, 3), int))
        sizes = np.bincount(lab.ravel())[1:]
        blob_px = int(sizes[sizes >= min_blob_px].sum())
    return {"fp_px": int(fp.sum()), "fp_blob_px": blob_px, "safe_px": int(safe.sum())}


def select_hard(scores: dict[str, dict], top_frac: float = 0.3, min_blob_px: int = 1) -> list[str]:
    """Frame stems of the hardest negatives: the `top_frac` of frames ranked by fp_blob_px, only those above the minimum."""
    ranked = sorted(scores, key=lambda s: (-scores[s]["fp_blob_px"], s))
    k = int(round(top_frac * len(ranked)))
    return [s for s in ranked[:k] if scores[s]["fp_blob_px"] >= min_blob_px]


def random_control(scores: dict[str, dict], hard: list[str], seed: int = 0) -> list[str]:
    """The control for `hard`: the same number of frames FROM EACH SPLIT, drawn at random from that split's candidates.

    Stratifying by split matters: hard frames come mostly from unseen (pool) terrains, so an unstratified random draw
    would give the control less new data and confound "hard" with "new"."""
    rng = np.random.default_rng(seed)
    need: dict[str, int] = {}
    for s in hard:
        need[scores[s]["split"]] = need.get(scores[s]["split"], 0) + 1
    out: list[str] = []
    for split, k in sorted(need.items()):
        stems = sorted(s for s in scores if scores[s]["split"] == split)
        out += rng.choice(stems, size=min(k, len(stems)), replace=False).tolist()
    return sorted(out)


def mine_checkpoint(ckpt: str, data: str, splits: list[str], thr: float = 0.5, min_blob_px: int = 64,
                    max_alt_m: float = 22.0, limit: int | None = None) -> dict[str, dict]:
    """Score every frame of `splits` with the detector. Frames above `max_alt_m` are skipped: the detector only runs
    in flight below nn_max_alt_m, so false alarms from higher views do not matter."""
    from PIL import Image
    from touchdown.vision.infer import HazardNet
    net = HazardNet(ckpt)
    root = Path(data)
    rows = [json.loads(l) for l in open(root / "meta.jsonl")]
    rows = [r for r in rows if r["split"] in splits and r["alt_m"] <= max_alt_m][:limit]
    out = {}
    for i, r in enumerate(rows):
        img = np.array(Image.open(root / "images" / f"{r['frame']}.png").convert("L"))
        lab = np.array(Image.open(root / "labels" / f"{r['frame']}.png"))
        _, probs = net.predict(img)
        out[r["frame"]] = {**false_alarm_stats(probs, lab, thr, min_blob_px), "split": r["split"], "alt_m": r["alt_m"]}
        if i % 500 == 0:
            print(f"mined {i}/{len(rows)}", flush=True)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--splits", nargs="+", default=["train", "real_train", "pool"])
    ap.add_argument("--top-frac", type=float, default=0.3)
    ap.add_argument("--thr", type=float, default=0.5)
    ap.add_argument("--min-blob-px", type=int, default=64)
    ap.add_argument("--out", required=True, help="writes this file (hard stems) and <out>.scores.json (all scores)")
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    scores = mine_checkpoint(a.ckpt, a.data, a.splits, a.thr, a.min_blob_px, limit=a.limit)
    hard = select_hard(scores, a.top_frac)
    json.dump({"hard": hard, "n_scored": len(scores), "top_frac": a.top_frac, "thr": a.thr,
               "min_blob_px": a.min_blob_px}, open(a.out, "w"), indent=1)
    json.dump(scores, open(a.out + ".scores.json", "w"))
    by_split = {}
    for s in hard:
        by_split[scores[s]["split"]] = by_split.get(scores[s]["split"], 0) + 1
    tot = sum(v["fp_blob_px"] for v in scores.values())
    top = sum(scores[s]["fp_blob_px"] for s in hard)
    print(f"scored {len(scores)} frames; {len(hard)} hard (by split: {by_split}); "
          f"they hold {top / max(tot, 1):.0%} of all confident false-alarm blob pixels")
