import numpy as np
import yaml
from pathlib import Path

from touchdown.terrain.hazards import BOULDER, SAFE, STEEP, build_hazard_map
from touchdown.analysis.sfd import fit_cumulative_slope

CFG = yaml.safe_load(open(Path(__file__).parents[1] / "configs" / "hazards.yaml"))
RES = 0.05


def test_flat_is_safe():
    hm = build_hazard_map(np.zeros((200, 200), np.float32), RES, CFG)
    assert (hm.classes == SAFE).all()


def test_boulder_detected_with_size():
    z = np.zeros((300, 300), np.float32)
    z[100:120, 100:120] = 0.5          # 1 m wide, 0.5 m tall block
    hm = build_hazard_map(z, RES, CFG)
    assert hm.classes[110, 110] == BOULDER
    assert hm.boulder_diameters_m.max() > 0.8  # ~1.13 m equivalent diameter


def test_small_rock_below_threshold_ignored():
    z = np.zeros((300, 300), np.float32)
    z[100:104, 100:104] = 0.10         # 10 cm tall, below the 21 cm threshold
    hm = build_hazard_map(z, RES, CFG)
    assert (hm.classes == BOULDER).sum() == 0


def test_steep_slope():
    x = np.arange(300) * RES
    z = np.tile(np.tan(np.radians(25)) * x, (300, 1)).astype(np.float32)
    hm = build_hazard_map(z, RES, CFG)
    assert hm.classes[150, 150] == STEEP


def test_power_law_mle_recovers_slope():
    rng = np.random.default_rng(0)
    alpha, dmin = -2.9, 0.5
    u = rng.random(20000)
    d = dmin * (1 - u) ** (1 / alpha)   # inverse CDF of N(>D) = (D/dmin)^alpha
    est, sig, n = fit_cumulative_slope(d, dmin)
    assert abs(est - alpha) < 0.1


def test_touching_rocks_are_split_but_single_rock_is_not():
    from touchdown.terrain.hazards import split_touching
    yy, xx = np.mgrid[0:200, 0:300]
    two = ((yy - 100) ** 2 + (xx - 100) ** 2 < 30 ** 2) | ((yy - 100) ** 2 + (xx - 155) ** 2 < 30 ** 2)   # overlapping discs
    ids, n = split_touching(two, RES)
    assert n == 2 and len(np.unique(ids[two])) == 2
    one = ((yy - 100) ** 2 + (xx - 150) ** 2 < 35 ** 2)
    ids1, n1 = split_touching(one, RES)
    assert n1 == 1
