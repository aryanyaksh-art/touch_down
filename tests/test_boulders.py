import numpy as np
import yaml
from pathlib import Path

from touchdown.analysis.sfd import fit_cumulative_slope
from touchdown.terrain.boulders import (BoulderField, expected_count, make_field, make_terrain, remove_rocks,
                                        sample_diameters, stamp)
from touchdown.terrain.hazards import BOULDER, build_hazard_map

CFG = yaml.safe_load(open(Path(__file__).parents[1] / "configs" / "hazards.yaml"))
RES = 0.05


def test_sampled_diameters_have_requested_slope():
    rng = np.random.default_rng(1)
    d = sample_diameters(30000, 0.3, 1e4, -2.9, rng)
    est, _, _ = fit_cumulative_slope(d, 0.3)
    assert abs(est + 2.9) < 0.1
    assert d.min() >= 0.3


def test_expected_count_matches_definition():
    # N(>1 m) = density per m^2 when dmax -> infinity and dmin = 1
    assert np.isclose(expected_count(100.0, 0.055, 1.0, 1e9, -2.9), 5.5, rtol=1e-6)


def test_stamp_single_rock_height_and_position():
    z = np.zeros((200, 200), np.float32)
    f = BoulderField(x=np.array([0.0]), y=np.array([0.0]), diameter=np.array([2.0]), height=np.array([0.8]),
                     aspect=np.array([1.0]), theta=np.array([0.0]))
    out = stamp(z, RES, f, np.random.default_rng(0))
    r, c = np.unravel_index(out.argmax(), out.shape)
    assert abs(r - 100) <= 2 and abs(c - 100) <= 2
    assert 0.6 < out.max() < 0.8          # height minus ~15% embedding
    assert out[0, 0] == 0.0


def test_remove_rocks_flattens_block():
    z = np.zeros((300, 300), np.float32)
    z[100:140, 100:140] = 0.6
    rock = z > 0.2
    out = remove_rocks(z, rock, RES)
    assert out[110:130, 110:130].max() < 0.05


def test_injected_boulders_are_detected_as_hazards():
    rng = np.random.default_rng(3)
    z = np.zeros((400, 400), np.float32)
    f = make_field((20.0, 20.0), rng)
    out = stamp(z, RES, f, rng)
    hm = build_hazard_map(out, RES, CFG)
    assert (hm.classes == BOULDER).sum() > 0


def test_make_terrain_deterministic():
    z = np.zeros((200, 200), np.float32)
    a = make_terrain(z, z > 1, RES, seed=5)
    b = make_terrain(z, z > 1, RES, seed=5)
    c = make_terrain(z, z > 1, RES, seed=6)
    assert np.array_equal(a, b) and not np.array_equal(a, c)


def test_angular_boulders_are_faceted_not_elliptical_and_respect_height():
    from touchdown.terrain.boulders import angular_bump
    g = np.arange(-120, 121) * RES
    U, V = np.meshgrid(g, g)
    areas, spread = [], []
    for i in range(40):
        z = angular_bump(U, V, d=2.0, h=0.7, rng=np.random.default_rng(i))
        inside = z > 0
        assert inside.any() and z.max() <= 0.7 + 1e-9
        areas.append(inside.sum() * RES ** 2)
        edge = (inside & ~np.roll(inside, 1, 0)) | (inside & ~np.roll(inside, 1, 1))
        rr = np.hypot(U[edge], V[edge])
        spread.append(rr.std() / max(rr.mean(), 1e-9))
    assert np.mean(spread) > 0.06                     # an ideal circle would be ~0
    assert 0.2 < np.mean(areas) < 6.0                 # footprint of a ~2 m rock, in m^2


def test_stamp_shapes_all_produce_hazards_and_differ():
    z0 = np.zeros((400, 400), np.float32)
    f = make_field((20.0, 20.0), np.random.default_rng(3))
    outs = {s: stamp(z0, RES, f, np.random.default_rng(1), shape=s) for s in ("ellipsoid", "angular", "mixed")}
    for o in outs.values():
        assert (build_hazard_map(o, RES, CFG).classes == BOULDER).sum() > 0
    assert not np.array_equal(outs["ellipsoid"], outs["angular"])
