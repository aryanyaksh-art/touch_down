"""Pinhole camera, OpenCV convention: x right, y down, z forward (boresight).

Poses are expressed in the local site frame (x east, y north, z up). R_local_from_cam has columns equal to the
camera x, y, z axes in local coordinates.
"""
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Camera:
    width: int = 640
    height: int = 480
    hfov_deg: float = 44.0

    @property
    def f_px(self) -> float:
        return (self.width / 2.0) / np.tan(np.radians(self.hfov_deg) / 2.0)

    @property
    def K(self) -> np.ndarray:
        f = self.f_px
        return np.array([[f, 0, self.width / 2.0], [0, f, self.height / 2.0], [0, 0, 1.0]])

    def project(self, p_cam: np.ndarray) -> np.ndarray:
        """(N,3) camera-frame points -> (N,2) pixel coords (u right, v down)."""
        p = np.atleast_2d(p_cam)
        return (self.K @ (p / p[:, 2:3]).T).T[:, :2]

    def unproject(self, uv: np.ndarray) -> np.ndarray:
        """(N,2) pixel coords -> (N,3) unit rays in the camera frame."""
        uv = np.atleast_2d(uv)
        xy = (uv - self.K[:2, 2]) / self.f_px
        rays = np.c_[xy, np.ones(len(uv))]
        return rays / np.linalg.norm(rays, axis=1, keepdims=True)


def look_at(position, target, up_hint=(0.0, 1.0, 0.0)) -> np.ndarray:
    """R_local_from_cam for a camera at `position` looking at `target`, image-up closest to up_hint."""
    z = np.asarray(target, float) - np.asarray(position, float)
    z /= np.linalg.norm(z)
    up = np.asarray(up_hint, float)
    up = up / np.linalg.norm(up)
    if abs(np.dot(z, up)) > 0.999:  # looking along the hint: pick another
        up = np.array([1.0, 0.0, 0.0])
    x = np.cross(z, up)   # right = forward x up (right-handed with y down)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)    # down
    return np.stack([x, y, z], axis=1)
