"""Matchpoint-style targeting: choose the velocity that puts the spacecraft on a ballistic arc to the target at the
required contact speed. On OSIRIS-REx, the Matchpoint burn did this, computed onboard from the NFT state estimate.

Unknowns: velocity v0 (3) and time of flight T. Equations: horizontal arrival at the target (2), arrival height at the
surface (1), vertical speed at arrival equal to the contact speed (1). Solved by Newton with a finite-difference
Jacobian over the full nonlinear (rotating-frame, point-mass) propagation.
"""
from dataclasses import dataclass

import numpy as np

from touchdown.gnc.dynamics import SiteFrame


@dataclass
class Targeting:
    v0: np.ndarray       # required velocity now (local frame) [m/s]
    T: float             # time of flight [s]
    converged: bool
    residual: float


def ballistic_guess(z0: float, g: float, vz_contact: float) -> float:
    """Time of flight for a vertical-only ballistic drop: (g/2) T^2 + vz_c T + z0 = 0 (vz_c < 0), smaller root."""
    disc = vz_contact ** 2 - 2 * g * z0
    if disc < 0:   # too high to reach the contact speed without thrust: fall to the surface regardless
        return float(np.sqrt(2 * z0 / g))
    return float((-vz_contact - np.sqrt(disc)) / g)


def solve_ballistic_to_target(frame: SiteFrame, x0: np.ndarray, target_xy: np.ndarray, target_z: float,
                              vz_contact: float = -0.10, iters: int = 30, tol: float = 1e-6) -> Targeting:
    g = abs(frame.g_eff_local(np.array([0.0, 0.0, 0.0]))[2])
    z0 = x0[2] - target_z
    T = ballistic_guess(z0, g, vz_contact)
    v = np.array([(target_xy[0] - x0[0]) / T, (target_xy[1] - x0[1]) / T, (-z0 + 0.5 * g * T * T) / T])
    p = np.r_[v, T]

    def resid(q):
        xT, vT = frame.propagate(x0, q[:3], q[3])
        return np.array([xT[0] - target_xy[0], xT[1] - target_xy[1], xT[2] - target_z, vT[2] - vz_contact])

    r = resid(p)
    for _ in range(iters):
        if np.linalg.norm(r) < tol:
            return Targeting(p[:3], float(p[3]), True, float(np.linalg.norm(r)))
        J = np.zeros((4, 4))
        for i in range(4):
            h = 1e-4 if i < 3 else 0.05
            dp = np.zeros(4)
            dp[i] = h
            J[:, i] = (resid(p + dp) - r) / h
        step = np.linalg.solve(J, -r)
        # damp so the time of flight stays positive
        lam = 1.0
        while p[3] + lam * step[3] <= 1.0 and lam > 1e-3:
            lam *= 0.5
        p = p + lam * step
        r = resid(p)
    return Targeting(p[:3], float(p[3]), bool(np.linalg.norm(r) < 1e-3), float(np.linalg.norm(r)))
