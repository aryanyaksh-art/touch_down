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


def test_torch_backend_matches_numpy_raycast_and_shadows(monkeypatch):
    pytest = __import__("pytest")
    pytest.importorskip("torch")
    from scipy import ndimage
    rng = np.random.default_rng(3)
    z = (ndimage.gaussian_filter(rng.standard_normal((240, 240)), 5) * 1.2 +
         ndimage.gaussian_filter(rng.standard_normal((240, 240)), 1.2) * 0.15)
    monkeypatch.setenv("TOUCHDOWN_NAV_GPU", "0")
    ref = HeightField(z, 0.1)
    monkeypatch.setenv("TOUCHDOWN_NAV_GPU", "cpu")
    gpu = HeightField(z, 0.1)
    n = 1500
    o = np.c_[rng.uniform(-5, 5, n), rng.uniform(-5, 5, n), rng.uniform(8, 16, n)]
    d = np.c_[rng.normal(0, 0.3, n), rng.normal(0, 0.3, n), -np.ones(n)]
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    t0 = np.full(n, 2.0)
    t1 = np.full(n, 40.0)
    a = ref.raycast(o, d, t0, t1, step=0.1)
    b = gpu.raycast(o, d, t0, t1, step=0.1)
    both = np.isfinite(a) & np.isfinite(b)
    assert both.mean() > 0.95 and (np.isfinite(a) == np.isfinite(b)).mean() > 0.99
    assert np.median(np.abs(a[both] - b[both])) < 0.005 and np.percentile(np.abs(a[both] - b[both]), 99) < 0.1
    pts = o[both] + a[both, None] * d[both]
    sun = np.array([0.4, 0.2, 0.89]); sun /= np.linalg.norm(sun)
    assert (ref.shadowed(pts, sun) == gpu.shadowed(pts, sun)).mean() > 0.98
