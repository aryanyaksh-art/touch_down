import numpy as np

from touchdown.gnc.dynamics import Bennu, SiteFrame, jacobi, rk4_body

BODY = Bennu()
# Nightingale-like: ~55.95N, 42.17E at radius ~221 m
LAT, LON, RAD = np.radians(55.95), np.radians(42.17), 221.0
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
EAST = np.cross([0, 0, 1.0], UP)
EAST /= np.linalg.norm(EAST)
NORTH = np.cross(UP, EAST)
FRAME = SiteFrame(RAD * UP, np.stack([EAST, NORTH, UP], axis=1), BODY)


def test_jacobi_constant_conserved():
    r = RAD * UP + 40.0 * UP + np.array([5.0, -3.0, 2.0])
    v = np.array([0.02, 0.05, -0.01])
    c0 = jacobi(r, v, BODY)
    for _ in range(600):
        r, v = rk4_body(r, v, 1.0, BODY)
    assert abs(jacobi(r, v, BODY) - c0) < 1e-9


def test_frame_roundtrip():
    x, v = np.array([3.0, -4.0, 20.0]), np.array([0.01, 0.02, -0.1])
    xl, vl = FRAME.to_local(*FRAME.to_body(x, v))
    assert np.allclose(xl, x) and np.allclose(vl, v)


def test_effective_gravity_points_down_and_has_expected_size():
    g = FRAME.g_eff_local(np.array([0.0, 0.0, 0.0]))
    # point mass GM/r^2 ~ 1.0e-4 m/s^2; centrifugal reduces it a little. Mostly -z in the local frame.
    assert 7e-5 < -g[2] < 1.1e-4
    assert abs(g[0]) < 0.5 * abs(g[2]) and abs(g[1]) < 0.5 * abs(g[2])


def test_jacobian_matches_finite_difference():
    x0 = np.array([2.0, 1.0, 30.0])
    v0 = np.array([0.01, 0.0, -0.05])
    dt = 5.0
    F = FRAME.F_local(x0)
    from scipy.linalg import expm
    Phi = expm(F * dt)
    base = np.r_[FRAME.propagate(x0, v0, dt)]
    for i in range(6):
        eps = np.zeros(6)
        eps[i] = 1e-3
        xp, vp = FRAME.propagate(x0 + eps[:3], v0 + eps[3:], dt)
        col = (np.r_[xp, vp] - base) / 1e-3
        assert np.allclose(col, Phi[:, i], atol=2e-4), i


def test_free_fall_time_is_plausible():
    # 54 m up at rest falls ~ sqrt(2h/g) = sqrt(108/9e-5) ~ 1100 s
    x, v = np.array([0.0, 0.0, 54.0]), np.zeros(3)
    t = 0.0
    while x[2] > 0 and t < 3000:
        x, v = FRAME.propagate(x, v, 10.0)
        t += 10.0
    assert 900 < t < 1500
