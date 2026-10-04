import numpy as np

from touchdown.nav.heightfield import HeightField


def flat(n=200, res=0.25):
    return HeightField(np.zeros((n, n)), res)


def test_flat_nadir_ray_hits_at_altitude():
    hf = flat()
    t = hf.raycast(np.array([[1.0, 2.0, 10.0]]), np.array([[0, 0, -1.0]]), 0.0, 20.0)
    assert np.isclose(t[0], 10.0, atol=1e-6)


def test_oblique_ray_hit_point():
    hf = flat()
    d = np.array([[1.0, 0.0, -1.0]]) / np.sqrt(2)
    t = hf.raycast(np.array([[0.0, 0.0, 8.0]]), d, 0.0, 30.0)
    p = np.array([0.0, 0.0, 8.0]) + t[0] * d[0]
    assert np.isclose(p[2], 0.0, atol=1e-6) and np.isclose(p[0], 8.0, atol=1e-6)


def test_ramp_height_and_normal():
    n, res = 200, 0.25
    x = (np.arange(n) + 0.5 - n / 2) * res
    z = np.tile(0.5 * x, (n, 1))              # slope 0.5 in x
    hf = HeightField(z, res)
    assert np.isclose(hf.height(np.array([3.0]), np.array([0.0]))[0], 1.5, atol=1e-6)
    nvec = hf.normal(np.array([3.0]), np.array([0.0]))[0]
    assert np.allclose(nvec, np.array([-0.5, 0, 1]) / np.sqrt(1.25), atol=1e-6)


def test_miss_outside_grid_is_nan():
    hf = flat()
    t = hf.raycast(np.array([[100.0, 0.0, 5.0]]), np.array([[0, 0, -1.0]]), 0.0, 20.0)
    assert np.isnan(t[0])


def test_shadow_behind_wall():
    n, res = 200, 0.25
    z = np.zeros((n, n))
    z[:, 100:104] = 2.0                        # a 1 m wide, 2 m tall wall at x = 0..1 (east of centre)
    hf = HeightField(z, res)
    sun = np.array([-np.cos(np.radians(20)), 0.0, np.sin(np.radians(20))])   # sun low in the west... toward -x
    behind = np.array([[3.0, 0.0, 0.0]])       # east of wall: sun at west is blocked
    front = np.array([[-3.0, 0.0, 0.0]])
    assert hf.shadowed(behind, sun)[0] and not hf.shadowed(front, sun)[0]
