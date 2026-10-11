"""Wide truth terrain for descents that start at the real Checkpoint (125 m), not at 45 m.

The 5 cm Nightingale tile is only ~48 m wide, but the camera footprint at 125 m is ~100 m wide and the aim point can sit
anywhere inside the tile, so frames reach ~75 m from its centre. This module embeds the tile in a larger heightfield
on the SAME local frame and the SAME 5 cm grid (so the renderer, ray casters and hazard code need no changes):

  * inside the tile: the real 5 cm terrain, exactly;
  * outside: the NASA 88 cm global model (OLA v20, real data), cubic-upsampled, with the tile-minus-global height
    offset (low-passed over ~2 m so boulders do not leak into it) faded out over `feather_m` so the seam has no step;
  * outside, in the truth only: SYNTHETIC boulders from the same power law and density as inside the tile
    (ASSUMPTION, a fixed realization). The global model does not resolve rocks below a few metres, so without them
    the outer terrain would be unrealistically smooth for a camera that sees 16 cm pixels at 125 m.

`z_known` is the ground-built model the spacecraft would carry: the same terrain WITHOUT the synthetic boulders. NFT
templates are rendered from it (coarse level), while the camera sees `z`, so outside the tile the onboard model
misses the small rocks, as it would in reality. Heights are metres above the tile's fitted plane, so far from the
centre they include the asteroid's curvature (about -sag = d^2 / 2R, 26 m at the grid corners).

Frame: identical to `touchdown/bennu/dtm.py` (x east, y north, z up, origin at the tile centre). The grid is the tile
padded symmetrically, so a cell index maps to the same local xy as in the tile.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.interpolate import RectBivariateSpline

from touchdown.bennu.dtm import DTM
from touchdown.terrain.boulders import BoulderField, make_field, stamp

GLOBAL_CELL_M = 0.88    # CONFIRMED: the SVS global model is the 88 cm product (g_00880mm_..._v020)


@dataclass
class WideDTM:
    z: np.ndarray                  # truth heights seen by the camera [m], (ny, nx)
    z_known: np.ndarray            # onboard (ground-built) model: no synthetic boulders outside the tile
    res_m: float
    origin_body: np.ndarray
    R_body_from_local: np.ndarray
    tile_rows: tuple               # (r0, r1) of the tile inside the grid
    tile_cols: tuple               # (c0, c1)
    info: dict = field(default_factory=dict)

    @property
    def tile_z(self) -> np.ndarray:
        return self.z[self.tile_rows[0]:self.tile_rows[1], self.tile_cols[0]:self.tile_cols[1]]

    def tile_dtm(self) -> DTM:
        return DTM(self.tile_z.copy(), self.res_m, self.origin_body, self.R_body_from_local)

    def save(self, path: str | Path) -> None:
        """Written as a normal DTM file (keys z, res_m, origin_body, R) so the Blender worker and DTM.load read it unchanged."""
        np.savez_compressed(path, z=self.z, res_m=self.res_m, origin_body=self.origin_body, R=self.R_body_from_local,
                            z_known=self.z_known, tile_rc=np.array([*self.tile_rows, *self.tile_cols]),
                            info=json.dumps(self.info))

    @staticmethod
    def load(path: str | Path) -> "WideDTM":
        d = np.load(path)
        r0, r1, c0, c1 = (int(v) for v in d["tile_rc"])
        return WideDTM(d["z"], d["z_known"], float(d["res_m"]), d["origin_body"], d["R"], (r0, r1), (c0, c1),
                       json.loads(str(d["info"])))


def global_to_local(vertices_body: np.ndarray, tile: DTM, half_m: float, max_abs_z_m: float = 80.0) -> np.ndarray:
    """Global-model vertices (body frame, m) in the tile's local frame, keeping those within `half_m` of its centre.
    The z cut drops the far side of the asteroid; it must exceed the curvature sag at the grid corners (26 m)."""
    loc = (vertices_body - tile.origin_body) @ tile.R_body_from_local
    keep = (np.abs(loc[:, 0]) <= half_m) & (np.abs(loc[:, 1]) <= half_m) & (np.abs(loc[:, 2]) <= max_abs_z_m)
    return loc[keep]


def rasterize_mean(loc: np.ndarray, half_m: float, cell_m: float = GLOBAL_CELL_M, smooth_cells: float = 0.7) -> tuple[np.ndarray, float]:
    """Mean vertex height per cell on a square grid centred on the origin, gaps filled by the nearest cell, lightly
    smoothed. Returns (grid, cell size actually used)."""
    n = int(np.ceil(2 * half_m / cell_m))
    n += n % 2
    cell = 2 * half_m / n
    loc = loc[(np.abs(loc[:, 0]) < half_m) & (np.abs(loc[:, 1]) < half_m)]   # vertices beyond the raster are dropped, not clamped
    c = np.floor(loc[:, 0] / cell + n / 2).astype(int).clip(0, n - 1)
    r = np.floor(loc[:, 1] / cell + n / 2).astype(int).clip(0, n - 1)
    flat = r * n + c
    cnt = np.bincount(flat, minlength=n * n).astype(float)
    ssum = np.bincount(flat, weights=loc[:, 2], minlength=n * n)
    g = np.where(cnt > 0, ssum / np.maximum(cnt, 1), np.nan).reshape(n, n)
    gaps = np.isnan(g)
    if gaps.all():
        raise ValueError("no global-model vertices inside the requested region")
    if gaps.any():
        idx = ndimage.distance_transform_edt(gaps, return_distances=False, return_indices=True)
        g = g[tuple(idx)]
    return ndimage.gaussian_filter(g, smooth_cells), cell


def upsample(coarse: np.ndarray, cell_m: float, shape: tuple[int, int], res_m: float) -> np.ndarray:
    """Bicubic spline of a centred coarse grid onto a centred fine grid (cell centres at (i + 0.5 - n/2) * size)."""
    n_y, n_x = coarse.shape
    yc = (np.arange(n_y) + 0.5 - n_y / 2) * cell_m
    xc = (np.arange(n_x) + 0.5 - n_x / 2) * cell_m
    yt = (np.arange(shape[0]) + 0.5 - shape[0] / 2) * res_m
    xt = (np.arange(shape[1]) + 0.5 - shape[1] / 2) * res_m
    if max(abs(yt).max(), abs(xt).max()) > min(abs(yc).max(), abs(xc).max()) + 1e-9:
        raise ValueError("the coarse grid must cover the fine grid")
    return RectBivariateSpline(yc, xc, coarse, kx=3, ky=3, s=0)(yt, xt).astype(np.float64)


def _outside_only(field_: BoulderField, tile_half: tuple[float, float]) -> BoulderField:
    """Keep boulders that lie wholly outside the tile (the tile keeps its real rocks untouched)."""
    r = 0.5 * field_.diameter * np.sqrt(field_.aspect) + 0.1
    keep = (np.abs(field_.x) - r > tile_half[0]) | (np.abs(field_.y) - r > tile_half[1])
    return BoulderField(field_.x[keep], field_.y[keep], field_.diameter[keep], field_.height[keep],
                        field_.aspect[keep], field_.theta[keep])


def build_wide_dtm(tile: DTM, vertices_body: np.ndarray, pad_m: float = 56.0, seed: int = 0, slope: float = -2.9,
                   density_per_m2: float = 0.055, feather_m: float = 10.0, offset_sigma_m: float = 2.0,
                   shape: str = "mixed", dmin: float = 0.3, dmax: float = 8.0) -> WideDTM:
    """Embed `tile` in a (tile + 2 pad)-wide grid built from the global model. See the module docstring."""
    res = tile.res_m
    ny, nx = tile.z.shape
    pc = int(round(pad_m / res))
    Ny, Nx = ny + 2 * pc, nx + 2 * pc
    rows, cols = (pc, pc + ny), (pc, pc + nx)
    half_m = max(Nx, Ny) * res / 2 + 2 * GLOBAL_CELL_M
    loc = global_to_local(vertices_body, tile, half_m + GLOBAL_CELL_M)
    coarse, cell = rasterize_mean(loc, half_m)
    g_up = upsample(coarse, cell, (Ny, Nx), res)

    # tile-minus-global offset: low-passed so boulders stay out of it, then held constant outward and faded to zero
    d = tile.z.astype(np.float64) - g_up[rows[0]:rows[1], cols[0]:cols[1]]
    d_s = ndimage.gaussian_filter(d, offset_sigma_m / res, mode="nearest")
    in_tile = np.zeros((Ny, Nx), bool)
    in_tile[rows[0]:rows[1], cols[0]:cols[1]] = True
    dist_px, idx = ndimage.distance_transform_edt(~in_tile, return_indices=True)
    pad_d = np.zeros((Ny, Nx))
    pad_d[rows[0]:rows[1], cols[0]:cols[1]] = d_s
    w = np.clip(1.0 - dist_px * res / feather_m, 0.0, 1.0) ** 2
    z_known = g_up + pad_d[idx[0], idx[1]] * w
    del dist_px, idx, pad_d, w
    z_known[rows[0]:rows[1], cols[0]:cols[1]] = tile.z

    rng = np.random.default_rng(seed)
    field_ = make_field((Nx * res, Ny * res), rng, slope=slope, density_per_m2=density_per_m2, dmin=dmin, dmax=dmax)
    field_ = _outside_only(field_, (nx * res / 2, ny * res / 2))
    z = stamp(z_known.astype(np.float32), res, field_, rng, shape)
    z[rows[0]:rows[1], cols[0]:cols[1]] = tile.z

    info = {"grid": [Ny, Nx], "res_m": res, "pad_m": pad_m, "global_vertices_used": int(len(loc)),
            "tile_minus_global_rms_m": float(np.sqrt(np.mean(d ** 2))), "tile_minus_global_mean_m": float(d.mean()),
            "offset_after_lowpass_rms_m": float(np.sqrt(np.mean(d_s ** 2))), "synthetic_boulders_outside": int(len(field_.x)),
            "feather_m": feather_m, "seed": seed, "global_cell_m": cell}
    return WideDTM(z, z_known.astype(np.float32), res, tile.origin_body, tile.R_body_from_local, rows, cols, info)
