"""Power-law size-frequency fit. Cumulative N(>D) ~ D^alpha (alpha < 0), the convention used for Bennu."""
import numpy as np


def fit_cumulative_slope(d: np.ndarray, dmin: float) -> tuple[float, float, int]:
    """Maximum-likelihood fit (Clauset et al. 2009) for a continuous power law above dmin.

    The density exponent is 1 + n / sum(ln(d/dmin)); the cumulative slope is minus that exponent plus one,
    i.e. alpha = -n / sum(ln(d/dmin)). Returns (alpha, 1-sigma uncertainty, n).
    """
    x = np.asarray(d, dtype=float)
    x = x[x >= dmin]
    n = len(x)
    if n < 5:
        return float("nan"), float("nan"), n
    s = np.log(x / dmin).sum()
    return -n / s, abs(-n / s) / np.sqrt(n), n
