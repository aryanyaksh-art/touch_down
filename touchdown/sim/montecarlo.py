"""Sharded, resumable Monte Carlo of simulated landings.

Each landing writes OUT/landing_<seed>.json (no images). Re-running skips seeds that already have a file, so a lost
Colab/Kaggle session costs at most the landing in progress. Seeds are the only source of randomness.

Usage: python -m touchdown.sim.montecarlo --out DIR --seeds 0 100 [--device GPU] [--checkpoint best.pt] [--aim-mode random_safe]
"""
import argparse
import json
import time
from pathlib import Path

from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera
from touchdown.render.client import BlenderRenderer
from touchdown.sim.assets import load_assets
from touchdown.sim.landing import SimConfig, fly


def run(out: Path, seeds: range, device: str = "CPU", checkpoint: str | None = None, samples: int = 16,
        aim_mode: str = "best") -> None:
    out.mkdir(parents=True, exist_ok=True)
    todo = [s for s in seeds if not (out / f"landing_{s:05d}.json").exists()]
    print(f"{len(todo)} of {len(seeds)} landings to run", flush=True)
    if not todo:
        return
    path = data_dir() / "nightingale_dtm_5cm.npz"
    site = load_assets(path)
    net = None
    if checkpoint:
        from touchdown.vision.infer import HazardNet
        net = HazardNet(checkpoint)
    cam, cfg = Camera(640, 480, 44.0), SimConfig(aim_mode=aim_mode)
    with BlenderRenderer(path, samples=samples, device=device) as r:
        for s in todo:
            t0 = time.time()
            res = fly(site, r, cam, cfg, seed=s, net=net)
            res["wall_s"] = time.time() - t0
            res["has_nn"] = net is not None
            tmp = out / f"landing_{s:05d}.json.tmp"
            json.dump(res, open(tmp, "w"))
            tmp.rename(out / f"landing_{s:05d}.json")
            print(f"seed {s}: delivery {res['delivery_error_m']:.2f} m, abort(complete,baseline)={res['abort']['complete_baseline']}, "
                  f"unsafe_contact={res['unsafe_contact']}, {res['wall_s']:.0f}s", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seeds", nargs=2, type=int, required=True)
    ap.add_argument("--device", default="CPU")
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--samples", type=int, default=16)
    ap.add_argument("--aim-mode", default="best", choices=["best", "random_safe"],
                    help="best: max-clearance aim point; random_safe: random aim point with thin margins (harder)")
    a = ap.parse_args()
    run(Path(a.out), range(*a.seeds), a.device, a.checkpoint, a.samples, a.aim_mode)
