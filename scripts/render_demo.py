"""Render a few frames of Nightingale at different altitudes and verify the geometry. Output: docs/img/render_demo.png"""
import time

import numpy as np
import yaml
from PIL import Image

from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera, look_at
from touchdown.render.client import BlenderRenderer
from touchdown.bennu.dtm import DTM
from touchdown.dataset.labels import IGNORE, pixel_labels
from touchdown.terrain.hazards import build_hazard_map


def sun_vector(az_deg: float, el_deg: float) -> np.ndarray:
    """Unit vector from the surface toward the sun; azimuth clockwise from north, in the local frame."""
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])


def tonemap(rgb: np.ndarray, ref: float | None = None) -> np.ndarray:
    ref = ref or np.percentile(rgb, 99.5)
    return (np.clip(rgb / ref, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)


def main():
    dtm_path = data_dir() / "nightingale_dtm_5cm.npz"
    cam = Camera(640, 480, 44.0)
    sun = sun_vector(250, 40)
    dtm = DTM.load(dtm_path)
    hm = build_hazard_map(dtm.z, dtm.res_m, yaml.safe_load(open("configs/hazards.yaml")))
    tiles, overlays = [], []
    with BlenderRenderer(dtm_path, samples=16) as r:
        for alt in (10.0, 25.0, 50.0):
            pos = np.array([0.0, 0.0, alt])
            R = look_at(pos, np.array([0.0, 0.0, 0.0]))
            t = time.time()
            f = r.render(cam, pos, R, sun)
            print(f"alt {alt:5.1f} m: {time.time() - t:5.1f} s, hit fraction {np.isfinite(f['pos'][..., 0]).mean():.3f}")
            # geometry check: every hit point must lie on its pixel's ray
            hit = np.isfinite(f["pos"][..., 0])
            vs, us = np.nonzero(hit)
            sel = np.random.default_rng(0).choice(len(vs), size=min(2000, len(vs)), replace=False)
            uv = np.c_[us[sel] + 0.5, vs[sel] + 0.5]
            rays_local = (R @ cam.unproject(uv).T).T
            d = f["pos"][vs[sel], us[sel]] - pos
            cross = np.linalg.norm(np.cross(d, rays_local), axis=1) / np.linalg.norm(d, axis=1)
            print(f"   ray-consistency (max off-ray angle): {np.degrees(np.arcsin(np.clip(cross, 0, 1))).max():.4f} deg")
            img = tonemap(f["rgb"])
            lab = pixel_labels(f["pos"], hm.classes, dtm.res_m)
            colors = np.array([[0, 0, 0], [240, 190, 40], [214, 69, 61]], np.float32)
            ov = img.astype(np.float32)
            m = (lab != IGNORE) & (lab > 0)
            ov[m] = 0.45 * ov[m] + 0.55 * colors[lab[m]]
            tiles.append(img)
            overlays.append(ov.astype(np.uint8))
    sheet = np.concatenate([np.concatenate(tiles, axis=1), np.concatenate(overlays, axis=1)], axis=0)
    Image.fromarray(sheet).resize((sheet.shape[1] // 2, sheet.shape[0] // 2), Image.LANCZOS).save("docs/img/render_demo.png")
    print("saved docs/img/render_demo.png", sheet.shape)


if __name__ == "__main__":
    main()
