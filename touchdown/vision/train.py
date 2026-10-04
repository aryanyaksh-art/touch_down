"""Train and evaluate the hazard U-Net.

Usage (Colab):  python -m touchdown.vision.train --data DATASET --out RUN --epochs 30
Reports, on the val and the REAL-terrain test split: per-class IoU, false-safe rate (hazard called safe), and boulder
recall by physical size. The test split is the real Nightingale surface, never trained on.
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import yaml
from torch.utils.data import DataLoader

from touchdown.vision.data import HazardDataset
from touchdown.vision.metrics import (CLASS_NAMES, boulder_recall_by_size, confusion, hazard_stats, iou_per_class,
                                      merge_size_tables)
from touchdown.vision.unet import UNet, n_params

ROOT = Path(__file__).resolve().parents[2]


def seg_loss(logits, target, weight):
    ce = F.cross_entropy(logits, target, weight=weight, ignore_index=255)
    p = logits.softmax(1)
    valid = (target != 255).unsqueeze(1)
    tgt = F.one_hot(target.clamp(max=2), 3).permute(0, 3, 1, 2).float() * valid
    p = p * valid
    inter = (p * tgt).sum((0, 2, 3))
    dice = 1 - (2 * inter + 1) / (p.sum((0, 2, 3)) + tgt.sum((0, 2, 3)) + 1)
    return ce + dice.mean()


@torch.no_grad()
def evaluate(model, ds: HazardDataset, device, f_px: float, bs: int = 4) -> dict:
    model.eval()
    cm = np.zeros((3, 3), dtype=np.int64)
    size_tables = []
    dl = DataLoader(ds, batch_size=bs, shuffle=False, num_workers=2)
    for x, y, idx in dl:
        pred = model(x.to(device)).argmax(1).cpu().numpy().astype(np.uint8)
        for p, lab, i in zip(pred, y.numpy().astype(np.uint8), idx.tolist()):
            cm += confusion(p, lab)
            m_per_px = ds.rows[i]["alt_m"] / f_px
            size_tables.append(boulder_recall_by_size(lab, p, m_per_px))
    iou = iou_per_class(cm)
    return {"iou": dict(zip(CLASS_NAMES, map(float, iou))), "miou": float(np.nanmean(iou)),
            **hazard_stats(cm), "boulder_recall_by_size": merge_size_tables(size_tables), "confusion": cm.tolist()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--bs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--base", type=int, default=24)
    ap.add_argument("--max-items", type=int, default=None)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    cam = yaml.safe_load(open(ROOT / "configs" / "camera.yaml"))
    f_px = (cam["render_px"][0] / 2) / np.tan(np.radians(cam["hfov_deg"]) / 2)

    train = HazardDataset(a.data, "train", train=True, max_items=a.max_items)
    val = HazardDataset(a.data, "val", max_items=a.max_items)
    freq = train.class_frequencies()
    weight = torch.tensor(1.0 / np.sqrt(freq), dtype=torch.float32, device=device)
    weight = weight / weight.mean()
    print("class frequencies", freq.round(3), "weights", weight.cpu().numpy().round(2), flush=True)

    model = UNet(base=a.base).to(device)
    print("params", n_params(model), "device", device, flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    dl = DataLoader(train, batch_size=a.bs, shuffle=True, num_workers=2, drop_last=True)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * len(dl))
    scaler = torch.amp.GradScaler(enabled=device.type == "cuda")
    history, best = [], -1.0
    for ep in range(a.epochs):
        model.train()
        t0, tot = time.time(), 0.0
        for x, y, _ in dl:
            x, y = x.to(device), y.to(device)
            with torch.autocast(device.type, enabled=device.type == "cuda"):
                loss = seg_loss(model(x), y, weight)
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            sched.step()
            tot += loss.item()
        v = evaluate(model, val, device, f_px)
        history.append({"epoch": ep, "loss": tot / len(dl), "val_miou": v["miou"], "val_false_safe": v["false_safe_rate"]})
        print(f"epoch {ep:2d} loss {tot / len(dl):.3f} val mIoU {v['miou']:.3f} false-safe {v['false_safe_rate']:.3f} "
              f"({time.time() - t0:.0f}s)", flush=True)
        if v["miou"] > best:
            best = v["miou"]
            torch.save({"model": model.state_dict(), "base": a.base}, out / "best.pt")
    json.dump(history, open(out / "history.json", "w"), indent=1)

    model.load_state_dict(torch.load(out / "best.pt", map_location=device)["model"])
    results = {"val": evaluate(model, val, device, f_px)}
    try:
        test = HazardDataset(a.data, "test")
        results["test_real_nightingale"] = evaluate(model, test, device, f_px)
    except FileNotFoundError:
        print("no test split found; skipping real-terrain evaluation")
    json.dump(results, open(out / "results.json", "w"), indent=1)
    for k, r in results.items():
        print(k, "mIoU", round(r["miou"], 3), "IoU", {c: round(v, 3) for c, v in r["iou"].items()},
              "false-safe", round(r["false_safe_rate"], 3))


if __name__ == "__main__":
    main()
