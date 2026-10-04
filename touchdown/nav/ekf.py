"""6-state (position, velocity) extended Kalman filter in the local site frame, with pixel measurements of known
landmarks. Attitude is treated as known (star tracker): ASSUMPTION, the real system also estimates it."""
from dataclasses import dataclass, field

import numpy as np
from scipy.linalg import expm

from touchdown.gnc.dynamics import SiteFrame
from touchdown.render.camera import Camera

CHI2_2DOF_99 = 9.21  # innovation gate for a 2-D pixel residual


@dataclass
class UpdateReport:
    n_used: int = 0
    n_rejected: int = 0
    nis: list = field(default_factory=list)   # normalized innovation squared per accepted feature


class NavEKF:
    def __init__(self, frame: SiteFrame, x0: np.ndarray, P0: np.ndarray, sigma_a: float = 2e-6):
        self.frame = frame
        self.x = np.asarray(x0, float).copy()     # [pos(3), vel(3)] local frame
        self.P = np.asarray(P0, float).copy()
        self.sigma_a = sigma_a                    # unmodelled acceleration (1-sigma) [m/s^2]; ASSUMPTION

    @property
    def pos(self) -> np.ndarray:
        return self.x[:3]

    def predict(self, dt: float, a_cmd_local=None) -> None:
        F = self.frame.F_local(self.x[:3])
        Phi = expm(F * dt)
        p, v = self.frame.propagate(self.x[:3], self.x[3:], dt, a_cmd_local)
        self.x = np.r_[p, v]
        q = self.sigma_a ** 2
        Q = np.zeros((6, 6))
        I3 = np.eye(3)
        Q[:3, :3] = q * dt ** 3 / 3 * I3
        Q[:3, 3:] = Q[3:, :3] = q * dt ** 2 / 2 * I3
        Q[3:, 3:] = q * dt * I3
        self.P = Phi @ self.P @ Phi.T + Q

    def update_pixels(self, cam: Camera, R_local_from_cam: np.ndarray, landmarks: np.ndarray, uv_meas: np.ndarray,
                      sigma_px, gate: float = CHI2_2DOF_99, sigma_lz=0.0) -> UpdateReport:
        """Sequential update with one 2-D pixel measurement per landmark (known local-frame position).

        sigma_px: pixel noise (scalar or per landmark). sigma_lz: 1-sigma error of each landmark's height in the
        onboard model [m]; it enters as a rank-1 term through d(pixel)/d(landmark z), i.e. parallax, which grows
        with the landmark's distance from nadir."""
        rep = UpdateReport()
        Rt = R_local_from_cam.T
        f = cam.f_px
        sig = np.broadcast_to(np.asarray(sigma_px, float), (len(landmarks),))   # scalar or per-landmark [px]
        slz = np.broadcast_to(np.asarray(sigma_lz, float), (len(landmarks),))
        for L, z, sg, sz in zip(landmarks, uv_meas, sig, slz):
            Rm = (sg ** 2) * np.eye(2)
            pc = Rt @ (L - self.x[:3])
            if pc[2] <= 0.1:
                rep.n_rejected += 1
                continue
            uv_pred = cam.project(pc[None])[0]
            J = np.array([[f / pc[2], 0, -f * pc[0] / pc[2] ** 2], [0, f / pc[2], -f * pc[1] / pc[2] ** 2]])
            H = np.zeros((2, 6))
            H[:, :3] = -J @ Rt
            if sz > 0:
                g = J @ Rt[:, 2]          # pixels per metre of landmark height error
                Rm = Rm + sz ** 2 * np.outer(g, g)
            y = z - uv_pred
            S = H @ self.P @ H.T + Rm
            nis = float(y @ np.linalg.solve(S, y))
            if nis > gate:
                rep.n_rejected += 1
                continue
            K = self.P @ H.T @ np.linalg.inv(S)
            self.x = self.x + K @ y
            I_KH = np.eye(6) - K @ H
            self.P = I_KH @ self.P @ I_KH.T + K @ Rm @ K.T   # Joseph form
            rep.n_used += 1
            rep.nis.append(nis)
        return rep
