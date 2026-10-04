"""Open-loop NFT test: fly a known descent over the real Nightingale tile, render frames in Blender, and check that
the filter, using only the coarse onboard DTM and the images, tracks the truth.

Open loop means the trajectory is prescribed (no guidance feedback). Output: docs/img/nft_openloop.png
"""
import sys
import time

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import data_dir
from touchdown.dataset.generate import sun_vector
from touchdown.gnc.dynamics import Bennu, SiteFrame
from touchdown.nav.catalog import make_onboard_model
from touchdown.nav.ekf import NavEKF
from touchdown.nav.nft import NFTConfig, nft_update
from touchdown.render.camera import Camera, look_at
from touchdown.render.client import BlenderRenderer


def rot_about(axis, deg):
    a = np.asarray(axis, float) / np.linalg.norm(axis)
    t = np.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(t) * K + (1 - np.cos(t)) * K @ K


def main(n_frames=17, dt=20.0, seed=0):
    rng = np.random.default_rng(seed)
    path = data_dir() / "nightingale_dtm_5cm.npz"
    dtm = DTM.load(path)
    frame = SiteFrame(dtm.origin_body, dtm.R_body_from_local, Bennu())
    cam = Camera(640, 480, 44.0)
    model = make_onboard_model(dtm.z, dtm.res_m, seed=1)
    print("onboard levels:", [(l.hf.z.shape, l.hf.res, len(l.catalog.points)) for l in model.levels])

    sun_true = sun_vector(250, 40)
    sun_nav = rot_about([0, 0, 1], 1.0) @ sun_true                       # navigation knows the sun to ~1 deg
    R = look_at(np.array([0, 0, 1.0]), np.array([0, 0, 0.0]))            # fixed nadir attitude (star tracker: exact)
    a_bias = np.array([1e-6, -1e-6, 5e-7])                               # unmodelled acceleration in truth only

    x_true = np.array([2.0, -1.0, 40.0])
    v_true = np.array([0.03, -0.02, -0.10])
    err0 = np.array([0.30, -0.25, 0.40])
    ekf = NavEKF(frame, np.r_[x_true + err0, v_true + [0.01, -0.01, 0.01]],
                 np.diag([0.4 ** 2] * 3 + [0.03 ** 2] * 3), sigma_a=2e-6)
    cfg = NFTConfig()

    log = {"t": [], "alt": [], "err": [], "sig": [], "nfeat": [], "nis": [], "res": []}
    with BlenderRenderer(path, samples=16) as r:
        for k in range(n_frames):
            t0 = time.time()
            f = r.render(cam, x_true, R, sun_true)
            img = f["rgb"][..., 0].astype(np.float64)
            res = nft_update(ekf, model, cam, img, R, sun_nav, cfg)
            e = ekf.pos - x_true
            sig = np.sqrt(np.trace(ekf.P[:3, :3]) / 3)
            log["t"].append(k * dt); log["alt"].append(x_true[2]); log["err"].append(np.linalg.norm(e))
            log["sig"].append(sig); log["nfeat"].append(res.report.n_used)
            log["nis"].append(np.mean(res.report.nis) if res.report.nis else np.nan)
            log["res"].extend(res.residuals_px)
            e3 = e @ np.linalg.solve(ekf.P[:3, :3], e)
            print(f"frame {k:2d} alt {x_true[2]:5.1f} m  matched {res.n_matched:2d}/{res.n_selected:2d} used {res.report.n_used:2d} "
                  f" err {np.linalg.norm(e):.3f} m (sigma {sig:.3f}, NEES {e3:.1f})  {time.time() - t0:.1f}s", flush=True)
            xl, vl = frame.propagate(x_true, v_true, dt, a_bias)
            x_true, v_true = xl, vl
            ekf.predict(dt)

    t = np.array(log["t"])
    fig, ax = plt.subplots(1, 3, figsize=(14, 3.8))
    ax[0].plot(t, log["err"], "o-", label="position error")
    ax[0].plot(t, np.sqrt(3) * np.array(log["sig"]), "--", label="filter 1-sigma (3-D)")
    ax[0].set(xlabel="time (s)", ylabel="m", title="NFT position error vs. truth"); ax[0].legend()
    ax[1].plot(t, log["nfeat"], "o-"); ax[1].set(xlabel="time (s)", title="landmarks used per frame")
    ax[2].hist(np.array(log["res"]).ravel(), bins=30); ax[2].set(xlabel="correlation offset (px)", title="match residuals")
    plt.tight_layout(); plt.savefig("docs/img/nft_openloop.png", dpi=100)
    print("final error", log["err"][-1], "m; median", np.median(log["err"]), "m")


if __name__ == "__main__":
    main(*(int(a) for a in sys.argv[1:2]))
