"""Motion near Bennu in the body-fixed (rotating) frame, and conversions to the local site frame.

Body frame: origin at the centre of mass, +z along the spin axis, rotating at rate omega. Equations of motion with a
point-mass gravity field (ASSUMPTION: adequate at the metre scale of TAG; the real field is irregular, checked
against a polyhedron model if time allows):

    r'' = -GM r/|r|^3 - 2 Omega x v - Omega x (Omega x r) + a_cmd

The Jacobi constant C = |v|^2/2 - |Omega x r|^2/2 - GM/|r| is conserved when a_cmd = 0 (used as a test).
The local site frame (east, north, up at the patch centre, see touchdown/bennu/dtm.py) is fixed to the body.
"""
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Bennu:
    gm: float = 4.892                       # m^3/s^2, Scheeres et al. 2019 (VERIFY, see configs/bennu.yaml)
    period_h: float = 4.296057              # rotation period, hours

    @property
    def omega_vec(self) -> np.ndarray:
        return np.array([0.0, 0.0, 2 * np.pi / (self.period_h * 3600.0)])


def accel_body(r: np.ndarray, v: np.ndarray, body: Bennu, a_cmd=0.0) -> np.ndarray:
    w = body.omega_vec
    return (-body.gm * r / np.linalg.norm(r) ** 3 - 2 * np.cross(w, v) - np.cross(w, np.cross(w, r)) + a_cmd)


def rk4_body(r: np.ndarray, v: np.ndarray, dt: float, body: Bennu, a_cmd=0.0):
    def f(rr, vv):
        return vv, accel_body(rr, vv, body, a_cmd)
    k1r, k1v = f(r, v)
    k2r, k2v = f(r + 0.5 * dt * k1r, v + 0.5 * dt * k1v)
    k3r, k3v = f(r + 0.5 * dt * k2r, v + 0.5 * dt * k2v)
    k4r, k4v = f(r + dt * k3r, v + dt * k3v)
    return (r + dt / 6 * (k1r + 2 * k2r + 2 * k3r + k4r), v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v))


def jacobi(r: np.ndarray, v: np.ndarray, body: Bennu) -> float:
    w = body.omega_vec
    return 0.5 * v @ v - 0.5 * np.cross(w, r) @ np.cross(w, r) - body.gm / np.linalg.norm(r)


def gravity_gradient_body(r: np.ndarray, body: Bennu) -> np.ndarray:
    """d a / d r for the point-mass + centrifugal terms."""
    rn = np.linalg.norm(r)
    G = -body.gm * (np.eye(3) / rn ** 3 - 3 * np.outer(r, r) / rn ** 5)
    W = _skew(body.omega_vec)
    return G - W @ W


def _skew(w: np.ndarray) -> np.ndarray:
    return np.array([[0, -w[2], w[1]], [w[2], 0, -w[0]], [-w[1], w[0], 0]])


class SiteFrame:
    """Converts between the local site frame (x east, y north, z up) and the body frame."""

    def __init__(self, origin_body: np.ndarray, R_body_from_local: np.ndarray, body: Bennu = Bennu()):
        self.o, self.R, self.body = np.asarray(origin_body, float), np.asarray(R_body_from_local, float), body

    def to_body(self, x_local: np.ndarray, v_local: np.ndarray):
        return self.o + self.R @ x_local, self.R @ v_local

    def to_local(self, r_body: np.ndarray, v_body: np.ndarray):
        return self.R.T @ (r_body - self.o), self.R.T @ v_body

    def propagate(self, x_local, v_local, dt, a_cmd_local=None, max_step=5.0):
        """Propagate a local-frame state by dt seconds (RK4 in the body frame); a_cmd_local is in local axes."""
        r, v = self.to_body(x_local, v_local)
        a_cmd = np.zeros(3) if a_cmd_local is None else self.R @ np.asarray(a_cmd_local, float)
        n = max(int(np.ceil(abs(dt) / max_step)), 1)
        h = dt / n
        for _ in range(n):
            r, v = rk4_body(r, v, h, self.body, a_cmd)
        return self.to_local(r, v)

    def F_local(self, x_local) -> np.ndarray:
        """Continuous-time 6x6 Jacobian of (x, v) in local axes, evaluated at x_local."""
        r, _ = self.to_body(x_local, np.zeros(3))
        Gb = gravity_gradient_body(r, self.body)
        Wb = _skew(self.body.omega_vec)
        Gl = self.R.T @ Gb @ self.R
        Cl = -2 * self.R.T @ Wb @ self.R
        F = np.zeros((6, 6))
        F[:3, 3:] = np.eye(3)
        F[3:, :3] = Gl
        F[3:, 3:] = Cl
        return F

    def g_eff_local(self, x_local) -> np.ndarray:
        """Effective gravity (gravity + centrifugal, no Coriolis) at rest, in local axes."""
        r, v = self.to_body(x_local, np.zeros(3))
        return self.R.T @ accel_body(r, v, self.body)
