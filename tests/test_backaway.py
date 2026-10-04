import numpy as np

from touchdown.gnc.backaway import clearance_map, decide, hazard_probability, predict_contact
from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.nav.heightfield import HeightField

LAT, LON, RAD = np.radians(55.95), np.radians(42.17), 221.0
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
E = np.cross([0, 0, 1.0], UP); E /= np.linalg.norm(E)
N = np.cross(UP, E)
FRAME = SiteFrame(RAD * UP, np.stack([E, N, UP], axis=1), Bennu())
RES = 0.25


def flat_terrain(n=200):
    return HeightField(np.zeros((n, n)), RES)


def test_predict_contact_of_a_slow_drop():
    hf = flat_terrain()
    x = np.array([1.0, 2.0, 5.0, 0.0, 0.0, -0.10])
    cp = predict_contact(FRAME, x, np.eye(6) * 1e-4, hf)
    assert abs(cp.t_go - 50.0) < 3.0            # ~5 m at 10 cm/s (gravity shortens it slightly)
    assert np.linalg.norm(cp.xy - [1.0, 2.0]) < 0.1


def test_hazard_probability_extremes_and_gradient():
    hazard = np.zeros((200, 200), bool)
    hazard[100:110, 100:110] = True           # a 2.5 m block east/north of centre
    clr = clearance_map(hazard, RES)
    far = hazard_probability(clr, RES, np.array([-15.0, -15.0]), np.eye(2) * 0.01, 0.3)
    on = hazard_probability(clr, RES, np.array([1.25, 1.25]), np.eye(2) * 0.01, 0.3)
    near = hazard_probability(clr, RES, np.array([-0.3, -0.3]), np.eye(2) * 0.2 ** 2, 0.3)
    assert far == 0.0 and on == 1.0 and 0.0 < near < 1.0


def test_off_map_is_unsafe():
    clr = clearance_map(np.zeros((40, 40), bool), RES)
    assert hazard_probability(clr, RES, np.array([500.0, 0.0]), np.eye(2), 0.3) == 1.0


def test_decide_aborts_over_hazard_and_proceeds_on_clear_ground():
    hf = flat_terrain()
    hazard = np.zeros((200, 200), bool)
    hazard[100:104, 100:104] = True            # small block near the origin
    clr = clearance_map(hazard, RES)
    P = np.eye(6) * 1e-3
    over = decide(FRAME, np.array([0.5, 0.5, 5.0, 0, 0, -0.1]), P, hf, clr, RES)
    clear = decide(FRAME, np.array([-6.0, -6.0, 5.0, 0, 0, -0.1]), P, hf, clr, RES)
    assert over.abort and not clear.abort
