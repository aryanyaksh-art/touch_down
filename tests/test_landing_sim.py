import numpy as np

from touchdown.bennu.dtm import DTM
from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.render.camera import Camera
from touchdown.sim.assets import assets_from_dtm, stale_mask
from touchdown.sim.fake_renderer import FakeRenderer
from touchdown.sim.landing import SimConfig, fly
from touchdown.terrain.boulders import make_field, stamp
from scipy import ndimage

LAT, LON, RAD = np.radians(55.95), np.radians(42.17), 221.0
UP = np.array([np.cos(LAT) * np.cos(LON), np.cos(LAT) * np.sin(LON), np.sin(LAT)])
E = np.cross([0, 0, 1.0], UP); E /= np.linalg.norm(E)
N = np.cross(UP, E)


def synthetic_site(seed=0, n=500, res=0.1):
    rng = np.random.default_rng(seed)
    z = ndimage.gaussian_filter(rng.standard_normal((n, n)), 6.0) * 0.8 + ndimage.gaussian_filter(rng.standard_normal((n, n)), 1.5) * 0.12
    z = stamp(z.astype(np.float32), res, make_field((n * res, n * res), rng, density_per_m2=0.03, dmax=3.0), rng)
    return DTM(z, res, RAD * UP, np.stack([E, N, UP], axis=1))


def test_stale_mask_drops_small_boulders():
    site = assets_from_dtm(synthetic_site(), margin_m=6.0)
    assert site.mask_prior_stale.sum() <= site.mask_prior_complete.sum()
    assert site.target_clearance_m > 0.3


def test_closed_loop_flight_end_to_end_without_blender():
    site = assets_from_dtm(synthetic_site(), margin_m=8.0)
    cam = Camera(192, 144, 44.0)
    cfg = SimConfig(start_alt_m=30.0, matchpoint_time_s=40.0)
    res = fly(site, FakeRenderer(site.truth), cam, cfg, seed=3)
    assert not res.get("timeout") and res["burn_converged"]
    assert 4.0 < res["decision_alt_est"] < 5.1
    assert abs(res["contact_speed"] - 0.10) < 0.03
    assert res["nav_err_at_decision"] < 0.5
    assert res["delivery_error_m"] < 3.0           # generous: the point is the loop closes, not the accuracy
    assert set(res["abort"]) == {"complete_baseline", "stale_baseline"}
    assert res["n_frames"] >= 8
