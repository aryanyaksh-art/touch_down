"""Export landings as static replay data for the website (web/public/data).

Replays need images, so selected seeds are re-flown with record=True (flights are deterministic given the seed).

Usage:
  python -m touchdown.analysis.export_replays --out web/public/data --seeds 3 17 42 [--mc DIR] [--checkpoint best.pt]
  --mc DIR picks illustrative seeds automatically from a Monte Carlo directory (one per outcome type).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from matplotlib.colors import LightSource
from PIL import Image

from touchdown.analysis.compare_published import load_results, summarize
from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera
from touchdown.render.client import BlenderRenderer
from touchdown.sim.assets import SiteAssets, load_assets
from touchdown.sim.landing import SimConfig, fly

CLASS_RGBA = {1: (240, 190, 40, 150), 2: (214, 69, 61, 130)}   # boulder, steep


def export_site(site: SiteAssets, out: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    z, res = site.dtm.z, site.dtm.res_m
    shade = LightSource(azdeg=300, altdeg=28).hillshade(z, vert_exag=2, dx=res, dy=res)
    img = Image.fromarray((np.clip(shade, 0, 1) * 255).astype(np.uint8)[::-1])          # row 0 = north for web
    img.resize((img.width // 2, img.height // 2), Image.LANCZOS).save(out / "site_hillshade.webp", quality=80)
    ov = np.zeros(z.shape + (4,), np.uint8)
    for c, rgba in CLASS_RGBA.items():
        ov[site.hazards.classes == c] = rgba
    Image.fromarray(ov[::-1]).resize((z.shape[1] // 2, z.shape[0] // 2), Image.NEAREST).save(out / "site_hazards.png", optimize=True)
    stale = np.zeros(z.shape + (4,), np.uint8)
    stale[site.mask_prior_stale] = (255, 255, 255, 200)
    Image.fromarray(stale[::-1]).resize((z.shape[1] // 2, z.shape[0] // 2), Image.NEAREST).save(out / "site_prior_stale.png", optimize=True)
    info = {"extent_m": [z.shape[1] * res, z.shape[0] * res], "res_m": res, "target": site.target_xy.tolist(),
            "target_clearance_m": site.target_clearance_m}
    json.dump(info, open(out / "site.json", "w"))
    return info


def _label_rgba(lab: np.ndarray) -> Image.Image:
    rgba = np.zeros(lab.shape + (4,), np.uint8)
    for c, col in CLASS_RGBA.items():
        rgba[lab == c] = col
    return Image.fromarray(rgba).resize((320, 240), Image.NEAREST)


def export_replay(res: dict, out: Path, name: str, title: str, blurb: str) -> dict:
    fdir = out / "replays" / name
    fdir.mkdir(parents=True, exist_ok=True)
    frames = []
    for k, e in enumerate(res["log"]):
        entry = {kk: e[kk] for kk in ("t", "alt", "true", "est", "err", "sigma_xy", "matched", "used")}
        Image.fromarray(e["image_u8"]).resize((320, 240), Image.LANCZOS).save(fdir / f"f{k:02d}.webp", quality=70)
        _label_rgba(e["labels_u8"]).save(fdir / f"l{k:02d}.png", optimize=True)
        if "nn_u8" in e:
            _label_rgba(e["nn_u8"]).save(fdir / f"n{k:02d}.png", optimize=True)
            entry["nn"] = True
        entry["features"] = [[round(v / 2, 1) for v in f] for f in e.get("features", [])]   # to 320x240 pixel coordinates
        frames.append(entry)
    rep = {"id": name, "title": title, "blurb": blurb, "seed": res["seed"], "target": res["target"],
           "sun": {"az": res["sun_az"], "el": res["sun_el"]}, "frames": frames,
           "matchpoint_t": res.get("matchpoint_t"), "burn_dv": res.get("burn_dv"),
           "decision": {k: res[k] for k in ("abort", "p_hazard", "contact_pred", "contact_pred_sigma", "contact_true",
                                              "delivery_error_m", "pred_vs_actual_m", "unsafe_contact",
                                              "clearance_at_contact_m", "decision_alt_est")}}
    json.dump(rep, open(out / "replays" / f"{name}.json", "w"))
    return {"id": name, "title": title, "blurb": blurb, "seed": res["seed"], "abort": res["abort"],
            "unsafe_contact": res["unsafe_contact"], "delivery_error_m": res["delivery_error_m"]}


def pick_illustrative(R: list[dict]) -> list[tuple[int, str, str]]:
    """(seed, title, blurb) for a handful of instructive outcomes from a Monte Carlo set."""
    picks: list[tuple[int, str, str]] = []
    used = set()

    def first(pred, title, blurb):
        for r in R:
            if r["seed"] not in used and pred(r):
                used.add(r["seed"])
                picks.append((r["seed"], title, blurb))
                return

    nn = "complete_nn" in R[0]["abort"]
    first(lambda r: not r["abort"]["complete_baseline"] and not r["unsafe_contact"], "Clean touchdown",
          "Navigation settles, the burn lands near the target, and the contact point is clear of hazards.")
    first(lambda r: r["abort"]["complete_baseline"], "Back-away",
          "The predicted contact point is too close to a mapped hazard at 5 m, so the spacecraft waves off.")
    first(lambda r: not r["abort"]["stale_baseline"] and r["unsafe_contact"] and nn and r["abort"].get("stale_nn"),
          "Detector catches a missed boulder",
          "The ground map missed a small boulder. The neural detector sees it in the descent images and forces a back-away.")
    first(lambda r: not r["abort"]["stale_baseline"] and r["unsafe_contact"], "Missed hazard",
          "The stale ground map misses a boulder at the contact point and nothing else warns the spacecraft.")
    first(lambda r: True, "Typical descent", "A randomly chosen landing from the Monte Carlo set.")
    return picks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seeds", nargs="*", type=int, default=[])
    ap.add_argument("--mc", default=None)
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--device", default="CPU")
    ap.add_argument("--aim-mode", default="best", choices=["best", "random_safe"], help="must match the Monte Carlo that produced --mc")
    a = ap.parse_args()
    out = Path(a.out)
    path = data_dir() / "nightingale_dtm_5cm.npz"
    site = load_assets(path)
    export_site(site, out)
    picks = [(s, f"Landing {s}", "") for s in a.seeds]
    summary = None
    if a.mc:
        R = load_results(a.mc)
        picks = pick_illustrative(R) + picks
        summary = summarize(R)
        json.dump(summary, open(out / "summary.json", "w"))
        json.dump([{"delivery_error_m": r["delivery_error_m"], "unsafe_contact": r["unsafe_contact"],
                    "abort": r["abort"], "contact_true": r["contact_true"], "seed": r["seed"]} for r in R],
                  open(out / "landings.json", "w"))
    net = None
    if a.checkpoint:
        from touchdown.vision.infer import HazardNet
        net = HazardNet(a.checkpoint)
    cam, cfg = Camera(640, 480, 44.0), SimConfig(aim_mode=a.aim_mode)
    index = []
    with BlenderRenderer(path, samples=16, device=a.device) as r:
        for i, (seed, title, blurb) in enumerate(picks):
            res = fly(site, r, cam, cfg, seed=seed, net=net, record=True)
            index.append(export_replay(res, out, f"r{i:02d}_s{seed}", title, blurb))
            print("exported", index[-1]["id"], title, flush=True)
    json.dump(index, open(out / "index.json", "w"))


if __name__ == "__main__":
    main()
