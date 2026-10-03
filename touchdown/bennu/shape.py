"""Load the NASA SVS Nightingale site tile (OBJ, km) into numpy arrays."""
from pathlib import Path

import numpy as np


def load_obj(path: str | Path, scale: float = 1000.0) -> tuple[np.ndarray, np.ndarray]:
    """Return (vertices[m], faces[0-based]). Fast path: only 'v' and 'f' lines, triangle faces.

    scale converts file units to metres (the SVS tile is in km).
    """
    verts, faces = [], []
    with open(path, "rb") as f:
        for line in f:
            if line.startswith(b"v "):
                verts.append(line[2:])
            elif line.startswith(b"f "):
                faces.append(line[2:])
    v = np.fromstring(b"\n".join(verts), sep=" ", dtype=np.float64).reshape(-1, 3) * scale
    # face tokens may be "i", "i/t", "i//n" or "i/t/n"; keep the vertex index only
    fb = b" ".join(faces).replace(b"/", b" ")
    raw = np.fromstring(fb, sep=" ", dtype=np.int64)
    toks = len(faces[0].split()) if faces else 3
    per = len(raw) // len(faces)
    stride = per // toks if toks else 1
    f_idx = raw.reshape(len(faces), toks, stride)[:, :, 0] - 1
    return v, f_idx
