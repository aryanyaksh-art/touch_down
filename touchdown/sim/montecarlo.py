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
from touchdown.sim.assets import load_assets, load_wide_assets
from touchdown.sim.landing import NN_ABLATION, SimConfig, fly


def run(out: Path, seeds, device: str = "CPU", checkpoint: str | None = None, samples: int = 16,
        aim_mode: str = "best", head_radius_m: float | None = None, p_abort: float | None = None,
        corr_factor: float | None = None, sigma_a: float | None = None, nn_ablation: bool = False,
        wide: bool = False) -> None:
    out.mkdir(parents=True, exist_ok=True)
    todo = [s for s in seeds if not (out / f"landing_{s:05d}.json").exists()]
    print(f"{len(todo)} of {len(seeds)} landings to run", flush=True)
    if not todo:
        return
    path = data_dir() / ("nightingale_wide_5cm.npz" if wide else "nightingale_dtm_5cm.npz")
    site = load_wide_assets(path) if wide else load_assets(path)
    net = None
    if checkpoint:
        from touchdown.vision.infer import HazardNet
        net = HazardNet(checkpoint)
    cfg = SimConfig(aim_mode=aim_mode)
    if wide:                             # descent from the real Checkpoint (125 m), Matchpoint 54 m about 11 min later (NASA SVS)
        cfg.start_alt_m, cfg.waypoint_alt_m, cfg.matchpoint_time_s = 125.0, 54.0, 660.0
    if head_radius_m is not None:
        cfg.head_radius_m = head_radius_m
    if p_abort is not None:
        cfg.p_abort = p_abort
    if corr_factor is not None:          # filter calibration sweeps (notebooks/09_kaggle_filter_sweep.ipynb)
        cfg.nft.corr_factor = corr_factor
    if sigma_a is not None:
        cfg.sigma_a_filter = sigma_a
    if nn_ablation:                      # false-alarm ablation, see landing.NN_ABLATION and analysis/ablation.py
        cfg.nn_variants = NN_ABLATION
    cam = Camera(640, 480, 44.0)
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
    ap.add_argument("--seeds", nargs=2, type=int, default=None, help="half-open seed range START END")
    ap.add_argument("--seed-list", nargs="+", type=int, default=None, help="explicit seeds instead of a range (e.g. only the hazard cases)")
    ap.add_argument("--device", default="CPU")
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--samples", type=int, default=16)
    ap.add_argument("--aim-mode", default="best", choices=["best", "random_safe"],
                    help="best: max-clearance aim point; random_safe: random aim point with thin margins (harder)")
    ap.add_argument("--head-radius", type=float, default=None, help="metres; default is the SimConfig value (0.16, TAGSAM outer radius)")
    ap.add_argument("--p-abort", type=float, default=None, help="hazard-probability threshold; default is the SimConfig value (0.01)")
    ap.add_argument("--corr-factor", type=float, default=None, help="NFT measurement-noise inflation for correlated errors (default 1.5)")
    ap.add_argument("--sigma-a", type=float, default=None, help="filter process noise, unmodelled acceleration [m/s^2] (default 2e-6)")
    ap.add_argument("--nn-ablation", action="store_true", help="also judge each flight under the detector false-alarm variants (needs --checkpoint)")
    ap.add_argument("--wide", action="store_true", help="EXTENSION: start at Checkpoint (125 m) over the wide terrain (scripts/build_wide_dtm.py)")
    a = ap.parse_args()
    if (a.seeds is None) == (a.seed_list is None):
        ap.error("give exactly one of --seeds or --seed-list")
    run(Path(a.out), a.seed_list if a.seed_list is not None else range(*a.seeds), a.device, a.checkpoint, a.samples, a.aim_mode, a.head_radius, a.p_abort,
        a.corr_factor, a.sigma_a, a.nn_ablation, a.wide)
