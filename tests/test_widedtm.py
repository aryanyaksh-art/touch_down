import numpy as np
import pytest
from scipy import ndimage

from touchdown.bennu.dtm import DTM
from touchdown.bennu.widedtm import WideDTM, build_wide_dtm, global_to_local, rasterize_mean, upsample
from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.gnc.targeting import solve_waypoint

RAD = 221.0
LAT, LON = np.radians(55.95), np.radians(42.17)
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
E = np.cross([0, 0, 1.0], UP)
E /= np.linalg.norm(E)
N = np.cross(UP, E)
R_BODY = np.stack([E, N, UP], axis=1)
ORIGIN = RAD * UP


def sag(x, y):
    """Height of a sphere of radius RAD above its tangent plane at the tile centre."""
    return np.sqrt(RAD ** 2 - x ** 2 - y ** 2) - RAD


def sphere_vertices(half_m=100.0, spacing=0.88, rng=None):
    g = np.arange(-half_m, half_m + spacing, spacing)
    X, Y = np.meshgrid(g, g)
    Z = sag(X, Y)
    loc = np.stack([X, Y, Z], -1).reshape(-1, 3)
    far = loc.copy()
    far[:, 2] = -2 * RAD + 1.0                           # the opposite side of the asteroid, same xy
    body = np.vstack([ORIGIN + loc @ R_BODY.T, ORIGIN + far @ R_BODY.T])
    return body


def tile(n=200, res=0.1, seed=0):
    rng = np.random.default_rng(seed)
    x = (np.arange(n) + 0.5 - n / 2) * res
    X, Y = np.meshgrid(x, x)
    bumps = ndimage.gaussian_filter(rng.standard_normal((n, n)), 8.0) * 0.5
    return DTM((sag(X, Y) + bumps).astype(np.float32), res, ORIGIN, R_BODY)


@pytest.fixture(scope="module")
def wide():
    t = tile()
    return t, build_wide_dtm(t, sphere_vertices(), pad_m=12.0, seed=1, feather_m=6.0)


def test_far_side_vertices_are_dropped_and_raster_has_no_gaps():
    t = tile()
    loc = global_to_local(sphere_vertices(), t, half_m=30.0)
    assert loc[:, 2].min() > -80 and len(loc) > 1000
    g, cell = rasterize_mean(loc, 30.0)
    assert np.isfinite(g).all() and abs(cell - 0.88) < 0.05


def test_upsample_reproduces_a_smooth_surface_and_demands_coverage():
    n, cell = 100, 0.88
    xc = (np.arange(n) + 0.5 - n / 2) * cell
    X, Y = np.meshgrid(xc, xc)
    coarse = 0.01 * X + 0.02 * Y + 0.001 * X * Y
    up = upsample(coarse, cell, (400, 400), 0.1)
    xt = (np.arange(400) + 0.5 - 200) * 0.1
    Xt, Yt = np.meshgrid(xt, xt)
    assert np.abs(up - (0.01 * Xt + 0.02 * Yt + 0.001 * Xt * Yt)).max() < 1e-6
    with pytest.raises(ValueError):
        upsample(coarse, cell, (1000, 1000), 0.1)


def test_tile_is_kept_exactly_and_the_grid_is_the_tile_padded_symmetrically(wide):
    t, w = wide
    assert w.z.shape == (200 + 2 * 120, 200 + 2 * 120)
    assert w.tile_rows == (120, 320) and w.tile_cols == (120, 320)
    assert np.array_equal(w.tile_z, t.z) and np.array_equal(w.z_known[120:320, 120:320], t.z)
    assert w.res_m == t.res_m and np.allclose(w.origin_body, t.origin_body)


def test_outer_terrain_follows_the_global_model_and_the_seam_has_no_step(wide):
    t, w = wide
    n = w.z.shape[0]
    x = (np.arange(n) + 0.5 - n / 2) * w.res_m
    X, Y = np.meshgrid(x, x)
    truth = sag(X, Y)
    outside = np.ones_like(w.z, bool)
    outside[110:330, 110:330] = False                         # exclude the tile and a 1 m ring
    assert np.abs(w.z_known - truth)[outside].max() < 0.35    # tile bumps (std 0.5 m, low-passed) leak a little, fading out
    far = np.zeros_like(outside)
    far[:30, :30] = True                                      # a corner ~17 m past the tile
    assert np.abs(w.z_known - truth)[far].max() < 0.1         # feather has faded the tile offset out by then
    assert w.z_known[0, 0] < -0.1                             # curvature present: the corner is below the tangent plane
    step = np.abs(w.z_known[120:320, 119] - w.z_known[120:320, 120])
    assert step.max() < 0.3                                    # seam: neighbouring cells across the tile edge


def test_synthetic_boulders_only_outside_the_tile_and_only_in_the_truth(wide):
    t, w = wide
    d = w.z - w.z_known
    assert d.min() >= -1e-6 and d.max() > 0.3
    assert d[120:320, 120:320].max() == 0.0
    assert w.info["synthetic_boulders_outside"] > 100
    assert abs(w.info["tile_minus_global_mean_m"]) < 0.2 and w.info["tile_minus_global_rms_m"] < 0.5


def test_saved_file_is_a_normal_dtm_and_round_trips(tmp_path, wide):
    _, w = wide
    p = tmp_path / "wide.npz"
    w.save(p)
    d = DTM.load(p)                                  # what BlenderRenderer reads
    assert np.array_equal(d.z, w.z)
    w2 = WideDTM.load(p)
    assert np.array_equal(w2.z_known, w.z_known) and w2.tile_rows == w.tile_rows and w2.info == w.info


def test_waypoint_solver_reaches_the_matchpoint_point_after_exactly_T():
    frame = SiteFrame(ORIGIN, R_BODY, Bennu())
    x0 = np.array([1.2, -0.8, 125.0])
    xt = np.array([0.0, 0.0, 54.0])
    sol = solve_waypoint(frame, x0, xt, 660.0)
    xT, _ = frame.propagate(x0, sol.v0, 660.0)
    assert sol.converged and np.linalg.norm(xT - xt) < 1e-4
    # ~0.08 m/s down (71 m in 11 minutes, minus the gravity gain); Coriolis pushes ~8 m sideways in that time, so the
    # nominal velocity carries ~0.012 m/s of horizontal compensation
    assert -0.15 < sol.v0[2] < -0.05 and np.linalg.norm(sol.v0[:2]) < 0.03
