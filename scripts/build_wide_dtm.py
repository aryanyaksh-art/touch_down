"""Build the wide truth terrain (tile + global model + synthetic outer boulders) for descents from Checkpoint (125 m).

Needs the 5 cm tile DTM (scripts/build_dtm.py) and the NASA SVS global OBJ (scripts/fetch_data.py --global). Writes
`nightingale_wide_5cm.npz` into the data directory, plus `wide_preview.png` (hillshade, tile outlined) and prints the
diagnostics that matter: how far the real 5 cm tile and the 88 cm global model disagree where they overlap.

Usage: python scripts/build_wide_dtm.py [--pad 56] [--seed 0] [--out-dir DIR]
"""
import argparse
import json
import time
from pathlib import Path

import numpy as np

from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import GLOBAL_OBJ, data_dir
from touchdown.bennu.shape import load_obj
from touchdown.bennu.widedtm import build_wide_dtm


def hillshade(z: np.ndarray, res: float, az_deg: float = 315.0, el_deg: float = 40.0) -> np.ndarray:
    gy, gx = np.gradient(z.astype(np.float64), res)
    slope, aspect = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.clip(np.sin(el) * np.cos(slope) + np.cos(el) * np.sin(slope) * np.cos(az - aspect), 0, 1)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pad", type=float, default=56.0, help="metres of terrain added on each side of the tile")
    ap.add_argument("--seed", type=int, default=0, help="seed of the synthetic outer boulder field")
    ap.add_argument("--out-dir", default=None)
    a = ap.parse_args()
    out = Path(a.out_dir) if a.out_dir else data_dir()
    cache = data_dir() / "global_vertices_m.npy"
    if cache.exists():
        v = np.load(cache)
    else:
        t = time.time()
        v, _ = load_obj(data_dir() / GLOBAL_OBJ)
        np.save(cache, v)
        print("loaded global model", v.shape, round(time.time() - t), "s", flush=True)
    tile = DTM.load(data_dir() / "nightingale_dtm_5cm.npz")
    t = time.time()
    w = build_wide_dtm(tile, v, pad_m=a.pad, seed=a.seed)
    print("built", w.z.shape, round(time.time() - t), "s; z range", float(w.z.min()), float(w.z.max()), flush=True)
    print(json.dumps(w.info, indent=1))
    w.save(out / "nightingale_wide_5cm.npz")
    json.dump(w.info, open(out / "wide_info.json", "w"), indent=1)
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        k = max(int(round(0.25 / w.res_m)), 1)       # 25 cm preview pixels
        hs = hillshade(w.z[::k, ::k], w.res_m * k)
        fig, ax = plt.subplots(1, 2, figsize=(14, 7))
        ext = w.z.shape[1] * w.res_m / 2
        ax[0].imshow(hs, cmap="gray", origin="lower", extent=[-ext, ext, -ext, ext])
        r0, r1 = w.tile_rows
        c0, c1 = w.tile_cols
        tx, ty = (c0 - w.z.shape[1] / 2) * w.res_m, (r0 - w.z.shape[0] / 2) * w.res_m
        ax[0].add_patch(plt.Rectangle((tx, ty), (c1 - c0) * w.res_m, (r1 - r0) * w.res_m, fill=False, color="orange"))
        ax[0].set_title("truth hillshade (orange = real 5 cm tile)")
        ax[1].imshow(w.z[::k, ::k], origin="lower", extent=[-ext, ext, -ext, ext])
        ax[1].set_title("truth height above the tile plane [m] (curvature visible)")
        fig.savefig(out / "wide_preview.png", dpi=90, bbox_inches="tight")
    except Exception as e:   # the preview is a convenience only
        print("preview skipped:", e)
