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


def _newton_ballistic(frame: SiteFrame, x0: np.ndarray, target_xy: np.ndarray, target_z: float, vz_contact: float,
                      T0: float, g: float, iters: int, tol: float) -> Targeting:
    z0 = x0[2] - target_z
    T = T0
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
        try:
            step = np.linalg.solve(J, -r)
        except np.linalg.LinAlgError:      # singular: report a failed solve
            break
        # damp so the time of flight stays positive
        lam = 1.0
        while p[3] + lam * step[3] <= 1.0 and lam > 1e-3:
            lam *= 0.5
        p = p + lam * step
        r = resid(p)
    return Targeting(p[:3], float(p[3]), bool(np.linalg.norm(r) < 1e-3), float(np.linalg.norm(r)))


def solve_ballistic_to_target(frame: SiteFrame, x0: np.ndarray, target_xy: np.ndarray, target_z: float,
                              vz_contact: float = -0.10, iters: int = 30, tol: float = 1e-6) -> Targeting:
    g = abs(frame.g_eff_local(np.array([0.0, 0.0, 0.0]))[2])
    z0 = x0[2] - target_z
    sol = _newton_ballistic(frame, x0, target_xy, target_z, vz_contact, ballistic_guess(z0, g, vz_contact), g, iters, tol)
    if sol.converged:
        return sol
    # Fallback (only reached when the solve above failed, so every flight that converged is unchanged). The first guess uses the
    # surface gravity for the whole drop, but on a 245 m body gravity falls off quickly with height, so from about 56 m up that
    # guess has no real root and falls back to a poor time of flight: seed 14 of the 125 m runs diverged and commanded 66 m/s.
    # Retry from the gravity at half height (a much better average over the drop) and from nearby times of flight.
    g_mid = abs(frame.g_eff_local(np.array([0.0, 0.0, target_z + 0.5 * z0]))[2])
    T_mid = ballistic_guess(z0, g_mid, vz_contact)
    best = sol
    for scale in (1.0, 0.7, 1.4, 0.5, 2.0):
        cand = _newton_ballistic(frame, x0, target_xy, target_z, vz_contact, T_mid * scale, g_mid, iters, tol)
        if cand.converged:
            return cand
        if cand.residual < best.residual:
            best = cand
    return best


def solve_waypoint(frame: SiteFrame, x0: np.ndarray, x_target: np.ndarray, T: float, iters: int = 30,
                   tol: float = 1e-6) -> Targeting:
    """Velocity that carries the spacecraft from `x0` to the point `x_target` after exactly `T` seconds (local frame, full
    nonlinear propagation). Used for the nominal coast from Checkpoint to Matchpoint; the Checkpoint burn is modelled as
    having set this velocity, plus the dispersions in `SimConfig`."""
    g = frame.g_eff_local(np.zeros(3))
    v = (np.asarray(x_target, float) - x0) / T - 0.5 * g * T

    def resid(q):
        return frame.propagate(x0, q, T)[0] - x_target

    r = resid(v)
    for _ in range(iters):
        if np.linalg.norm(r) < tol:
            return Targeting(v, float(T), True, float(np.linalg.norm(r)))
        J = np.zeros((3, 3))
        for i in range(3):
            dq = np.zeros(3)
            dq[i] = 1e-4
            J[:, i] = (resid(v + dq) - r) / 1e-4
        v = v + np.linalg.solve(J, -r)
        r = resid(v)
    return Targeting(v, float(T), bool(np.linalg.norm(r) < 1e-3), float(np.linalg.norm(r)))
