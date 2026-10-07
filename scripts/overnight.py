"""Run the long Colab jobs from ONE foreground process, with a heartbeat.

Run it from a notebook cell (`!python scripts/overnight.py`), not from the Colab terminal: a free Colab runtime is
shut down after ~90 minutes of "idle", and work started from the terminal does not count as notebook activity. A cell
that is executing and printing does. Free Colab also ends sessions at ~12 h, so everything here is resumable.

Jobs (run concurrently on one T4 and 2 vCPUs):
  mc  : the closed-loop Monte Carlo, seeds 0-999 with the v1 detector (skips landings already on Drive)
  v2  : detector v2 pipeline: render a new dataset (angular boulders + real west-half frames), score v1 on the
        held-out east half, train v2 on synthetic + real-west, score v2 on the same east frames

Stdlib only. Paths assume the Colab layout from scripts/colab_setup.sh and Drive mounted at /content/drive.
"""
import glob
import os
import subprocess
import sys
import threading
import time

D = "/content/drive/MyDrive/touchdown"
MC = f"{D}/montecarlo/v1"
CK1 = f"{D}/runs/unet_v1/best.pt"
DS2 = f"{D}/dataset_v2"
RUN2 = f"{D}/runs/unet_v2"
LOGS = "/content/logs"
MAX_HOURS = 11.5

os.makedirs(LOGS, exist_ok=True)
os.makedirs(RUN2, exist_ok=True)
os.chdir("/content/touch_down")
ENV = dict(os.environ, TOUCHDOWN_DATA="/content/data", TOUCHDOWN_BLENDER="/content/blender/blender")
PY = sys.executable


def gen(split, terrains, frames, shape=None):
    cmd = [PY, "-m", "touchdown.dataset.generate", "--out", DS2, "--split", split, "--terrains", str(terrains[0]),
           str(terrains[1]), "--frames", str(frames), "--device", "GPU"]
    return cmd + (["--shape", shape] if shape else [])


def evaluate(ckpt, split, tag):
    return [PY, "-m", "touchdown.vision.evaluate", "--data", DS2, "--ckpt", ckpt, "--split", split,
            "--out", f"{RUN2}/eval_{tag}.json"], f"{RUN2}/eval_{tag}.md"


V2_STEPS = [
    ("render real west-half training frames", gen("real_train", (0, 1), 1500), None),
    ("render real east-half test frames", gen("real_test", (0, 1), 300), None),
    ("render synthetic training terrains (mixed shapes)", gen("train", (0, 40), 100, "mixed"), None),
    ("render synthetic validation terrains (mixed shapes)", gen("val", (0, 5), 40, "mixed"), None),
    ("score detector v1 on the east-half real frames", *evaluate(CK1, "real_test", "v1_on_real_test")),
    ("train detector v2", [PY, "-m", "touchdown.vision.train", "--data", DS2, "--out", RUN2, "--epochs", "30",
                           "--train-splits", "train", "real_train", "--test-split", "real_test"], None),
    ("score detector v2 on the east-half real frames", *evaluate(f"{RUN2}/best.pt", "real_test", "v2_on_real_test")),
]

state = {"v2_step": "starting", "v2_done": False, "v2_failed": []}


def run_v2():
    for name, cmd, md in V2_STEPS:
        state["v2_step"] = name
        print(f"[v2] START {name}", flush=True)
        t0 = time.time()
        log = open(f"{LOGS}/v2_{name[:20].replace(' ', '_')}.log", "w")
        out = open(md, "w") if md else log
        rc = subprocess.run(cmd, env=ENV, stdout=out, stderr=log).returncode
        print(f"[v2] END   {name} rc={rc} ({(time.time() - t0) / 60:.1f} min)", flush=True)
        if rc != 0:
            state["v2_failed"].append(name)
    state["v2_done"] = True


def count(pattern):
    return len(glob.glob(pattern))


def meta_lines():
    try:
        return sum(1 for _ in open(f"{DS2}/meta.jsonl"))
    except OSError:
        return 0


def last_epoch():
    try:
        lines = [l for l in open(f"{LOGS}/v2_train_detector_v2.log") if l.startswith("epoch")]
        return lines[-1].strip() if lines else ""
    except OSError:
        return ""


def main():
    t_start = time.time()
    mc_log = open(f"{LOGS}/mc.log", "w")
    mc = subprocess.Popen([PY, "-m", "touchdown.sim.montecarlo", "--out", MC, "--seeds", "0", "1000", "--device", "GPU",
                           "--checkpoint", CK1], env=ENV, stdout=mc_log, stderr=subprocess.STDOUT)
    threading.Thread(target=run_v2, daemon=True).start()
    while True:
        hrs = (time.time() - t_start) / 3600
        mc_alive = mc.poll() is None
        print(f"[{hrs:5.2f} h] landings {count(MC + '/landing_*.json'):4d}/1000 {'(running)' if mc_alive else '(finished)'}"
              f" | v2: {state['v2_step']} | frames {meta_lines()} {last_epoch()}", flush=True)
        if (not mc_alive and state["v2_done"]) or hrs > MAX_HOURS:
            break
        time.sleep(60)
    if mc.poll() is None:
        mc.terminate()
    print("DONE. v2 steps failed:", state["v2_failed"] or "none", flush=True)


if __name__ == "__main__":
    main()
