"""Batched heightfield ray casting in PyTorch (GPU when available). Same contract as HeightField.raycast (NumPy)."""
import numpy as np
import torch
import torch.nn.functional as F


def make_height_sampler(z: np.ndarray, res: float, device: torch.device):
    ny, nx = z.shape
    zt = torch.as_tensor(np.ascontiguousarray(z), dtype=torch.float32, device=device).view(1, 1, ny, nx)

    def sample(p: torch.Tensor):
        c = p[:, 0] / res + nx / 2.0 - 0.5
        r = p[:, 1] / res + ny / 2.0 - 0.5
        inside = (c >= 0) & (c <= nx - 1) & (r >= 0) & (r <= ny - 1)
        grid = torch.stack([c / (nx - 1) * 2 - 1, r / (ny - 1) * 2 - 1], dim=-1).view(1, -1, 1, 2)
        h = F.grid_sample(zt, grid, mode="bilinear", padding_mode="border", align_corners=True).view(-1)
        return h, inside

    return sample


def raycast_gpu(sample, o: np.ndarray, d: np.ndarray, t0: np.ndarray, t1: np.ndarray, step: float,
                device: torch.device, refine: int = 12) -> np.ndarray:
    """First crossing of each ray o + t d (t in [t0, t1]) with the heightfield; NaN for no hit.

    o: (N,3) origins, d: (N,3) unit directions, t0/t1: (N,). Rays that start below the surface, or leave the grid
    before crossing, return NaN. Coarse marching brackets the crossing, bisection refines it.
    """
    O = torch.as_tensor(o, dtype=torch.float32, device=device)
    D = torch.as_tensor(d, dtype=torch.float32, device=device)
    T0 = torch.as_tensor(t0, dtype=torch.float32, device=device)
    T1 = torch.as_tensor(t1, dtype=torch.float32, device=device)
    n = D.shape[0]
    found = torch.zeros(n, dtype=torch.bool, device=device)
    lo = T0.clone()
    hi = T0.clone()
    prev = T0.clone()
    p = O + T0[:, None] * D
    h, _ = sample(p)
    alive = (p[:, 2] - h) > 0
    nsteps = int(np.ceil(float((T1 - T0).max()) / step)) + 1
    for k in range(1, nsteps + 1):
        idx = torch.nonzero(alive).view(-1)
        if idx.numel() == 0:
            break
        t = torch.minimum(T0[idx] + k * step, T1[idx])
        pn = O[idx] + t[:, None] * D[idx]
        hn, ins = sample(pn)
        cross = ins & ((pn[:, 2] - hn) <= 0)
        ci = idx[cross]
        found[ci] = True
        lo[ci] = prev[ci]
        hi[ci] = t[cross]
        alive[idx[cross | ~ins | (t >= T1[idx])]] = False
        prev[idx] = t
    out = torch.full((n,), float("nan"), device=device)
    fi = torch.nonzero(found).view(-1)
    if fi.numel():
        a, b = lo[fi].clone(), hi[fi].clone()
        Of, Df = O[fi], D[fi]
        for _ in range(refine):
            m = 0.5 * (a + b)
            hm, _ = sample(Of + m[:, None] * Df)
            below = ((Of + m[:, None] * Df)[:, 2] - hm) <= 0
            b = torch.where(below, m, b)
            a = torch.where(below, a, m)
        out[fi] = 0.5 * (a + b)
    return out.cpu().numpy().astype(np.float64)
