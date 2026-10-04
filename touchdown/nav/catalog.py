"""Onboard terrain model and landmark catalog for NFT.

The onboard DTM is deliberately coarser and noisier than the 'truth' terrain the camera sees, as on the real
spacecraft (a ground-built model stored on board). Landmarks are candidate points with a texture score; at each
frame the best few that are predicted to be in view are chosen.
"""
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from touchdown.nav.heightfield import HeightField
from touchdown.render.camera import Camera


def make_onboard_dtm(z_truth: np.ndarray, res_truth: float, factor: int = 5, noise_std: float = 0.03,
                     seed: int = 0) -> HeightField:
    """Block-mean downsample (default 5 cm -> 25 cm) plus smooth height error (ASSUMPTION: 3 cm, 1 m correlation)."""
    # Crop symmetrically to a multiple of `factor` so the coarse grid stays centred on the fine grid (a one-sided
    # crop shifted the onboard model by up to 10 cm, which showed up as a navigation bias).
    ry, rx = z_truth.shape[0] % factor, z_truth.shape[1] % factor
    y0, x0 = ry // 2, rx // 2
    ny, nx = z_truth.shape[0] - ry, z_truth.shape[1] - rx
    z = z_truth[y0:y0 + ny, x0:x0 + nx]
    if factor > 1:
        z = z.reshape(ny // factor, factor, nx // factor, factor).mean(axis=(1, 3))
    rng = np.random.default_rng(seed)
    res = res_truth * factor
    noise = ndimage.gaussian_filter(rng.standard_normal(z.shape), 1.0 / res)
    z = z + noise / max(noise.std(), 1e-12) * noise_std
    return HeightField(z, res)


@dataclass
class Level:
    hf: HeightField
    catalog: "Catalog"
    max_alt_m: float   # use this level while the predicted altitude is at most this


class OnboardModel:
    """Multi-resolution onboard terrain: a coarse model for high altitude and a finer one near the surface, as the
    real NFT used finer feature tiles lower down. Resolutions and noise levels are ASSUMPTIONS."""

    def __init__(self, levels: list[Level]):
        self.levels = sorted(levels, key=lambda l: l.max_alt_m)

    def pick(self, alt_m: float) -> Level:
        for lv in self.levels:
            if alt_m <= lv.max_alt_m:
                return lv
        return self.levels[-1]


def make_onboard_model(z_truth: np.ndarray, res_truth: float, seed: int = 1) -> "OnboardModel":
    coarse = make_onboard_dtm(z_truth, res_truth, factor=5, noise_std=0.03, seed=seed)
    fine = make_onboard_dtm(z_truth, res_truth, factor=1, noise_std=0.02, seed=seed + 1)
    return OnboardModel([Level(fine, build_catalog(fine, spacing_m=0.5, window_m=1.0), 22.0),
                         Level(coarse, build_catalog(coarse), 1e9)])


@dataclass
class Catalog:
    points: np.ndarray     # (N,3) local-frame landmark positions (on the onboard DTM surface)
    quality: np.ndarray    # (N,) texture score (std of height in a ~3 m window)


def build_catalog(hf: HeightField, spacing_m: float = 1.0, window_m: float = 3.0, margin_m: float = 2.0) -> Catalog:
    k = max(int(round(window_m / hf.res)) | 1, 3)
    m = ndimage.uniform_filter(hf.z, k)
    var = np.maximum(ndimage.uniform_filter(hf.z ** 2, k) - m ** 2, 0.0)
    std = np.sqrt(var)
    step = max(int(round(spacing_m / hf.res)), 1)
    mg = int(round(margin_m / hf.res))
    rows = np.arange(mg, hf.ny - mg, step)
    cols = np.arange(mg, hf.nx - mg, step)
    rr, cc = np.meshgrid(rows, cols, indexing="ij")
    x = (cc.ravel() + 0.5 - hf.nx / 2.0) * hf.res
    y = (rr.ravel() + 0.5 - hf.ny / 2.0) * hf.res
    pts = np.c_[x, y, hf.z[rr.ravel(), cc.ravel()]]
    return Catalog(pts, std[rr.ravel(), cc.ravel()])


def select_visible(cat: Catalog, cam: Camera, pos: np.ndarray, R_local_from_cam: np.ndarray, margin_px: int,
                   min_sep_px: float, k: int) -> tuple[np.ndarray, np.ndarray]:
    """Best-quality landmarks predicted to be well inside the image, greedily spaced. Returns (points, uv_pred)."""
    pc = (cat.points - pos) @ R_local_from_cam              # camera-frame coordinates (R^T applied via right-multiply)
    front = pc[:, 2] > 0.5
    uv = np.full((len(pc), 2), np.nan)
    uv[front] = cam.project(pc[front])
    ok = front & (uv[:, 0] > margin_px) & (uv[:, 0] < cam.width - margin_px) & \
        (uv[:, 1] > margin_px) & (uv[:, 1] < cam.height - margin_px)
    idx = np.nonzero(ok)[0]
    idx = idx[np.argsort(-cat.quality[idx])]
    chosen: list[int] = []
    for i in idx:
        if all(np.hypot(*(uv[i] - uv[j])) >= min_sep_px for j in chosen):
            chosen.append(int(i))
            if len(chosen) == k:
                break
    return cat.points[chosen], uv[chosen]
