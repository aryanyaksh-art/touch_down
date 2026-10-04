import numpy as np

from touchdown.dataset.labels import IGNORE, pixel_labels


def test_labels_lookup_matches_cells_and_ignores_misses():
    res = 0.5
    classes = np.zeros((10, 10), np.uint8)
    classes[7, 2] = 1  # row 7 (north), col 2
    # local x,y of the centre of cell (row 7, col 2): x = (col+0.5-nx/2)*res, y = (row+0.5-ny/2)*res
    x = (2 + 0.5 - 5) * res
    y = (7 + 0.5 - 5) * res
    pos = np.full((2, 3, 3), np.nan, np.float32)
    pos[0, 0] = [x, y, 1.0]       # on the boulder cell
    pos[0, 1] = [-1.0, -1.0, 0.0]  # safe cell
    pos[0, 2] = [100.0, 0.0, 0.0]  # off the tile
    out = pixel_labels(pos, classes, res)
    assert out[0, 0] == 1 and out[0, 1] == 0
    assert out[0, 2] == IGNORE and (out[1] == IGNORE).all()
