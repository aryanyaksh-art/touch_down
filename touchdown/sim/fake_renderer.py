"""A NumPy stand-in for the Blender renderer: Lambertian shading with cast shadows from a heightfield ray caster.

Used for fast unit/integration tests of the closed loop. It shares the same terrain model as the onboard renderer,
so it lacks the model mismatch that Blender provides; never use it for reported results.
"""
import numpy as np

from touchdown.nav.heightfield import HeightField
from touchdown.render.camera import Camera


class FakeRenderer:
    def __init__(self, truth: HeightField):
        self.hf = truth

    def render(self, cam: Camera, cam_pos, R_local_from_cam, sun_dir, **_):
        vs, us = np.mgrid[0:cam.height, 0:cam.width]
        uv = np.c_[us.ravel() + 0.5, vs.ravel() + 0.5]
        rays = (R_local_from_cam @ cam.unproject(uv).T).T
        zmax, zmin = float(self.hf.z.max()), float(self.hf.z.min())
        t0 = max(cam_pos[2] - zmax - 0.5, 0.05)
        t1 = (cam_pos[2] - zmin + 1.0) / max(-rays[:, 2].max(), 0.5) if rays[:, 2].max() < 0 else 200.0
        t = self.hf.raycast(np.broadcast_to(cam_pos, rays.shape), rays, t0, t1)
        ok = np.isfinite(t)
        pts = cam_pos + np.where(ok, t, 0.0)[:, None] * rays
        inten = np.zeros(len(t))
        n = self.hf.normal(pts[ok, 0], pts[ok, 1])
        i = np.clip(n @ sun_dir, 0, None)
        i[self.hf.shadowed(pts[ok], sun_dir)] = 0.0
        inten[ok] = i * 0.044
        img = inten.reshape(cam.height, cam.width)
        pos = np.where(ok[:, None], pts, np.nan).reshape(cam.height, cam.width, 3)
        return {"rgb": np.repeat(img[..., None], 3, axis=2).astype(np.float32), "pos": pos.astype(np.float32)}
