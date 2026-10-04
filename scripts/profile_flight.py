"""cProfile one landing to find where the non-render time goes. Usage: profile_flight.py [SEED]"""
import cProfile
import pstats
import sys

from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera
from touchdown.render.client import BlenderRenderer
from touchdown.sim.assets import load_assets
from touchdown.sim.landing import SimConfig, fly

path = data_dir() / "nightingale_dtm_5cm.npz"
site = load_assets(path)
with BlenderRenderer(path, samples=16) as r:
    pr = cProfile.Profile()
    pr.enable()
    res = fly(site, r, Camera(640, 480, 44.0), SimConfig(), seed=int(sys.argv[1]) if len(sys.argv) > 1 else 0)
    pr.disable()
st = pstats.Stats(pr).sort_stats("cumulative")
st.print_stats(28)
