"""Contact prediction and the back-away (wave-off) decision.

OSIRIS-REx: if the NFT-predicted contact point lies on hazardous (red/yellow) terrain of the onboard hazard map at
the ~5 m decision altitude, the spacecraft backs away. Here the decision uses the filter's predicted contact point AND
its uncertainty: abort when the probability that the sampler head lands on a hazard exceeds a threshold.
The threshold and head radius are ASSUMPTIONS (the mission rule is not public in this detail).
"""
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from touchdown.gnc.dynamics import SiteFrame
from touchdown.nav.heightfield import HeightField


@dataclass
class ContactPrediction:
    xy: np.ndarray        # predicted contact point (east, north) [m]
    cov_xy: np.ndarray    # 2x2 covariance
    t_go: float           # time to contact [s]


def predict_contact(frame: SiteFrame, x: np.ndarray, P: np.ndarray, terrain: HeightField, dt: float = 1.0,
                    t_max: float = 3000.0) -> ContactPrediction:
    """Propagate the estimate until it crosses the terrain surface; return the contact point and its covariance."""
    from scipy.linalg import expm
    p, v = x[:3].copy(), x[3:].copy()
    t = 0.0
    prev = (p.copy(), v.copy(), t)
    while t < t_max:
        h = terrain.height(np.array([p[0]]), np.array([p[1]]))[0] if terrain.inside(p[0], p[1]) else 0.0
        if p[2] <= h:
            break
        prev = (p.copy(), v.copy(), t)
        p, v = frame.propagate(p, v, dt)
        t += dt
    # linear interpolation to the crossing between prev and current
    p0, v0, t0 = prev
    h1 = terrain.height(np.array([p[0]]), np.array([p[1]]))[0] if terrain.inside(p[0], p[1]) else 0.0
    h0 = terrain.height(np.array([p0[0]]), np.array([p0[1]]))[0] if terrain.inside(p0[0], p0[1]) else 0.0
    s0, s1 = p0[2] - h0, p[2] - h1
    w = s0 / max(s0 - s1, 1e-9) if s0 > 0 else 0.0
    pc = p0 + w * (p - p0)
    tc = t0 + w * (t - t0)
    # covariance at contact: state transition over tc, then remove the vertical-timing coupling
    Phi = expm(frame.F_local(x[:3]) * tc)
    Pc = Phi @ P @ Phi.T
    vh, vz = v, v[2]
    H = np.array([[1, 0, -vh[0] / min(vz, -1e-3)], [0, 1, -vh[1] / min(vz, -1e-3)]])
    cov = H @ Pc[:3, :3] @ H.T
    return ContactPrediction(pc[:2], cov, float(tc))


def clearance_map(hazard: np.ndarray, res_m: float) -> np.ndarray:
    """Distance [m] from each cell to the nearest hazard cell (hazard: bool grid)."""
    if not hazard.any():
        return np.full(hazard.shape, 1e3, dtype=np.float32)
    return (ndimage.distance_transform_edt(~hazard) * res_m).astype(np.float32)


def hazard_probability(clearance: np.ndarray, res_m: float, mean_xy: np.ndarray, cov_xy: np.ndarray, radius_m: float,
                       n: int = 600, seed: int = 0) -> float:
    """P(sampler head touches a hazard) when the contact point is ~ N(mean, cov); head radius radius_m."""
    rng = np.random.default_rng(seed)
    ny, nx = clearance.shape
    pts = rng.multivariate_normal(mean_xy, cov_xy + 1e-6 * np.eye(2), size=n)
    c = np.floor(pts[:, 0] / res_m + nx / 2.0).astype(int)
    r = np.floor(pts[:, 1] / res_m + ny / 2.0).astype(int)
    inside = (c >= 0) & (c < nx) & (r >= 0) & (r < ny)
    unsafe = np.ones(n, bool)                      # off the mapped area counts as unsafe (unknown terrain)
    unsafe[inside] = clearance[r[inside], c[inside]] <= radius_m
    return float(unsafe.mean())


@dataclass
class Decision:
    abort: bool
    p_hazard: float
    contact: ContactPrediction


def decide(frame: SiteFrame, x: np.ndarray, P: np.ndarray, terrain: HeightField, clearance: np.ndarray,
           res_m: float, head_radius_m: float = 0.30, p_abort: float = 0.10) -> Decision:
    cp = predict_contact(frame, x, P, terrain)
    p = hazard_probability(clearance, res_m, cp.xy, cp.cov_xy, head_radius_m)
    return Decision(p > p_abort, p, cp)
