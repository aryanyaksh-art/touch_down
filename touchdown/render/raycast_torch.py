"""Per-pixel surface positions by ray-marching the DTM heightfield on the GPU (PyTorch).

This replaces Blender's position pass, which costs ~13 s per frame on a T4 even though the lit render takes 0.3 s.
It solves the same problem as touchdown.nav.heightfield.HeightField.raycast, but all rays at once on the GPU:
coarse marching to bracket the surface crossing, then bisection to refine it. The Blender mesh is the same DTM split
into triangles, so positions agree to well under a centimetre (see tests/test_raycast_torch.py).
"""
import numpy as np
import torch
import torch.nn.functional as F

from touchdown.render.camera import Camera


def surface_positions(z: np.ndarray, res_m: float, cam: Camera, cam_pos, R_local_from_cam, step_m: float = 0.1,
                      refine: int = 14, device: str | None = None) -> np.ndarray:
    """(h,w,3) local-frame positions of the terrain surface seen by each pixel centre; NaN where the ray misses."""
    dev = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    ny, nx = z.shape
    zt = torch.as_tensor(np.ascontiguousarray(z), dtype=torch.float32, device=dev).view(1, 1, ny, nx)
    vs, us = np.mgrid[0:cam.height, 0:cam.width]
    uv = np.c_[us.ravel() + 0.5, vs.ravel() + 0.5]
    rays_np = (np.asarray(R_local_from_cam) @ cam.unproject(uv).T).T
    rays = torch.as_tensor(rays_np, dtype=torch.float32, device=dev)
    o = torch.as_tensor(np.asarray(cam_pos, dtype=np.float32), device=dev)
    n = rays.shape[0]

    def height_and_inside(p):
        c = p[:, 0] / res_m + nx / 2.0 - 0.5
        r = p[:, 1] / res_m + ny / 2.0 - 0.5
        inside = (c >= 0) & (c <= nx - 1) & (r >= 0) & (r <= ny - 1)
        grid = torch.stack([c / (nx - 1) * 2 - 1, r / (ny - 1) * 2 - 1], dim=-1).view(1, -1, 1, 2)
        h = F.grid_sample(zt, grid, mode="bilinear", padding_mode="border", align_corners=True).view(-1)
        return h, inside

    zmax, zmin = float(z.max()), float(z.min())
    t0 = max(float(cam_pos[2]) - zmax - 0.5, 0.05)
    dz_min = max(float((-rays[:, 2]).min()), 0.3)      # shallowest downward ray = longest path to the surface
    t1 = (float(cam_pos[2]) - zmin + 1.0) / dz_min if (rays[:, 2] < 0).any() else 200.0

    found = torch.zeros(n, dtype=torch.bool, device=dev)
    lo = torch.full((n,), t0, device=dev)
    hi = torch.full((n,), t0, device=dev)
    alive = torch.ones(n, dtype=torch.bool, device=dev)
    p = o + t0 * rays
    h, ins = height_and_inside(p)
    alive &= (p[:, 2] - h) > 0                     # rays starting below the surface never hit
    t = t0
    steps = int(np.ceil((t1 - t0) / step_m)) + 1
    for _ in range(steps):
        idx = torch.nonzero(alive).view(-1)
        if idx.numel() == 0:
            break
        t_next = min(t + step_m, t1)
        pn = o + t_next * rays[idx]
        hn, insn = height_and_inside(pn)
        below = insn & ((pn[:, 2] - hn) <= 0)
        hit_idx = idx[below]
        found[hit_idx] = True
        lo[hit_idx] = t
        hi[hit_idx] = t_next
        left = ~insn                                  # left the grid without hitting: gone
        alive[idx[below | left]] = False
        t = t_next
        if t >= t1:
            break

    fi = torch.nonzero(found).view(-1)
    if fi.numel():
        a, b = lo[fi].clone(), hi[fi].clone()
        for _ in range(refine):
            m = 0.5 * (a + b)
            pm = o + m[:, None] * rays[fi]
            hm, _ = height_and_inside(pm)
            below = (pm[:, 2] - hm) <= 0
            b = torch.where(below, m, b)
            a = torch.where(below, a, m)
        t_hit = 0.5 * (a + b)
    out = torch.full((n, 3), float("nan"), device=dev)
    if fi.numel():
        out[fi] = o + t_hit[:, None] * rays[fi]
    return out.view(cam.height, cam.width, 3).cpu().numpy()
