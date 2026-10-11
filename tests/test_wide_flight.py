import numpy as np

from tests.test_landing_sim import synthetic_site
from tests.test_widedtm import sphere_vertices
from touchdown.bennu.widedtm import build_wide_dtm
from touchdown.nav.catalog import make_onboard_model
from touchdown.render.camera import Camera
from touchdown.sim.assets import load_wide_assets
from touchdown.sim.fake_renderer import FakeRenderer
from touchdown.sim.landing import SimConfig, fly


def test_onboard_coarse_level_comes_from_the_wide_model_and_fine_level_from_the_tile():
    tile = synthetic_site(n=250, res=0.2)
    wide = build_wide_dtm(tile, sphere_vertices(), pad_m=20.0, seed=0)
    m = make_onboard_model(tile.z, tile.res_m, seed=1, coarse_z=wide.z_known)
    fine, coarse = m.levels[0].hf, m.levels[1].hf
    assert fine.z.shape == tile.z.shape                              # <= 22 m: the tile only (250 cells of 0.2 m)
    assert wide.z_known.shape == (450, 450)                          # tile + 2 x 100 cells of padding
    assert coarse.z.shape == (90, 90) and abs(coarse.res - 1.0) < 1e-12   # high altitude: the whole wide area at 1 m cells


def test_flight_from_a_high_start_over_the_wide_terrain_closes_the_loop(tmp_path):
    tile = synthetic_site(n=250, res=0.2)                            # 50 m tile
    wide = build_wide_dtm(tile, sphere_vertices(), pad_m=30.0, seed=0)
    p = tmp_path / "wide.npz"
    wide.save(p)
    site = load_wide_assets(p, margin_m=8.0)
    assert site.truth.z.shape == wide.z.shape and site.clr_true.shape == tile.z.shape and site.wide_known_z is not None
    cfg = SimConfig(start_alt_m=60.0, waypoint_alt_m=30.0, matchpoint_time_s=300.0)
    res = fly(site, FakeRenderer(site.truth), Camera(192, 144, 44.0), cfg, seed=3)
    assert not res.get("timeout") and res["burn_converged"]
    assert 20.0 < res["matchpoint_alt_true"] < 40.0                  # the coast reached the Matchpoint waypoint (30 m here)
    assert abs(res["matchpoint_t"] - 300.0) < 1e-9
    assert 4.0 < res["decision_alt_est"] < 5.1
    assert abs(res["contact_speed"] - 0.10) < 0.03
    assert res["nav_err_at_decision"] < 2.0 and res["n_frames"] >= 20
