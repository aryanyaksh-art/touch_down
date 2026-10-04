import numpy as np
import pytest
from scipy import ndimage

torch = pytest.importorskip("torch")

from touchdown.nav.heightfield import HeightField  # noqa: E402
from touchdown.render.camera import Camera, look_at  # noqa: E402
from touchdown.render.raycast_torch import surface_positions  # noqa: E402


def terrain(n=240, res=0.1, seed=0):
    rng = np.random.default_rng(seed)
    return (ndimage.gaussian_filter(rng.standard_normal((n, n)), 5) * 1.2 +
            ndimage.gaussian_filter(rng.standard_normal((n, n)), 1.2) * 0.15).astype(np.float32), res


def test_matches_numpy_raycaster_and_lies_on_rays():
    z, res = terrain()
    cam = Camera(64, 48, 44.0)
    pos = np.array([1.0, -0.5, 15.0])
    R = look_at(pos, np.array([0.0, 0.0, 0.0]))
    p = surface_positions(z, res, cam, pos, R, device="cpu")
    hf = HeightField(z, res)
    vs, us = np.mgrid[0:cam.height, 0:cam.width]
    uv = np.c_[us.ravel() + 0.5, vs.ravel() + 0.5]
    rays = (R @ cam.unproject(uv).T).T
    t = hf.raycast(np.broadcast_to(pos, rays.shape), rays, 3.0, 40.0, step=0.05)
    ref = pos + t[:, None] * rays
    got = p.reshape(-1, 3)
    both = np.isfinite(got[:, 0]) & np.isfinite(ref[:, 0])
    assert both.mean() > 0.95
    assert np.median(np.linalg.norm(got[both] - ref[both], axis=1)) < 0.01     # sub-centimetre
    assert np.percentile(np.linalg.norm(got[both] - ref[both], axis=1), 98) < 0.15
    d = got[both] - pos
    off = np.linalg.norm(np.cross(d, rays[both]), axis=1) / np.linalg.norm(d, axis=1)
    assert np.degrees(np.arcsin(off)).max() < 0.01


def test_off_grid_rays_are_nan():
    z, res = terrain()
    cam = Camera(32, 24, 44.0)
    pos = np.array([30.0, 0.0, 10.0])         # well outside the 24 m wide terrain
    p = surface_positions(z, res, cam, pos, look_at(pos, np.array([30.0, 0.0, 0.0])), device="cpu")
    assert np.isnan(p[..., 0]).all()
