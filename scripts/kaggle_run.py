"""Run a chunk of the Monte Carlo on Kaggle with the v2 detector, stay inside the session limit, then summarise.

Why a chunk: a Kaggle commit that hits its time limit loses /kaggle/working, so this stops the flights itself at
--max-hours (default 8.5), finishes cleanly, and everything in --out is saved as notebook output. Landings are
resumable (a seed with a JSON file is skipped), so later chunks use other seed ranges or add earlier output as input.

Experiment: `--aim-mode random_safe` (default here) flies from a random aim point that is safe on the true map but may
have a thin margin. This is the harder test; the original max-clearance aim point was too easy for a detector to matter.

Stdlib only. Usage: python scripts/kaggle_run.py --ckpt /kaggle/input/NAME/best.pt --seeds 0 20 --out /kaggle/working/pilot
"""
import argparse
import glob
import os
import subprocess
import sys
import time

ROOT = "/tmp/touch_down"
ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", required=True)
ap.add_argument("--seeds", nargs=2, type=int, default=None)
ap.add_argument("--seed-list", nargs="+", type=int, default=None, help="explicit seeds instead of a range")
ap.add_argument("--out", required=True)
ap.add_argument("--max-hours", type=float, default=8.5)
ap.add_argument("--aim-mode", default="random_safe", choices=["best", "random_safe"])
ap.add_argument("--head-radius", type=float, default=None)
ap.add_argument("--p-abort", type=float, default=None)
ap.add_argument("--nn-ablation", action="store_true", help="judge each flight under the detector false-alarm variants")
a = ap.parse_args()

os.chdir(ROOT)
env = dict(os.environ, TOUCHDOWN_DATA="/tmp/data", TOUCHDOWN_BLENDER="/tmp/blender/blender")
if (a.seeds is None) == (a.seed_list is None):
    ap.error("give exactly one of --seeds or --seed-list")
n_total = len(a.seed_list) if a.seed_list is not None else a.seeds[1] - a.seeds[0]
seed_args = ["--seed-list"] + [str(x) for x in a.seed_list] if a.seed_list is not None else ["--seeds", str(a.seeds[0]), str(a.seeds[1])]
mc = subprocess.Popen([sys.executable, "-m", "touchdown.sim.montecarlo", "--out", a.out] + seed_args + ["--device", "GPU", "--checkpoint", a.ckpt, "--aim-mode", a.aim_mode]
                      + (["--head-radius", str(a.head_radius)] if a.head_radius is not None else [])
                      + (["--p-abort", str(a.p_abort)] if a.p_abort is not None else [])
                      + (["--nn-ablation"] if a.nn_ablation else []),
                      env=env, stdout=open("/tmp/mc.log", "w"), stderr=subprocess.STDOUT)
t0 = time.time()
while mc.poll() is None:
    hrs = (time.time() - t0) / 3600
    done = len(glob.glob(f"{a.out}/landing_*.json"))
    print(f"[{hrs:5.2f} h] landings {done}/{n_total} ({a.aim_mode})", flush=True)
    if hrs > a.max_hours:
        print("time budget reached, stopping flights; finished landings are kept", flush=True)
        mc.terminate()
        break
    time.sleep(60)
mc.wait()
print(open("/tmp/mc.log").read()[-1500:], flush=True)
for mod, name in (("compare_published", "summary.json"), ("sensitivity", "sensitivity.json")) + ((("ablation", "ablation.json"),) if a.nn_ablation else ()):
    r = subprocess.run([sys.executable, "-m", f"touchdown.analysis.{mod}", a.out, "--out", f"{a.out}/{name}"],
                       env=env, capture_output=True, text=True)
    print(r.stdout[-6000:], r.stderr[-1500:], flush=True)
print("DONE", flush=True)
