"""Convert the site mesh to a local-tangent heightfield (DTM).

Local frame (right-handed): x = east, y = north, z = up, origin at the patch centre. Up is the unit normal of
the plane fitted to the patch; east/north follow from the Bennu body-fixed spin axis (+z body). Heights are
metres above that plane. Limitation: a heightfield cannot represent overhangs under boulders.
"""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage


@dataclass
class DTM:
    z: np.ndarray            # (ny, nx) height above the fitted plane [m]; row 0 = south edge, col 0 = west edge
    res_m: float             # grid spacing [m]
    origin_body: np.ndarray  # body-fixed position of the local origin (patch centre, on the plane) [m]
    R_body_from_local: np.ndarray  # columns are east, north, up expressed in body frame

    @property
    def extent_m(self) -> tuple[float, float]:
        return self.z.shape[1] * self.res_m, self.z.shape[0] * self.res_m  # (x, y)

    def save(self, path: str | Path) -> None:
        np.savez_compressed(path, z=self.z, res_m=self.res_m, origin_body=self.origin_body,
                            R=self.R_body_from_local)

    @staticmethod
    def load(path: str | Path) -> "DTM":
        d = np.load(path)
        return DTM(d["z"], float(d["res_m"]), d["origin_body"], d["R"])


def _frame_from_up(up: np.ndarray, spin_axis=(0.0, 0.0, 1.0)) -> np.ndarray:
    east = np.cross(np.asarray(spin_axis, dtype=float), up)
    east /= np.linalg.norm(east)
    north = np.cross(up, east)
    return np.stack([east, north, up], axis=1)


def mesh_to_dtm(vertices: np.ndarray, res_m: float = 0.05) -> DTM:
    centroid = vertices.mean(axis=0)
    R = _frame_from_up(centroid / np.linalg.norm(centroid))
    loc = (vertices - centroid) @ R
    # Fit a plane z = a x + b y + c (subsampled; large boulders are a small share of vertices).
    A = np.c_[loc[::20, 0], loc[::20, 1], np.ones(len(loc[::20]))]
    (a, b, _), *_ = np.linalg.lstsq(A, loc[::20, 2], rcond=None)
    up = R @ np.array([-a, -b, 1.0])
    up /= np.linalg.norm(up)
    R = _frame_from_up(up)
    loc = (vertices - centroid) @ R
    loc[:, 2] -= np.median(loc[:, 2])  # origin on the plane (median removes boulder bias)
    x0, y0 = loc[:, 0].min(), loc[:, 1].min()
    nx = int(np.ceil((loc[:, 0].max() - x0) / res_m)) + 1
    ny = int(np.ceil((loc[:, 1].max() - y0) / res_m)) + 1
    flat = np.rint((loc[:, 1] - y0) / res_m).astype(np.int64) * nx + np.rint((loc[:, 0] - x0) / res_m).astype(np.int64)
    cnt = np.bincount(flat, minlength=nx * ny).astype(np.float64)
    ssum = np.bincount(flat, weights=loc[:, 2], minlength=nx * ny)
    z = np.where(cnt > 0, ssum / np.maximum(cnt, 1), np.nan).reshape(ny, nx)
    gaps = np.isnan(z)
    if gaps.any():  # nearest-neighbour fill; gaps are a few cells wide at 5 cm
        idx = ndimage.distance_transform_edt(gaps, return_distances=False, return_indices=True)
        z = z[tuple(idx)]
    cx, cy = x0 + nx * res_m / 2, y0 + ny * res_m / 2
    origin_body = centroid + R @ np.array([cx, cy, 0.0])
    return DTM(z.astype(np.float32), res_m, origin_body, R)
