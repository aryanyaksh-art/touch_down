"""Compare a synthetic terrain realization with the real Nightingale tile (appearance and hazard statistics)."""
import numpy as np, yaml
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
from touchdown.analysis.sfd import fit_cumulative_slope
from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import data_dir
from touchdown.terrain.boulders import make_terrain
from touchdown.terrain.hazards import build_hazard_map

cfg = yaml.safe_load(open("configs/hazards.yaml"))
real = DTM.load(data_dir() / "nightingale_dtm_5cm.npz")
hm_real = build_hazard_map(real.z, real.res_m, cfg)
rock = hm_real.rock_height >= cfg["hazard_object_size_m"]
import sys
dens = float(sys.argv[1]) if len(sys.argv) > 1 else 0.055
zs = [make_terrain(real.z, rock, real.res_m, seed=s, density_per_m2=dens) for s in (0, 1, 2)]

def stats(name, z):
    hm = build_hazard_map(z, real.res_m, cfg)
    c = np.bincount(hm.classes.ravel(), minlength=3) / hm.classes.size
    d = hm.boulder_diameters_m
    a, s, n = fit_cumulative_slope(d, 0.5)
    print(f"{name:10s} safe/boulder/steep {np.round(c, 3)}  n={len(d)}  slope(dmin .5)={a:.2f}  z std {z.std():.2f}")
stats("real", real.z)
for i, z in enumerate(zs): stats(f"synth{i}", z)

fig, ax = plt.subplots(1, 3, figsize=(15, 5))
for a, z, t in zip(ax, [real.z, zs[0], zs[1]], ["real Nightingale (test)", "synthetic seed 0 (train)", "synthetic seed 1 (train)"]):
    ls = LightSource(300, 25).hillshade(z, vert_exag=2, dx=real.res_m, dy=real.res_m)
    a.imshow(ls, origin="lower", cmap="gray"); a.set_title(t); a.axis("off")
plt.tight_layout(); plt.savefig("docs/img/synthetic_terrain.png", dpi=80)
