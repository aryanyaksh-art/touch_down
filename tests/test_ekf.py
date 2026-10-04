import numpy as np

from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.nav.ekf import NavEKF
from touchdown.render.camera import Camera, look_at

LAT, LON, RAD = np.radians(55.95), np.radians(42.17), 221.0
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
E = np.cross([0, 0, 1.0], UP); E /= np.linalg.norm(E)
N = np.cross(UP, E)
FRAME = SiteFrame(RAD * UP, np.stack([E, N, UP], axis=1), Bennu())
CAM = Camera(640, 480, 44.0)


def landmarks(rng, n=12):
    xy = rng.uniform(-8, 8, (n, 2))
    return np.c_[xy, rng.uniform(-0.3, 0.5, n)]


def measure(true_pos, R, L, rng, sigma):
    pc = (L - true_pos) @ R
    return CAM.project(pc) + rng.normal(0, sigma, (len(L), 2))


def test_filter_converges_from_metre_level_error():
    rng = np.random.default_rng(0)
    true = np.array([0.5, -0.8, 30.0])
    R = look_at(true, np.array([0.0, 0.0, 0.0]))
    L = landmarks(rng)
    x0 = np.r_[true + np.array([2.0, -1.5, 0.8]), np.zeros(3)]
    P0 = np.diag([3.0 ** 2] * 3 + [0.05 ** 2] * 3)
    ekf = NavEKF(FRAME, x0, P0)
    for _ in range(6):
        rep = ekf.update_pixels(CAM, R, L, measure(true, R, L, rng, 0.5), sigma_px=0.5)
    assert rep.n_used >= 10
    assert np.linalg.norm(ekf.pos - true) < 0.15
    assert np.sqrt(np.trace(ekf.P[:3, :3]) / 3) < 0.3


def test_outlier_measurement_is_gated():
    rng = np.random.default_rng(1)
    true = np.array([0.0, 0.0, 30.0])
    R = look_at(true, np.array([0.0, 0.0, 0.0]))
    L = landmarks(rng)
    ekf = NavEKF(FRAME, np.r_[true + [0.3, 0.2, 0.1], np.zeros(3)], np.diag([0.5 ** 2] * 3 + [0.02 ** 2] * 3))
    uv = measure(true, R, L, rng, 0.5)
    uv[0] += np.array([60.0, -40.0])     # gross mismatch
    rep = ekf.update_pixels(CAM, R, L, uv, sigma_px=0.5)
    assert rep.n_rejected >= 1 and np.linalg.norm(ekf.pos - true) < 0.3


def test_nees_is_consistent_over_many_trials():
    nees = []
    for seed in range(60):
        rng = np.random.default_rng(100 + seed)
        true = np.array([0.0, 0.0, 25.0]) + rng.normal(0, [1.0, 1.0, 0.5])  # NFT regime: errors well inside the +-14 px (~0.45 m at 25 m) search window
        R = look_at(true, np.array([0.0, 0.0, 0.0]))
        L = landmarks(rng)
        P0 = np.diag([0.4 ** 2, 0.4 ** 2, 0.3 ** 2] + [0.05 ** 2] * 3)
        x0 = np.r_[true + rng.multivariate_normal(np.zeros(3), P0[:3, :3]), np.zeros(3)]
        ekf = NavEKF(FRAME, x0, P0)
        ekf.update_pixels(CAM, R, L, measure(true, R, L, rng, 0.8), sigma_px=0.8)
        e = ekf.pos - true
        nees.append(e @ np.linalg.solve(ekf.P[:3, :3], e))
    assert 1.5 < np.mean(nees) < 4.5        # chi-square with 3 dof has mean 3


def test_predict_inflates_covariance_and_moves_state():
    P0 = np.diag([0.1 ** 2] * 3 + [0.01 ** 2] * 3)
    ekf = NavEKF(FRAME, np.r_[0, 0, 40.0, 0, 0, -0.1], P0)
    z0, tr0 = ekf.x[2], np.trace(ekf.P)
    ekf.predict(10.0)
    assert abs(ekf.x[2] - (z0 - 1.0)) < 0.05           # 10 s at -0.1 m/s (gravity adds only ~mm)
    assert np.trace(ekf.P) > tr0


def test_landmark_height_uncertainty_widens_posterior_for_off_nadir_landmarks():
    rng = np.random.default_rng(5)
    true = np.array([0.0, 0.0, 25.0])
    R = look_at(true, np.array([0.0, 0.0, 0.0]))
    L = np.array([[10.0, 0.0, 0.0], [-10.0, 3.0, 0.0], [0.0, 10.0, 0.0], [4.0, -9.0, 0.0]])
    uv = measure(true, R, L, rng, 0.0)
    P0 = np.diag([0.5 ** 2] * 3 + [0.05 ** 2] * 3)
    a = NavEKF(FRAME, np.r_[true, np.zeros(3)], P0)
    b = NavEKF(FRAME, np.r_[true, np.zeros(3)], P0)
    a.update_pixels(CAM, R, L, uv, sigma_px=0.5)
    b.update_pixels(CAM, R, L, uv, sigma_px=0.5, sigma_lz=0.15)
    assert np.trace(b.P[:3, :3]) > np.trace(a.P[:3, :3])


def test_joint_update_matches_sequential_when_errors_are_independent_and_widens_when_common():
    rng = np.random.default_rng(7)
    true = np.array([0.0, 0.0, 25.0])
    R = look_at(true, np.array([0.0, 0.0, 0.0]))
    L = landmarks(rng, 8)
    uv = measure(true, R, L, rng, 0.0)
    P0 = np.diag([0.4 ** 2] * 3 + [0.05 ** 2] * 3)
    a = NavEKF(FRAME, np.r_[true, np.zeros(3)], P0)
    b = NavEKF(FRAME, np.r_[true, np.zeros(3)], P0)
    c = NavEKF(FRAME, np.r_[true, np.zeros(3)], P0)
    a.update_pixels(CAM, R, L, uv, sigma_px=0.5)
    b.update_pixels(CAM, R, L, uv, sigma_px=0.5, common_xy_m=1e-9)       # joint path, no correlation
    c.update_pixels(CAM, R, L, uv, sigma_px=0.5, common_xy_m=0.02, common_z_m=0.03)
    assert np.allclose(a.P[:3, :3], b.P[:3, :3], rtol=1e-4, atol=1e-8)
    assert np.trace(c.P[:3, :3]) > 1.5 * np.trace(a.P[:3, :3])           # correlated error stops averaging out
