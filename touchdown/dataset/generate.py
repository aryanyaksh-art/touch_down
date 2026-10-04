"""Generate the labelled image dataset.

Train/val terrains are synthetic realizations (cleaned real ground + injected power-law boulders, see
touchdown/terrain/boulders.py); the test terrain is the real Nightingale surface. Per frame we write a grey 8-bit
image and a label PNG (0 safe, 1 boulder, 2 steep, 255 ignore), plus one JSON line of metadata.

Usage: uv run python -m touchdown.dataset.generate --out DIR --split train --terrains 0 4 --frames 100
"""
import argparse
import json
import zlib
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import data_dir
from touchdown.dataset.labels import IGNORE, pixel_labels
from touchdown.render.camera import Camera, look_at
from touchdown.render.client import BlenderRenderer
from touchdown.terrain.boulders import make_terrain
from touchdown.terrain.hazards import build_hazard_map

ROOT = Path(__file__).resolve().parents[2]
SPLIT_SEED_OFFSET = {"train": 0, "val": 10_000}  # synthetic seeds never overlap between splits


def sun_vector(az_deg: float, el_deg: float) -> np.ndarray:
    """Unit vector from the surface toward the sun; azimuth clockwise from north in the local frame."""
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])


def sample_pose(rng: np.random.Generator, extent_m: tuple[float, float], alt_range=(4.0, 45.0), max_tilt_deg=15.0):
    """Camera looking near-nadir at a random target. Returns (position, R_local_from_cam, meta)."""
    alt = float(np.exp(rng.uniform(np.log(alt_range[0]), np.log(alt_range[1]))))  # log-uniform: more low frames
    margin = 0.5 * alt
    lim = np.maximum(np.array(extent_m) / 2.0 - margin, 0.0)
    target = np.array([rng.uniform(-lim[0], lim[0]), rng.uniform(-lim[1], lim[1]), 0.0])
    tilt, az = np.radians(rng.uniform(0, max_tilt_deg)), rng.uniform(0, 2 * np.pi)
    pos = target + alt * np.array([np.sin(tilt) * np.cos(az), np.sin(tilt) * np.sin(az), np.cos(tilt)])
    roll = rng.uniform(0, 2 * np.pi)
    R = look_at(pos, target, up_hint=(np.cos(roll), np.sin(roll), 0.0))
    return pos, R, {"alt_m": alt, "tilt_deg": float(np.degrees(tilt)), "target": target[:2].tolist()}


def to_image(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Auto-exposure with jitter, gamma, and sensor noise -> uint8 grey."""
    g = rgb[..., 0]
    gain = rng.uniform(0.7, 1.0) / max(np.percentile(g, 99.5), 1e-9)
    img = np.clip(g * gain, 0, 1) ** (1 / 2.2)
    img = img + rng.normal(0, 1.5 / 255.0, img.shape)
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def build_terrain(real: DTM, hazard_cfg: dict, name: str, seed: int | None) -> DTM:
    if seed is None:  # real Nightingale
        return real
    hm = build_hazard_map(real.z, real.res_m, hazard_cfg)
    rock = hm.rock_height >= hazard_cfg["hazard_object_size_m"]
    z = make_terrain(real.z, rock, real.res_m, seed=seed)
    return DTM(z, real.res_m, real.origin_body, real.R_body_from_local)


def generate(out_dir: Path, split: str, terrain_ids: list[int], frames: int, seed: int, device: str = "CPU",
             samples: int = 16, min_hit: float = 0.85) -> None:
    hazard_cfg = yaml.safe_load(open(ROOT / "configs" / "hazards.yaml"))
    cam_cfg = yaml.safe_load(open(ROOT / "configs" / "camera.yaml"))
    cam = Camera(cam_cfg["render_px"][0], cam_cfg["render_px"][1], cam_cfg["hfov_deg"])
    real = DTM.load(data_dir() / "nightingale_dtm_5cm.npz")
    (out_dir / "images").mkdir(parents=True, exist_ok=True)
    (out_dir / "labels").mkdir(exist_ok=True)
    (out_dir / "terrains").mkdir(exist_ok=True)
    meta_path = out_dir / "meta.jsonl"

    for tid in terrain_ids:
        is_real = split == "test"
        name = "real" if is_real else f"{split}{tid:04d}"
        done = {json.loads(l)["frame"] for l in open(meta_path)} if meta_path.exists() else set()
        todo = [k for k in range(frames) if f"{name}_{k:03d}" not in done]
        if not todo:
            continue
        dtm = build_terrain(real, hazard_cfg, name, None if is_real else SPLIT_SEED_OFFSET[split] + tid)
        hm = build_hazard_map(dtm.z, dtm.res_m, hazard_cfg)
        tpath = out_dir / "terrains" / f"{name}.npz"
        dtm.save(tpath)
        np.save(out_dir / "terrains" / f"{name}_classes.npy", hm.classes)
        with BlenderRenderer(tpath, samples=samples, device=device) as r:
            for k in todo:
                rng = np.random.default_rng([seed, zlib.crc32(name.encode()), k])
                for _ in range(8):
                    pos, R, meta = sample_pose(rng, (dtm.z.shape[1] * dtm.res_m, dtm.z.shape[0] * dtm.res_m))
                    az, el = rng.uniform(0, 360), rng.uniform(15, 70)
                    f = r.render(cam, pos, R, sun_vector(az, el))
                    labels = pixel_labels(f["pos"], hm.classes, dtm.res_m)
                    hit = float((labels != IGNORE).mean())
                    if hit >= min_hit:
                        break
                stem = f"{name}_{k:03d}"
                Image.fromarray(to_image(f["rgb"], rng)).save(out_dir / "images" / f"{stem}.png")
                Image.fromarray(labels).save(out_dir / "labels" / f"{stem}.png")
                meta.update({"frame": stem, "terrain": name, "split": split, "sun_az": az, "sun_el": el,
                             "cam_pos": pos.tolist(), "R": R.tolist(), "hit": hit,
                             "frac_boulder": float((labels == 1).sum() / max((labels != IGNORE).sum(), 1)),
                             "frac_steep": float((labels == 2).sum() / max((labels != IGNORE).sum(), 1))})
                with open(meta_path, "a") as mf:
                    mf.write(json.dumps(meta) + "\n")
        print(f"terrain {name}: {len(todo)} frames", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--split", choices=["train", "val", "test"], required=True)
    ap.add_argument("--terrains", nargs=2, type=int, default=[0, 1], help="terrain id range [start, stop)")
    ap.add_argument("--frames", type=int, default=100)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--device", default="CPU")
    ap.add_argument("--samples", type=int, default=16)
    a = ap.parse_args()
    generate(Path(a.out), a.split, list(range(*a.terrains)), a.frames, a.seed, a.device, a.samples)
