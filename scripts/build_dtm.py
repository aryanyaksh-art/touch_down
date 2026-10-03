import time
from touchdown.bennu.paths import data_dir, SITE_OBJ
from touchdown.bennu.shape import load_obj
from touchdown.bennu.dtm import mesh_to_dtm
import numpy as np
cache = data_dir() / "nightingale_vertices_m.npy"
if cache.exists():
    v = np.load(cache)
else:
    t = time.time(); v, f = load_obj(data_dir() / SITE_OBJ); print("loaded", round(time.time() - t), "s")
    np.save(cache, v)
dtm = mesh_to_dtm(v, 0.05); dtm.save(data_dir() / "nightingale_dtm_5cm.npz")
z = dtm.z; print("dtm", z.shape, "extent m", dtm.extent_m, "z min/max/std", float(z.min()), float(z.max()), float(z.std()))
