"""Everything about one site that the landing simulation needs, built once and reused across landings."""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import yaml
from scipy import ndimage

from touchdown.bennu.dtm import DTM
from touchdown.gnc.backaway import clearance_map
from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.nav.heightfield import HeightField
from touchdown.terrain.hazards import BOULDER, STEEP, HazardMap, build_hazard_map

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class SiteAssets:
    dtm: DTM
    frame: SiteFrame
    truth: HeightField           # what the camera sees
    hazards: HazardMap           # ground-truth hazard map
    mask_true: np.ndarray        # bool: any hazard
    mask_prior_complete: np.ndarray   # ground-built map, everything mapped
    mask_prior_stale: np.ndarray      # ground-built map missing small boulders
    clr_true: np.ndarray
    clr_complete: np.ndarray
    clr_stale: np.ndarray
    target_xy: np.ndarray        # chosen aim point: the point of maximum clearance from any hazard
    target_clearance_m: float


def stale_mask(hm: HazardMap, min_boulder_m: float) -> np.ndarray:
    """Hazard mask with boulders smaller than `min_boulder_m` (equivalent diameter) left unmapped. ASSUMPTION: models
    a ground map that missed small rocks."""
    keep = np.zeros(len(hm.boulder_diameters_m) + 1, bool)
    keep[1:] = hm.boulder_diameters_m >= min_boulder_m
    big_boulder = keep[hm.boulder_ids]
    return (hm.classes == STEEP) | big_boulder


def best_target(clearance: np.ndarray, res_m: float, margin_m: float = 6.0) -> tuple[np.ndarray, float]:
    """Point of maximum clearance, kept `margin_m` from the tile edge so the whole descent stays on the tile."""
    ny, nx = clearance.shape
    m = int(margin_m / res_m)
    sub = clearance[m:ny - m, m:nx - m]
    r, c = np.unravel_index(np.argmax(sub), sub.shape)
    r, c = r + m, c + m
    return np.array([(c + 0.5 - nx / 2) * res_m, (r + 0.5 - ny / 2) * res_m]), float(clearance[r, c])


def load_assets(dtm_path: str | Path, stale_min_boulder_m: float = 0.8) -> SiteAssets:
    return assets_from_dtm(DTM.load(dtm_path), stale_min_boulder_m)


def assets_from_dtm(dtm: DTM, stale_min_boulder_m: float = 0.8, margin_m: float = 6.0) -> SiteAssets:
    cfg = yaml.safe_load(open(ROOT / "configs" / "hazards.yaml"))
    hm = build_hazard_map(dtm.z, dtm.res_m, cfg)
    m_true = hm.classes > 0
    m_stale = stale_mask(hm, stale_min_boulder_m)
    clr_true = clearance_map(m_true, dtm.res_m)
    target, clr_at = best_target(clr_true, dtm.res_m, margin_m)
    return SiteAssets(
        dtm=dtm, frame=SiteFrame(dtm.origin_body, dtm.R_body_from_local, Bennu()), truth=HeightField(dtm.z, dtm.res_m),
        hazards=hm, mask_true=m_true, mask_prior_complete=m_true, mask_prior_stale=m_stale,
        clr_true=clr_true, clr_complete=clr_true, clr_stale=clearance_map(m_stale, dtm.res_m),
        target_xy=target, target_clearance_m=clr_at)
