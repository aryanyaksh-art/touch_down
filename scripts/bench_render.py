"""Time the renderer: Blender-side (beauty render, position render) versus the round trip. Usage: bench_render.py [CPU|GPU] [N]"""
import sys
import time

import numpy as np

from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera, look_at
from touchdown.render.client import BlenderRenderer

device = sys.argv[1] if len(sys.argv) > 1 else "CPU"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
cam = Camera(640, 480, 44.0)
sun = np.array([0.5, 0.3, 0.8])
t_start = time.time()
with BlenderRenderer(data_dir() / "nightingale_dtm_5cm.npz", samples=16, device=device) as r:
    print(f"startup {time.time() - t_start:.1f}s")
    for want_pos in (True, False):
        rows = []
        for k in range(n):
            pos = np.array([0.5 * k, 0.0, 20.0 + k])
            t0 = time.time()
            r.render(cam, pos, look_at(pos, pos * [1, 1, 0]), sun, want_pos=want_pos)
            rows.append((time.time() - t0, r.last_timing["t_beauty"], r.last_timing["t_pos"], r.last_timing["t_total"]))
        a = np.array(rows[1:])  # skip the first (warm-up)
        print(f"want_pos={want_pos}: round trip {a[:, 0].mean():.2f}s | beauty {a[:, 1].mean():.2f}s | pos {a[:, 2].mean():.2f}s | worker total {a[:, 3].mean():.2f}s")
