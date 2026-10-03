import numpy as np, yaml
from touchdown.bennu.paths import data_dir
from touchdown.bennu.dtm import DTM
from touchdown.terrain.hazards import build_hazard_map
from touchdown.analysis.sfd import fit_cumulative_slope
dtm = DTM.load(data_dir() / "nightingale_dtm_5cm.npz")
cfg = yaml.safe_load(open("configs/hazards.yaml"))
print("DTM", dtm.z.shape, "extent", dtm.extent_m, "z range", float(dtm.z.min()), float(dtm.z.max()))
hm = build_hazard_map(dtm.z, dtm.res_m, cfg)
c = np.bincount(hm.classes.ravel(), minlength=3) / hm.classes.size
print("class fractions safe/boulder/steep:", np.round(c, 3))
d = hm.boulder_diameters_m
print("n boulders:", len(d), "max diam m:", round(float(d.max()), 2), "median:", round(float(np.median(d)), 2))
for dmin in (0.3, 0.5, 0.75, 1.0, 1.5):
    a, s, n = fit_cumulative_slope(d, dmin); print(f"dmin={dmin}: slope {a:.2f} +/- {s:.2f}  (n={n})")
# centre 8 m zone safety
ny, nx = dtm.z.shape; r = int(4 / dtm.res_m); cy, cx = ny // 2, nx // 2
zone = hm.classes[cy - r:cy + r, cx - r:cx + r]
yy, xx = np.ogrid[-r:r, -r:r]; disk = (yy ** 2 + xx ** 2) <= r ** 2
print("centre 8 m disk: safe fraction", round(float((zone[disk] == 0).mean()), 3))
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
fig, ax = plt.subplots(1, 2, figsize=(12, 6))
ax[0].imshow(dtm.z, origin="lower", cmap="gray"); ax[0].set_title("DTM height (m)")
ax[1].imshow(hm.classes, origin="lower", cmap="RdYlGn_r", vmin=0, vmax=2); ax[1].set_title("hazard classes (0 safe, 1 boulder, 2 steep)")
plt.savefig(data_dir() / "site_overview.png", dpi=80, bbox_inches="tight"); print(data_dir() / "site_overview.png")
