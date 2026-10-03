"""Ground-truth hazard map from a DTM.

Classes: 0 safe, 1 boulder (rock >= hazard height above local ground), 2 steep (slope > max slope).
Boulder wins over steep where both apply. Thresholds are in configs/hazards.yaml (see its notes on which
are confirmed vs assumed).
"""
from dataclasses import dataclass

import numpy as np
from scipy import ndimage

SAFE, BOULDER, STEEP = 0, 1, 2


@dataclass
class HazardMap:
    classes: np.ndarray      # (ny, nx) uint8
    slope_deg: np.ndarray    # (ny, nx) float32
    rock_height: np.ndarray  # (ny, nx) float32, height above estimated ground
    boulder_ids: np.ndarray  # (ny, nx) int32, 0 = background, >0 = connected rock component
    boulder_diameters_m: np.ndarray  # equivalent-circle diameter per id (index i -> id i+1)


def slope_map(z: np.ndarray, res_m: float, window_m: float) -> np.ndarray:
    sigma_px = max(window_m / res_m / 2.0, 0.5)
    zs = ndimage.gaussian_filter(z.astype(np.float64), sigma_px)
    gy, gx = np.gradient(zs, res_m)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def rock_height_map(z: np.ndarray, res_m: float, opening_m: float) -> np.ndarray:
    k = max(int(round(opening_m / res_m)), 3) | 1  # odd window
    ground = ndimage.grey_opening(z, size=(k, k))
    ground = ndimage.uniform_filter(ground, size=k)  # smooth the blocky opening
    return (z - ground).astype(np.float32)


def build_hazard_map(z: np.ndarray, res_m: float, cfg: dict) -> HazardMap:
    slope = slope_map(z, res_m, cfg["slope_window_m"])
    h = rock_height_map(z, res_m, cfg["ground_opening_m"])
    rock = h >= cfg["hazard_object_size_m"]
    rock = ndimage.binary_opening(rock, iterations=1)  # drop single-pixel noise
    ids, n = ndimage.label(rock)
    areas = ndimage.sum(rock, ids, index=np.arange(1, n + 1)) * res_m ** 2 if n else np.zeros(0)
    diam = 2.0 * np.sqrt(areas / np.pi)
    classes = np.zeros(z.shape, dtype=np.uint8)
    classes[slope > cfg["max_slope_deg"]] = STEEP
    classes[rock] = BOULDER
    return HazardMap(classes, slope, h, ids.astype(np.int32), diam)
