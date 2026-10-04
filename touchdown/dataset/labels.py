"""Per-pixel hazard labels from the renderer's position map and the DTM hazard map.

Label values: 0 safe, 1 boulder, 2 steep (see touchdown/terrain/hazards.py), 255 = no surface / ignore.
Because labels are looked up from the 3D position under each pixel, they are exactly registered with the image.
"""
import numpy as np

IGNORE = 255


def pixel_labels(pos: np.ndarray, classes: np.ndarray, res_m: float) -> np.ndarray:
    """pos: (h,w,3) local xyz from the renderer (NaN = no hit). classes: (ny,nx) hazard class raster of the DTM."""
    ny, nx = classes.shape
    hit = np.isfinite(pos[..., 0])
    col = np.floor(np.where(hit, pos[..., 0], 0.0) / res_m + nx / 2.0).astype(np.int64)
    row = np.floor(np.where(hit, pos[..., 1], 0.0) / res_m + ny / 2.0).astype(np.int64)
    inside = hit & (col >= 0) & (col < nx) & (row >= 0) & (row < ny)
    out = np.full(pos.shape[:2], IGNORE, dtype=np.uint8)
    out[inside] = classes[row[inside], col[inside]]
    return out
