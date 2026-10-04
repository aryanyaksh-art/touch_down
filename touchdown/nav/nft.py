"""Natural Feature Tracking step: choose landmarks, render templates at the predicted pose, correlate with the
image, and update the filter. Mirrors the structure of the OSIRIS-REx NFT (Olds et al.); details such as template
size and feature count are ASSUMPTIONS, not mission values."""
from dataclasses import dataclass, field

import numpy as np

from touchdown.nav.catalog import OnboardModel, select_visible
from touchdown.nav.correlate import match_template, render_template
from touchdown.nav.ekf import NavEKF, UpdateReport
from touchdown.nav.heightfield import HeightField
from touchdown.render.camera import Camera


@dataclass
class NFTConfig:
    half: int = 20              # template half-size [px] (41 x 41)
    search: int = 14            # correlation search radius [px]
    n_features: int = 12
    min_sep_px: float = 70.0
    sigma_px: float = 0.6       # correlation (matching) noise floor [px]; ASSUMPTION, check against NEES
    model_err_m: float = 0.03   # onboard terrain-model error [m] converted to pixels at each landmark's range; ASSUMPTION
    common_xy_m: float = 0.012  # lateral model error shared by all landmarks in a frame [m]; ASSUMPTION calibrated on NEES
    common_z_frac: float = 0.5  # shared height error as a fraction of the per-landmark height sigma; ASSUMPTION
    corr_factor: float = 1.5    # inflation for errors that are correlated across landmarks (sun, DTM), which sequential
                                # independent updates would otherwise treat as averaging out
    min_peak: float = 0.55
    min_sharp: float = 0.02


@dataclass
class NFTResult:
    report: UpdateReport
    n_selected: int = 0
    n_matched: int = 0
    peaks: list = field(default_factory=list)
    residuals_px: list = field(default_factory=list)   # (du, dv) of accepted matches
    features: list = field(default_factory=list)       # (u_pred, v_pred, u_meas, v_meas) per accepted match


def nft_update(ekf: NavEKF, model: OnboardModel, cam: Camera, image_linear: np.ndarray,
               R_local_from_cam: np.ndarray, sun_dir: np.ndarray, cfg: NFTConfig = NFTConfig()) -> NFTResult:
    """`image_linear` is the navigation image in linear radiance units (invert the camera response beforehand)."""
    level = model.pick(ekf.pos[2])
    hf, cat = level.hf, level.catalog
    margin = cfg.half + cfg.search + 2
    pts, uv_pred = select_visible(cat, cam, ekf.pos, R_local_from_cam, margin, cfg.min_sep_px, cfg.n_features)
    res = NFTResult(report=UpdateReport(), n_selected=len(pts))
    lms, uvs = [], []
    f_px = cam.f_px
    for lm, uv in zip(pts, uv_pred):
        tpl = render_template(hf, cam, ekf.pos, R_local_from_cam, sun_dir, uv, cfg.half, lm)
        if tpl is None:
            continue
        m = match_template(image_linear, tpl, uv, cfg.search)
        if m is None or m.peak < cfg.min_peak or m.sharpness < cfg.min_sharp:
            continue
        lms.append(lm)
        uvs.append(uv + np.array([m.du, m.dv]))
        res.peaks.append(m.peak)
        res.residuals_px.append((m.du, m.dv))
        res.features.append((float(uv[0]), float(uv[1]), float(uv[0] + m.du), float(uv[1] + m.dv)))
    res.n_matched = len(lms)
    if lms:
        ranges = np.linalg.norm(np.array(lms) - ekf.pos, axis=1)
        sig = cfg.corr_factor * np.sqrt(cfg.sigma_px ** 2 + (cfg.model_err_m * f_px / ranges) ** 2)
        res.report = ekf.update_pixels(cam, R_local_from_cam, np.array(lms), np.array(uvs), sig,
                                       sigma_lz=max(cfg.model_err_m, 0.4 * hf.res), common_xy_m=cfg.common_xy_m,
                                       common_z_m=cfg.common_z_frac * max(cfg.model_err_m, 0.4 * hf.res))
    return res
