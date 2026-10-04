"""Fly a few full closed-loop landings over the real Nightingale tile with Blender frames. Usage: fly_demo.py SEED [SEED ...]"""
import json
import sys
import time

from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera
from touchdown.render.client import BlenderRenderer
from touchdown.sim.assets import load_assets
from touchdown.sim.landing import SimConfig, fly


def main(seeds):
    path = data_dir() / "nightingale_dtm_5cm.npz"
    site = load_assets(path)
    print(f"target {site.target_xy.round(2)} clearance {site.target_clearance_m:.2f} m", flush=True)
    cam, cfg = Camera(640, 480, 44.0), SimConfig()
    with BlenderRenderer(path, samples=16) as r:
        for s in seeds:
            t0 = time.time()
            res = fly(site, r, cam, cfg, seed=s)
            keep = {k: v for k, v in res.items() if k != "log"}
            print(f"seed {s}: {res['n_frames']} frames, {time.time() - t0:.0f}s")
            print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in keep.items()}, indent=1), flush=True)
            json.dump(res, open(data_dir() / f"fly_demo_{s}.json", "w"))


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [0])
