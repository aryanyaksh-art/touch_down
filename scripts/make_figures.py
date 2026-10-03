"""Figures for the README: Nightingale hillshade, and the hazard map over it."""
import numpy as np, yaml
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource, ListedColormap
from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import data_dir
from touchdown.terrain.hazards import build_hazard_map

dtm = DTM.load(data_dir() / "nightingale_dtm_5cm.npz")
hm = build_hazard_map(dtm.z, dtm.res_m, yaml.safe_load(open("configs/hazards.yaml")))
ext = [0, dtm.extent_m[0], 0, dtm.extent_m[1]]
shade = LightSource(azdeg=300, altdeg=25).hillshade(dtm.z, vert_exag=2, dx=dtm.res_m, dy=dtm.res_m)

plt.rcParams.update({"font.family": "sans-serif", "font.size": 10})
fig, ax = plt.subplots(1, 2, figsize=(10, 4.9), facecolor="white")
ax[0].imshow(shade, origin="lower", cmap="gray", extent=ext)
ax[0].set_title("Nightingale, 5 cm terrain (NASA OLA)", fontsize=11)
ax[1].imshow(shade, origin="lower", cmap="gray", extent=ext)
overlay = np.ma.masked_where(hm.classes == 0, hm.classes)
ax[1].imshow(overlay, origin="lower", extent=ext, alpha=0.55, vmin=1, vmax=2,
             cmap=ListedColormap(["#e8b931", "#d6453d"]))
cx, cy = dtm.extent_m[0] / 2, dtm.extent_m[1] / 2
ax[1].add_patch(plt.Circle((cx, cy), 4.0, fill=False, ec="#2fbf71", lw=1.8))
ax[1].set_title("Hazards: boulders (yellow), steep (red), 8 m zone at patch centre", fontsize=11)
for a in ax:
    a.set_xlabel("east (m)"); a.set_ylabel("north (m)")
plt.tight_layout()
plt.savefig("docs/img/nightingale.png", dpi=100)
print("ok")
