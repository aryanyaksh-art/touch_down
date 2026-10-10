"""Render one analysed picture per landing for the website: the view at the 5 m decision.

The Monte Carlo does not keep camera frames, so this re-renders the scene the spacecraft was looking at when it made the
back-away decision. Pose: straight down (the simulated attitude is fixed nadir) above the contact point the spacecraft
predicted (`contact_pred`), at its own estimated decision altitude (`decision_alt_est`), with the landing's sun
direction. This is a faithful re-render of the situation, not the exact frame the flight saw (that frame used the true
position, which differs by the navigation error, typically a few centimetres at 5 m).

Output per landing, in --out/pictures: s<seed>.webp (picture), s<seed>_l.png (ground-truth hazard labels) and
s<seed>_n.png (neural detector output; only with --checkpoint). Resumable: existing pictures are skipped.

Usage: python -m touchdown.analysis.render_pictures --mc DIR --out web/public/data [--checkpoint best.pt] [--device GPU]
"""
import argparse
import glob
import json
from pathlib import Path

import numpy as np
from PIL import Image

from touchdown.analysis.export_replays import _label_rgba
from touchdown.bennu.paths import data_dir
from touchdown.dataset.labels import pixel_labels
from touchdown.render.camera import Camera, look_at
from touchdown.sim.assets import load_assets
from touchdown.sim.landing import _gamma_u8, _sun


def decision_pose(result: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Camera position, nadir attitude and sun direction for the 5 m decision picture of one landing result."""
    cp = result["contact_pred"]
    pos = np.array([cp[0], cp[1], result["decision_alt_est"]], dtype=float)
    R = look_at(np.array([0, 0, 1.0]), np.array([0, 0, 0.0]))
    return pos, R, _sun(result["sun_az"], result["sun_el"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mc", required=True, help="folder of landing_*.json from the Monte Carlo")
    ap.add_argument("--out", required=True)
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--device", default="CPU")
    ap.add_argument("--max-hours", type=float, default=None, help="stop cleanly after this long")
    a = ap.parse_args()
    import time

    from touchdown.render.client import BlenderRenderer

    out = Path(a.out) / "pictures"
    out.mkdir(parents=True, exist_ok=True)
    path = data_dir() / "nightingale_dtm_5cm.npz"
    site = load_assets(path)
    res_m = site.dtm.res_m
    net = None
    if a.checkpoint:
        from touchdown.vision.infer import HazardNet

        net = HazardNet(a.checkpoint)
    cam = Camera(640, 480, 44.0)
    files = sorted(glob.glob(f"{a.mc}/landing_*.json"))
    t0 = time.time()
    done = 0
    with BlenderRenderer(path, samples=16, device=a.device) as r:
        for f in files:
            res = json.load(open(f))
            seed = res["seed"]
            if (out / f"s{seed}.webp").exists():
                continue
            pos, R, sun = decision_pose(res)
            fr = r.render(cam, pos, R, sun, want_pos=True)
            rgb = fr["rgb"]
            Image.fromarray(_gamma_u8(rgb)).resize((320, 240), Image.LANCZOS).save(out / f"s{seed}.webp", quality=70)
            _label_rgba(pixel_labels(fr["pos"], site.hazards.classes, res_m)).save(out / f"s{seed}_l.png", optimize=True)
            if net is not None:
                cls, _ = net.predict(_gamma_u8(rgb))
                _label_rgba(cls).save(out / f"s{seed}_n.png", optimize=True)
            done += 1
            if done % 25 == 0:
                print(f"[{(time.time() - t0) / 3600:5.2f} h] pictures {done} (landing {seed})", flush=True)
            if a.max_hours and (time.time() - t0) / 3600 > a.max_hours:
                print("time budget reached, stopping; finished pictures are kept", flush=True)
                break
    json.dump({"seeds": sorted(int(p.stem[1:]) for p in out.glob("s*.webp")), "detector": net is not None},
              open(Path(a.out) / "pictures.json", "w"))
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
