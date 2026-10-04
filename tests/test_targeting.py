import numpy as np

from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.gnc.targeting import ballistic_guess, solve_ballistic_to_target

LAT, LON, RAD = np.radians(55.95), np.radians(42.17), 221.0
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
E = np.cross([0, 0, 1.0], UP); E /= np.linalg.norm(E)
N = np.cross(UP, E)
FRAME = SiteFrame(RAD * UP, np.stack([E, N, UP], axis=1), Bennu())


def test_matchpoint_altitude_is_near_the_physical_limit():
    # a free-fall drop can only reach 10 cm/s from below ~ v^2 / (2g) ~ 60 m: the real Matchpoint is at 54 m
    g = abs(FRAME.g_eff_local(np.zeros(3))[2])
    assert 50 < 0.10 ** 2 / (2 * g) < 75
    T = ballistic_guess(54.0, g, -0.10)
    assert 300 < T < 1000


def test_solution_hits_target_at_contact_speed():
    x0 = np.array([3.0, -2.0, 40.0])
    target = np.array([0.5, 0.2])
    sol = solve_ballistic_to_target(FRAME, x0, target, 0.0, -0.10)
    assert sol.converged
    xT, vT = FRAME.propagate(x0, sol.v0, sol.T)
    assert np.allclose(xT[:2], target, atol=1e-4) and abs(xT[2]) < 1e-4 and abs(vT[2] + 0.10) < 1e-4
    assert np.linalg.norm(sol.v0) < 0.2        # a small burn, centimetres per second


def test_a_velocity_error_moves_the_landing_point_linearly():
    x0 = np.array([0.0, 0.0, 40.0])
    sol = solve_ballistic_to_target(FRAME, x0, np.array([0.0, 0.0]), 0.0)
    dv = np.array([0.001, 0.0, 0.0])           # 1 mm/s east
    xT, _ = FRAME.propagate(x0, sol.v0 + dv, sol.T)
    # about 1 mm/s * ~500 s = 0.5 m (Coriolis bends it a little)
    assert 0.3 < abs(xT[0]) < 0.8
