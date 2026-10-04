"""Onboard landmark templates and normalized cross-correlation, the core of Natural Feature Tracking (NFT).

NFT idea (Olds et al.): for each catalogued landmark, render what the terrain model should look like from the
*predicted* spacecraft state, correlate that template against the real navigation image, and treat the offset of the
correlation peak as a measurement of the position error.
"""
from dataclasses import dataclass

import numpy as np
from scipy import signal, ndimage

from touchdown.nav.heightfield import HeightField
from touchdown.render.camera import Camera


def render_templates(hf: HeightField, cam: Camera, cam_pos: np.ndarray, R_local_from_cam: np.ndarray,
                     sun_dir: np.ndarray, centers_uv: np.ndarray, half: int, landmarks: np.ndarray,
                     shadows: bool = True, depth_margin: float = 6.0) -> list[np.ndarray | None]:
    """(2*half+1)^2 Lambertian templates of the terrain around each centre, as seen from the (predicted) pose.

    All landmarks are cast in one batch (one GPU call when a GPU is available). Pixels whose ray misses the model are
    NaN; a template with more than 20% misses is returned as None. Intensity = max(0, n.s), 0 inside cast shadows.
    """
    n = 2 * half + 1
    K = len(landmarks)
    # sample at real-image pixel centres (integer + 0.5), centred on the pixel containing the predicted landmark, so
    # a zero correlation offset means "no error" and the measured landmark pixel is center_uv + (du, dv)
    cu, cv = np.floor(centers_uv[:, 0]), np.floor(centers_uv[:, 1])
    off = np.arange(-half, half + 1)
    U = (cu[:, None, None] + 0.5 + off[None, None, :]) + np.zeros((K, n, n))
    V = (cv[:, None, None] + 0.5 + off[None, :, None]) + np.zeros((K, n, n))
    uv = np.c_[U.ravel(), V.ravel()]
    rays = (R_local_from_cam @ cam.unproject(uv).T).T
    rng = np.linalg.norm(np.asarray(landmarks) - cam_pos, axis=1)
    t0 = np.repeat(np.maximum(rng - depth_margin, 0.05), n * n)
    t1 = np.repeat(rng + depth_margin, n * n)
    t = hf.raycast(np.broadcast_to(cam_pos, rays.shape), rays, t0, t1, step=hf.res)
    ok = np.isfinite(t)
    pts = cam_pos + t[ok, None] * rays[ok]
    nrm = hf.normal(pts[:, 0], pts[:, 1])
    inten = np.clip(nrm @ sun_dir, 0.0, None)
    if shadows:
        inten[hf.shadowed(pts, sun_dir)] = 0.0
    full = np.full(len(t), np.nan)
    full[ok] = inten
    full = full.reshape(K, n, n)
    valid = ok.reshape(K, n * n).mean(axis=1) >= 0.8
    return [full[k] if valid[k] else None for k in range(K)]


def render_template(hf: HeightField, cam: Camera, cam_pos: np.ndarray, R_local_from_cam: np.ndarray,
                    sun_dir: np.ndarray, center_uv: np.ndarray, half: int, landmark: np.ndarray,
                    shadows: bool = True, depth_margin: float = 6.0) -> np.ndarray | None:
    """Single-landmark convenience wrapper around render_templates."""
    return render_templates(hf, cam, cam_pos, R_local_from_cam, sun_dir, np.asarray(center_uv)[None], half,
                            np.asarray(landmark)[None], shadows, depth_margin)[0]


@dataclass
class Match:
    du: float          # offset of the true feature from the predicted position [px], u right
    dv: float
    peak: float        # NCC peak value
    sharpness: float   # peak minus the second-highest local maximum (ambiguity measure)


def ncc_map(image: np.ndarray, template: np.ndarray) -> np.ndarray:
    """Zero-mean normalized cross-correlation of `template` at every 'valid' offset in `image`."""
    t = template - template.mean()
    tn = np.sqrt((t ** 2).sum())
    h, w = template.shape
    n = h * w
    num = signal.fftconvolve(image, t[::-1, ::-1], mode="valid")
    ones = np.ones_like(template)
    s1 = signal.fftconvolve(image, ones, mode="valid")
    s2 = signal.fftconvolve(image ** 2, ones, mode="valid")
    var = np.maximum(s2 - s1 ** 2 / n, 1e-12)
    return num / (np.sqrt(var) * max(tn, 1e-12))


def match_template(image: np.ndarray, template: np.ndarray, center_uv: np.ndarray, search: int) -> Match | None:
    """Search +-`search` px around where the template was predicted to be. NaNs in the template are filled with its mean."""
    th, tw = template.shape
    half_h, half_w = th // 2, tw // 2
    cu, cv = int(np.floor(center_uv[0])), int(np.floor(center_uv[1]))   # pixel index containing the centre
    r0, r1 = cv - half_h - search, cv + half_h + search + 1
    c0, c1 = cu - half_w - search, cu + half_w + search + 1
    if r0 < 0 or c0 < 0 or r1 > image.shape[0] or c1 > image.shape[1]:
        return None
    tpl = np.where(np.isfinite(template), template, np.nanmean(template))
    if tpl.std() < 1e-6:
        return None
    patch = image[r0:r1, c0:c1].astype(np.float64)
    ncc = ncc_map(patch, tpl)
    iy, ix = np.unravel_index(np.argmax(ncc), ncc.shape)
    peak = float(ncc[iy, ix])
    # sub-pixel refinement with a separable parabola on the 3x3 neighbourhood
    dx = dy = 0.0
    if 0 < ix < ncc.shape[1] - 1:
        a, b, c = ncc[iy, ix - 1], ncc[iy, ix], ncc[iy, ix + 1]
        d = a - 2 * b + c
        dx = 0.5 * (a - c) / d if abs(d) > 1e-12 else 0.0
    if 0 < iy < ncc.shape[0] - 1:
        a, b, c = ncc[iy - 1, ix], ncc[iy, ix], ncc[iy + 1, ix]
        d = a - 2 * b + c
        dy = 0.5 * (a - c) / d if abs(d) > 1e-12 else 0.0
    # second-best peak outside a small exclusion zone (ambiguity)
    masked = ncc.copy()
    masked[max(iy - 3, 0):iy + 4, max(ix - 3, 0):ix + 4] = -1.0
    sharp = peak - float(masked.max())
    # ncc index (iy, ix) means the template centre sits at patch pixel (iy + half_h, ix + half_w); zero offset = search
    return Match(du=float(ix + dx - search), dv=float(iy + dy - search), peak=peak, sharpness=sharp)
