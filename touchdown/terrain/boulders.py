"""Synthetic terrain realizations: strip the real boulders from the Nightingale DTM, then inject new ones.

Training terrains are synthetic; the real Nightingale surface (real boulders) is held out as the test terrain, so
test performance measures transfer from synthetic to real boulders.

Boulder sizes follow a cumulative power law N(>D) = density * D^slope per m^2 (slope < 0). Shapes are half-ellipsoids,
a simplification that the real, angular boulders do not satisfy; this is the main sim-to-real gap to discuss.
"""
from dataclasses import dataclass

import numpy as np
from scipy import ndimage


@dataclass
class BoulderField:
    x: np.ndarray       # centre east [m]
    y: np.ndarray       # centre north [m]
    diameter: np.ndarray
    height: np.ndarray
    aspect: np.ndarray
    theta: np.ndarray


def sample_diameters(n: int, dmin: float, dmax: float, slope: float, rng: np.random.Generator) -> np.ndarray:
    """Truncated power law for N(>D) ~ D^slope, via the inverse CDF on [dmin, dmax]."""
    u = rng.random(n)
    a = dmin ** slope
    b = dmax ** slope
    return (a + u * (b - a)) ** (1.0 / slope)


def expected_count(area_m2: float, density_per_m2: float, dmin: float, dmax: float, slope: float) -> float:
    """Expected number of boulders in [dmin, dmax] given N(>1 m) = density per m^2."""
    return area_m2 * density_per_m2 * (dmin ** slope - dmax ** slope)


def make_field(extent_m: tuple[float, float], rng: np.random.Generator, slope: float = -2.9,
               density_per_m2: float = 0.055, dmin: float = 0.3, dmax: float = 8.0) -> BoulderField:
    """Random field over a rectangle centred on the origin. Default density is the real tile's N(>1 m) per m^2
    (about 129 components over ~2330 m^2, see docs/references.md; merged rocks make this a lower bound)."""
    n = rng.poisson(expected_count(extent_m[0] * extent_m[1], density_per_m2, dmin, dmax, slope))
    d = sample_diameters(n, dmin, dmax, slope, rng)
    return BoulderField(
        x=(rng.random(n) - 0.5) * extent_m[0], y=(rng.random(n) - 0.5) * extent_m[1], diameter=d,
        height=0.5 * d * rng.uniform(0.4, 0.9, n), aspect=rng.uniform(1.0, 1.6, n),
        theta=rng.uniform(0, np.pi, n))


def remove_rocks(z: np.ndarray, rock_mask: np.ndarray, res_m: float, rng: np.random.Generator | None = None) -> np.ndarray:
    """Replace rock pixels by inpainted ground: nearest-valid fill, smoothing blended in under the mask, plus
    band-limited roughness matching the real ground's (measured outside the mask) so patches are not glassy."""
    mask = ndimage.binary_dilation(rock_mask, iterations=max(int(round(0.15 / res_m)), 1))
    idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    filled = z[tuple(idx)]
    smooth = ndimage.gaussian_filter(filled, 0.6 / res_m)
    if rng is not None:
        resid = (z - ndimage.gaussian_filter(z, 0.6 / res_m))[~mask]
        noise = ndimage.gaussian_filter(rng.standard_normal(z.shape), 0.15 / res_m)
        smooth = smooth + noise / noise.std() * resid.std()
    blend = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.1 / res_m) * 1.5, 0, 1)
    return (z * (1 - blend) + smooth * blend).astype(np.float32)


def angular_bump(u: np.ndarray, v: np.ndarray, d: float, h: float, rng: np.random.Generator) -> np.ndarray:
    """Height of an angular block (u, v: metres from its centre): a flat, slightly tilted top of height ~h with 5-8
    steep planar facets. Real Bennu boulders are angular; smooth ellipsoids are the main sim-to-real gap (the
    detector trained on ellipsoids finds only ~15-20% of real boulders). Returns heights, <= 0 outside the block."""
    n = int(rng.integers(5, 9))
    top = h * rng.uniform(0.8, 1.0)
    tilt = rng.normal(0, 0.12, 2)
    z = np.minimum(h, top + tilt[0] * u + tilt[1] * v)                         # gently tilted top, never above h
    for phi, rk, sk in zip(rng.uniform(0, 2 * np.pi, n), 0.5 * d * rng.uniform(0.7, 1.15, n), rng.uniform(1.2, 3.5, n)):
        z = np.minimum(z, sk * (rk - (u * np.cos(phi) + v * np.sin(phi))))      # facet: zero at distance rk, slope sk
    return z


def stamp(z: np.ndarray, res_m: float, field: BoulderField, rng: np.random.Generator,
          shape: str = "ellipsoid") -> np.ndarray:
    """Add the boulders to a heightfield, sitting on the local ground. shape: 'ellipsoid' (smooth half-ellipsoids),
    'angular' (faceted blocks), or 'mixed' (each boulder is one or the other with equal probability)."""
    out = z.copy()
    ny, nx = z.shape
    for x, y, d, h, ar, th in zip(field.x, field.y, field.diameter, field.height, field.aspect, field.theta):
        a, b = 0.5 * d * np.sqrt(ar), 0.5 * d / np.sqrt(ar)
        r = int(np.ceil(max(a, b) / res_m)) + 1
        cx, cy = x / res_m + nx / 2.0 - 0.5, y / res_m + ny / 2.0 - 0.5
        c0, r0 = int(round(cx)), int(round(cy))
        if c0 + r < 0 or c0 - r >= nx or r0 + r < 0 or r0 - r >= ny:
            continue
        cs, ce, rs, re = max(c0 - r, 0), min(c0 + r + 1, nx), max(r0 - r, 0), min(r0 + r + 1, ny)
        gx = (np.arange(cs, ce) - cx) * res_m
        gy = (np.arange(rs, re) - cy) * res_m
        X, Y = np.meshgrid(gx, gy)
        u = X * np.cos(th) + Y * np.sin(th)
        v = -X * np.sin(th) + Y * np.cos(th)
        if shape == "angular" or (shape == "mixed" and rng.random() < 0.5):
            bump = angular_bump(u, v, d, h, rng)
            inside = bump > 0
        else:
            q = 1.0 - (u / a) ** 2 - (v / b) ** 2
            inside = q > 0
            bump = h * np.sqrt(np.where(inside, q, 0.0)) * (1.0 + 0.05 * rng.standard_normal())
        if not inside.any():
            continue
        ground = np.median(out[rs:re, cs:ce][inside])  # local ground level under the rock
        patch = out[rs:re, cs:ce]
        patch[inside] = np.maximum(patch[inside], ground + bump[inside] - 0.15 * h)  # embed ~15% of the height
    return out


def make_terrain(z_real: np.ndarray, rock_mask: np.ndarray, res_m: float, seed: int, slope: float = -2.9,
                 density_per_m2: float = 0.055, shape: str = "ellipsoid") -> np.ndarray:
    """One synthetic realization: random rotation/mirror of the cleaned real ground plus a fresh boulder field."""
    rng = np.random.default_rng(seed)
    ground = remove_rocks(z_real, rock_mask, res_m, rng)
    k = int(rng.integers(0, 4))
    ground = np.rot90(ground, k)
    if rng.random() < 0.5:
        ground = ground[:, ::-1]
    ground = np.ascontiguousarray(ground)
    extent = (ground.shape[1] * res_m, ground.shape[0] * res_m)
    field = make_field(extent, rng, slope=slope, density_per_m2=density_per_m2)
    return stamp(ground, res_m, field, rng, shape)
