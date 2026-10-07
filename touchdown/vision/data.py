"""Dataset for the rendered frames (see touchdown/dataset/generate.py)."""
import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageFilter
from torch.utils.data import Dataset


class HazardDataset(Dataset):
    """Frames of one split. train=True: random crop, flips, photometric jitter, blur and noise; else full frames."""

    def __init__(self, root: str | Path, split: "str | list[str]", train: bool = False, crop: int = 384,
                 max_items: int | None = None):
        self.root, self.train, self.crop = Path(root), train, crop
        rows = [json.loads(l) for l in open(self.root / "meta.jsonl")]
        splits = [split] if isinstance(split, str) else list(split)   # several splits can be combined for training
        self.rows = [r for r in rows if r["split"] in splits][:max_items]
        if not self.rows:
            raise FileNotFoundError(f"no frames for split '{split}' in {root}")

    def __len__(self) -> int:
        return len(self.rows)

    def load(self, i: int) -> tuple[np.ndarray, np.ndarray]:
        stem = self.rows[i]["frame"]
        img = Image.open(self.root / "images" / f"{stem}.png").convert("L")
        lab = np.array(Image.open(self.root / "labels" / f"{stem}.png"))
        return img, lab

    def __getitem__(self, i: int):
        img, lab = self.load(i)
        rng = np.random.default_rng()
        if self.train:
            if rng.random() < 0.3:
                img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))
            x = np.asarray(img, dtype=np.float32) / 255.0
            x = np.clip(x * rng.uniform(0.7, 1.3), 0, 1) ** rng.uniform(0.8, 1.25)
            x = np.clip(x + rng.normal(0, rng.uniform(0.0, 0.03), x.shape), 0, 1).astype(np.float32)
            h, w = x.shape
            c = self.crop
            r0, c0 = rng.integers(0, h - c + 1), rng.integers(0, w - c + 1)
            x, lab = x[r0:r0 + c, c0:c0 + c], lab[r0:r0 + c, c0:c0 + c]
            if rng.random() < 0.5:
                x, lab = x[:, ::-1], lab[:, ::-1]
            if rng.random() < 0.5:
                x, lab = x[::-1], lab[::-1]
            x, lab = np.ascontiguousarray(x), np.ascontiguousarray(lab)
        else:
            x = np.asarray(img, dtype=np.float32) / 255.0
        return torch.from_numpy(x)[None], torch.from_numpy(lab.astype(np.int64)), i

    def class_frequencies(self, n_classes: int = 3, sample: int = 200) -> np.ndarray:
        idx = np.linspace(0, len(self) - 1, min(sample, len(self))).astype(int)
        cnt = np.zeros(n_classes)
        for i in idx:
            _, lab = self.load(i)
            cnt += np.bincount(lab[lab != 255].ravel(), minlength=n_classes)[:n_classes]
        return cnt / cnt.sum()
