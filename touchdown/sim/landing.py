"""Closed-loop simulated landing: NFT navigation + Matchpoint-style targeting + back-away decision.

One flight, several verdicts: the back-away decision does not change the trajectory, so each flight is judged under
(prior map complete | stale) x (baseline | with the neural hazard detector) from the same frames.
"""
from dataclasses import dataclass, field

import numpy as np

from touchdown.gnc.backaway import clearance_map, hazard_probability, predict_contact
from touchdown.gnc.dynamics import SiteFrame
from touchdown.gnc.targeting import solve_ballistic_to_target
from touchdown.nav.catalog import make_onboard_model
from touchdown.nav.ekf import NavEKF
from touchdown.nav.nft import NFTConfig, nft_update
from touchdown.render.camera import Camera, look_at
from touchdown.sim.assets import SiteAssets


@dataclass
class SimConfig:
    start_alt_m: float = 45.0
    matchpoint_time_s: float = 60.0         # burn after NFT has settled; real Matchpoint is at ~54 m (tile-limited here)
    dt_high_s: float = 20.0
    dt_low_s: float = 10.0
    low_alt_m: float = 12.0
    decision_alt_m: float = 5.0             # CONFIRMED: back-away decision at ~5 m
    contact_vz: float = -0.10               # CONFIRMED: -10 cm/s
    head_radius_m: float = 0.30             # ASSUMPTION (TAGSAM head ~0.3 m; verify)
    p_abort: float = 0.10                   # ASSUMPTION
    nn_max_alt_m: float = 22.0              # NN frames used for the live hazard map below this altitude
    # --- dispersions (1-sigma); ASSUMPTIONS, see docs/references.md
    start_offset_m: float = 1.5             # horizontal offset of the start point from the nominal approach
    start_vel_mps: float = 0.003            # velocity error from the previous burn
    est0_pos_m: tuple = (0.4, 0.4, 0.3)     # initial navigation error
    est0_vel_mps: float = 0.002
    burn_mag_frac: float = 0.01             # burn execution: proportional
    burn_fixed_mps: float = 2e-4            # burn execution: fixed
    burn_point_deg: float = 0.5             # burn execution: pointing
    unmodelled_accel: float = 1e-6          # constant truth-only acceleration bias per axis [m/s^2]
    sun_nav_err_deg: float = 1.0
    sun_el_range: tuple = (20.0, 65.0)
    sigma_a_filter: float = 2e-6
    nft: NFTConfig = field(default_factory=NFTConfig)


def _rot(axis, deg):
    a = np.asarray(axis, float) / np.linalg.norm(axis)
    t = np.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(t) * K + (1 - np.cos(t)) * K @ K


def _sun(az_deg, el_deg):
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.array([np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el)])


def _gamma_u8(rgb_lin: np.ndarray) -> np.ndarray:
    g = rgb_lin[..., 0]
    img = np.clip(g * 0.85 / max(np.percentile(g, 99.5), 1e-12), 0, 1) ** (1 / 2.2)
    return (img * 255 + 0.5).astype(np.uint8)


class LiveHazardGrid:
    """Hazard evidence from the network, fused over frames on the DTM grid (log-odds)."""

    def __init__(self, shape, res_m):
        self.L = np.zeros(shape, np.float32)
        self.res = res_m

    def add(self, xy: np.ndarray, p_haz: np.ndarray, weight: float = 0.5):
        ny, nx = self.L.shape
        c = np.floor(xy[:, 0] / self.res + nx / 2.0).astype(int)
        r = np.floor(xy[:, 1] / self.res + ny / 2.0).astype(int)
        ok = (c >= 0) & (c < nx) & (r >= 0) & (r < ny)
        p = np.clip(p_haz[ok], 1e-3, 1 - 1e-3)
        logit = np.clip(np.log(p / (1 - p)), -4, 4) * weight
        np.add.at(self.L, (r[ok], c[ok]), logit.astype(np.float32))

    def mask(self) -> np.ndarray:
        return self.L > 0.0


def fly(site: SiteAssets, renderer, cam: Camera, cfg: SimConfig, seed: int, net=None, record: bool = False) -> dict:
    rng = np.random.default_rng(seed)
    frame: SiteFrame = site.frame
    res = site.dtm.res_m
    onboard = make_onboard_model(site.dtm.z, res, seed=int(rng.integers(1 << 30)))
    R = look_at(np.array([0, 0, 1.0]), np.array([0, 0, 0.0]))            # fixed nadir attitude, known exactly
    az, el = rng.uniform(0, 360), rng.uniform(*cfg.sun_el_range)
    sun_true = _sun(az, el)
    sun_nav = _rot(rng.standard_normal(3), cfg.sun_nav_err_deg) @ sun_true
    a_bias = rng.normal(0, cfg.unmodelled_accel, 3)
    tgt = site.target_xy

    # nominal approach: ballistic to the target from a point offset by the start dispersion
    nom0 = np.array([tgt[0] + rng.normal(0, cfg.start_offset_m), tgt[1] + rng.normal(0, cfg.start_offset_m), cfg.start_alt_m])
    v_nom = solve_ballistic_to_target(frame, nom0, tgt, 0.0, cfg.contact_vz).v0
    x_true, v_true = nom0.copy(), v_nom + rng.normal(0, cfg.start_vel_mps, 3)
    P0 = np.diag([s ** 2 for s in cfg.est0_pos_m] + [cfg.est0_vel_mps ** 2] * 3)
    x_est0 = np.r_[x_true + rng.normal(0, cfg.est0_pos_m), v_true + rng.normal(0, cfg.est0_vel_mps, 3)]
    ekf = NavEKF(frame, x_est0, P0, sigma_a=cfg.sigma_a_filter)

    live = LiveHazardGrid(site.dtm.z.shape, res) if net is not None else None
    t, matchpoint_done, log = 0.0, False, []
    result: dict = {"seed": seed, "sun_az": az, "sun_el": el, "target": tgt.tolist()}
    while True:
        alt_true = x_true[2]
        f = renderer.render(cam, x_true, R, sun_true)
        rgb = f["rgb"]
        nft = nft_update(ekf, onboard, cam, rgb[..., 0].astype(np.float64), R, sun_nav, cfg.nft)
        err = ekf.pos - x_true
        entry = {"t": t, "alt": float(alt_true), "true": x_true.tolist(), "est": ekf.pos.tolist(),
                 "err": float(np.linalg.norm(err)), "sigma_xy": np.sqrt(np.diag(ekf.P[:2, :2])).tolist(),
                 "matched": nft.n_matched, "used": nft.report.n_used}
        # neural hazard detector -> live hazard grid (extension; not part of the real mission)
        if net is not None and ekf.pos[2] <= cfg.nn_max_alt_m:
            u8 = _gamma_u8(rgb)
            _, probs = net.predict(u8)
            p_haz = 1.0 - probs[0]
            stride = 4
            vs, us = np.mgrid[stride // 2:cam.height:stride, stride // 2:cam.width:stride]
            uv = np.c_[us.ravel() + 0.5, vs.ravel() + 0.5]
            rays = (R @ cam.unproject(uv).T).T
            lvl = onboard.pick(ekf.pos[2]).hf
            tt = lvl.raycast(np.broadcast_to(ekf.pos, rays.shape), rays, max(ekf.pos[2] - 8.0, 0.05), ekf.pos[2] + 8.0 + 10.0)
            ok = np.isfinite(tt)
            pts = ekf.pos + tt[ok, None] * rays[ok]
            live.add(pts[:, :2], p_haz[vs.ravel()[ok], us.ravel()[ok]])
            entry["nn_projected"] = int(ok.sum())
        if record:
            entry["image_u8"] = _gamma_u8(rgb)
        log.append(entry)

        # Matchpoint-style burn, computed from the estimate
        if not matchpoint_done and t >= cfg.matchpoint_time_s:
            sol = solve_ballistic_to_target(frame, ekf.x[:3], tgt, 0.0, cfg.contact_vz)
            dv_cmd = sol.v0 - ekf.x[3:]
            mag = np.linalg.norm(dv_cmd)
            sigma = cfg.burn_mag_frac * mag + cfg.burn_fixed_mps
            axis_err = rng.standard_normal(3)
            dv_exec = _rot(axis_err, abs(rng.normal(0, cfg.burn_point_deg))) @ dv_cmd * (1 + rng.normal(0, cfg.burn_mag_frac)) \
                + rng.normal(0, cfg.burn_fixed_mps, 3)
            v_true = v_true + dv_exec
            ekf.x[3:] = ekf.x[3:] + dv_cmd
            ekf.P[3:, 3:] += np.eye(3) * sigma ** 2
            matchpoint_done = True
            result.update({"matchpoint_t": t, "burn_dv": float(mag), "burn_converged": bool(sol.converged),
                           "nav_err_at_matchpoint": entry["err"]})

        # decision altitude reached (by the spacecraft's own estimate)
        if matchpoint_done and ekf.pos[2] <= cfg.decision_alt_m:
            break
        if t > 4000:
            result["timeout"] = True
            break
        dt = cfg.dt_low_s if ekf.pos[2] <= cfg.low_alt_m else cfg.dt_high_s
        x_true, v_true = frame.propagate(x_true, v_true, dt, a_bias)
        ekf.predict(dt)
        t += dt

    # --- back-away decision at ~5 m, under the four prior/detector combinations
    onboard_fine = onboard.levels[0].hf
    cp = predict_contact(frame, ekf.x, ekf.P, onboard_fine)
    p_complete = hazard_probability(site.clr_complete, res, cp.xy, cp.cov_xy, cfg.head_radius_m)
    p_stale = hazard_probability(site.clr_stale, res, cp.xy, cp.cov_xy, cfg.head_radius_m)
    verdicts = {"complete_baseline": p_complete, "stale_baseline": p_stale}
    if live is not None:
        for name, prior in (("complete", site.mask_prior_complete), ("stale", site.mask_prior_stale)):
            clr = clearance_map(prior | live.mask(), res)
            verdicts[f"{name}_nn"] = hazard_probability(clr, res, cp.xy, cp.cov_xy, cfg.head_radius_m)
    result["p_hazard"] = verdicts
    result["abort"] = {k: bool(v > cfg.p_abort) for k, v in verdicts.items()}

    # --- what would actually have happened if we had gone to contact
    xc, vc = x_true.copy(), v_true.copy()
    for _ in range(2000):
        h = site.truth.height(np.array([xc[0]]), np.array([xc[1]]))[0] if site.truth.inside(xc[0], xc[1]) else 0.0
        if xc[2] <= h:
            break
        xp, vp = xc, vc
        xc, vc = frame.propagate(xc, vc, 1.0, a_bias)
    contact = xc[:2]
    ny, nx = site.clr_true.shape
    c, r = int(np.floor(contact[0] / res + nx / 2)), int(np.floor(contact[1] / res + ny / 2))
    on_map = 0 <= c < nx and 0 <= r < ny
    clr_at_contact = float(site.clr_true[r, c]) if on_map else 0.0
    result.update({
        "contact_true": contact.tolist(), "contact_pred": cp.xy.tolist(), "contact_pred_sigma": np.sqrt(np.diag(cp.cov_xy)).tolist(),
        "delivery_error_m": float(np.linalg.norm(contact - tgt)),
        "pred_vs_actual_m": float(np.linalg.norm(cp.xy - contact)),
        "unsafe_contact": bool(clr_at_contact <= cfg.head_radius_m), "clearance_at_contact_m": clr_at_contact,
        "contact_speed": float(np.linalg.norm(vc)), "decision_alt_est": float(ekf.pos[2]),
        "nav_err_at_decision": float(np.linalg.norm(ekf.pos - x_true)),
        "nees_at_decision": float((ekf.pos - x_true) @ np.linalg.solve(ekf.P[:3, :3], ekf.pos - x_true)),
        "n_frames": len(log), "log": log})
    return result
