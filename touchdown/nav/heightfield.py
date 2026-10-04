"""A heightfield DTM with bilinear sampling, normals, ray intersection and sun shadows (NumPy, vectorized).

Local frame: x east, y north, z up; cell (row, col) centre at x = (col + 0.5 - nx/2) res, y = (row + 0.5 - ny/2) res,
matching the Blender worker and touchdown/dataset/labels.py.
"""
import os

import numpy as np
from scipy import ndimage

try:
    import torch

    from touchdown.nav.raycast_gpu import make_height_sampler, raycast_gpu
except ImportError:  # no torch (e.g. Windows on Arm): NumPy ray casting only
    torch = None


class HeightField:
    def __init__(self, z: np.ndarray, res_m: float):
        self.z = np.asarray(z, dtype=np.float64)
        self.res = float(res_m)
        self.ny, self.nx = self.z.shape
        gy, gx = np.gradient(self.z, self.res)
        n = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
        self.normals = n / np.linalg.norm(n, axis=-1, keepdims=True)
        self._gpu = None   # (device, height sampler), built on first use

    def _gpu_backend(self):
        """Batched torch ray casting when a GPU is present. TOUCHDOWN_NAV_GPU=cpu forces torch on CPU (tests), =0 disables."""
        if torch is None:
            return None
        if self._gpu is None:
            mode = os.environ.get("TOUCHDOWN_NAV_GPU", "auto")
            if mode == "0" or (mode == "auto" and not torch.cuda.is_available()):
                self._gpu = False
            else:
                dev = torch.device("cpu" if mode == "cpu" else "cuda")
                self._gpu = (dev, make_height_sampler(self.z, self.res, dev))
        return self._gpu or None

    def _cr(self, x, y):
        """Continuous (col, row) array coordinates of local xy."""
        return x / self.res + self.nx / 2.0 - 0.5, y / self.res + self.ny / 2.0 - 0.5

    def inside(self, x, y) -> np.ndarray:
        c, r = self._cr(x, y)
        return (c >= 0) & (c <= self.nx - 1) & (r >= 0) & (r <= self.ny - 1)

    def height(self, x, y) -> np.ndarray:
        """Bilinear height; positions outside the grid are clamped to the border (callers use inside())."""
        c, r = self._cr(x, y)
        return ndimage.map_coordinates(self.z, [np.clip(r, 0, self.ny - 1), np.clip(c, 0, self.nx - 1)],
                                       order=1, mode="nearest")

    def normal(self, x, y) -> np.ndarray:
        c, r = self._cr(x, y)
        rc = [np.clip(r, 0, self.ny - 1), np.clip(c, 0, self.nx - 1)]
        n = np.stack([ndimage.map_coordinates(self.normals[..., k], rc, order=1, mode="nearest") for k in range(3)], -1)
        return n / np.linalg.norm(n, axis=-1, keepdims=True)

    def raycast(self, o: np.ndarray, d: np.ndarray, t0: np.ndarray | float, t1: np.ndarray | float,
                step: float | None = None) -> np.ndarray:
        """First intersection of rays o + t d for t in [t0, t1]. Returns t per ray, NaN for no hit.

        March at `step` (default res/2) and refine the crossing by linear interpolation. Rays that start below the
        terrain surface or leave the grid before hitting return NaN.
        """
        o = np.atleast_2d(o).astype(np.float64)
        d = np.atleast_2d(d).astype(np.float64)
        n = len(d)
        step = step or 0.5 * self.res
        t0 = np.broadcast_to(np.asarray(t0, float), (n,)).copy()
        t1 = np.broadcast_to(np.asarray(t1, float), (n,))
        gpu = self._gpu_backend() if n >= 256 else None
        if gpu is not None:
            return raycast_gpu(gpu[1], np.broadcast_to(o, d.shape), d, t0, t1, step, gpu[0])
        out = np.full(n, np.nan)
        alive = np.ones(n, bool)
        prev_t = t0.copy()
        p = o + prev_t[:, None] * d
        prev_s = p[:, 2] - self.height(p[:, 0], p[:, 1])      # signed height above terrain
        alive &= prev_s > 0
        k = 1
        nsteps = int(np.ceil(np.max(t1 - t0) / step)) + 1
        while k <= nsteps and alive.any():
            idx = np.nonzero(alive)[0]
            t = np.minimum(t0[idx] + k * step, t1[idx])
            p = o[idx] + t[:, None] * d[idx]
            ok = self.inside(p[:, 0], p[:, 1])
            s = p[:, 2] - self.height(p[:, 0], p[:, 1])
            crossed = ok & (s <= 0)
            if crossed.any():
                ci = idx[crossed]
                s0, s1 = prev_s[ci], s[crossed]
                tp = prev_t[ci]
                out[ci] = tp + (t[crossed] - tp) * s0 / np.maximum(s0 - s1, 1e-12)
                alive[ci] = False
            dead = ~ok | (t >= t1[idx])
            alive[idx[dead & ~crossed]] = False
            prev_t[idx] = t
            prev_s[idx] = s
            k += 1
        return out

    def shadowed(self, p: np.ndarray, sun_dir: np.ndarray, max_dist: float = 30.0) -> np.ndarray:
        """True where the straight path from surface point p toward the sun is blocked by terrain."""
        p = np.atleast_2d(p)
        o = p + 0.02 * np.asarray(sun_dir)  # lift off the surface to avoid self-intersection
        d = np.broadcast_to(np.asarray(sun_dir, float), o.shape)
        t = self.raycast(o, d, 0.0, max_dist, step=self.res)
        return np.isfinite(t)
