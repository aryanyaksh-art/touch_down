"""Hard-negative retraining of the hazard detector on Kaggle (notebook 13). Stdlib only; run it from a notebook cell.

Pipeline (each step prints START/END; everything is resumable except the training runs):
  1. render the v2 recipe again (mixed boulder shapes; real west-half train frames, real east-half test frames) plus a
     POOL of 2,000 extra synthetic low-altitude frames from 20 new terrains
  2. score the shipped detector (v2) on the held-out east-half real frames
  3. mine hard negatives: frames of train + real_train + pool where v2 confidently calls safe ground a hazard
  4. fine-tune v2 three ways from the same start, same epochs and learning rate:
       ctrl       same NUMBER of frames as the hard set but chosen at random (the control: more data, no hardness)
       hn_frames  hard frames oversampled
       hn_pixel   hard frames oversampled + loss on the hardest safe pixels in every batch
  5. score every variant on the same east-half frames and compare at matched hazard recall

Selection rule (fixed before looking at any result): of hn_frames and hn_pixel, the one with the lower false-hazard
rate at 80% pixel hazard recall in the 0-10 m bin (70% if 80% is out of range) goes on to the closed-loop test
(notebook 14). ctrl is never selected; it only shows what plain extra training does.

Outputs in OUT (/kaggle/working/hn_run): <name>_best.pt, eval_*.json, compare.md, hard.json(.scores.json), chosen.txt.
"""
import glob
import json
import os
import subprocess
import sys
import time

DS = "/tmp/ds_hn"
OUT = "/kaggle/working/hn_run"
V2 = "/tmp/best.pt"                       # joined by the notebook from the dataset parts
EPOCHS = int(os.environ.get("HN_EPOCHS", "12"))
LR = os.environ.get("HN_LR", "5e-4")
PY = sys.executable
ENV = dict(os.environ, TOUCHDOWN_DATA="/tmp/data", TOUCHDOWN_BLENDER="/tmp/blender/blender")
os.makedirs(OUT, exist_ok=True)
os.chdir("/tmp/touch_down")
T0 = time.time()


def log(msg):
    print(f"[{(time.time() - T0) / 3600:5.2f} h] {msg}", flush=True)


def gen(split, terrains, frames, shape=None, alt_max=None):
    cmd = [PY, "-m", "touchdown.dataset.generate", "--out", DS, "--split", split, "--terrains", str(terrains[0]),
           str(terrains[1]), "--frames", str(frames), "--device", "GPU"]
    cmd += ["--shape", shape] if shape else []
    cmd += ["--alt-max", str(alt_max)] if alt_max else []
    return cmd


def run_parallel(jobs, what):
    """jobs: list of (name, cmd, env_extra, stdout_path or None). Runs them at the same time, waits for all."""
    log(f"START {what}")
    procs = []
    for name, cmd, extra, stdout in jobs:
        f = open(stdout, "w") if stdout else None
        procs.append((name, subprocess.Popen(cmd, env=dict(ENV, **extra), stdout=f or None,
                                             stderr=subprocess.STDOUT if f else None), f))
    for name, p, f in procs:
        rc = p.wait()
        if f:
            f.close()
        log(f"  {name} rc={rc}")
        if rc != 0:
            raise SystemExit(f"{name} failed")
    log(f"END   {what}")


def smoke():
    """A few minutes on a tiny dataset through every code path (mining, hard/control/pixel training, scoring), so a bug in
    the torch code fails now and not after an hour of rendering."""
    global DS
    real_ds, DS = DS, "/tmp/ds_smoke"
    run_parallel([("smoke render", ["sh", "-c", " && ".join(" ".join(c) for c in [
        gen("train", (0, 2), 6, "mixed"), gen("val", (0, 1), 6, "mixed"), gen("pool", (0, 2), 6, "mixed", 22),
        gen("real_train", (0, 1), 8), gen("real_test", (0, 1), 8)])], {}, f"{OUT}/smoke_render.log")], "smoke: render tiny dataset")
    sm = f"{OUT}/smoke"
    os.makedirs(sm, exist_ok=True)
    run_parallel([("smoke mine", [PY, "-m", "touchdown.vision.mining", "--data", DS, "--ckpt", V2, "--splits", "train",
                                  "real_train", "pool", "--top-frac", "0.5", "--out", f"{sm}/hard.json"], {}, f"{sm}/mine.log")],
                 "smoke: mine")
    base = [PY, "-m", "touchdown.vision.train", "--data", DS, "--epochs", "1", "--bs", "2", "--init", V2, "--train-splits",
            "train", "real_train", "pool", "--test-split", "real_test", "--hard", f"{sm}/hard.json"]
    for name, extra in (("ctrl", ["--hard-control"]), ("pixel", ["--hn-lambda", "1.0"])):
        run_parallel([(f"smoke train {name}", base + ["--out", f"{sm}/{name}"] + extra, {}, f"{sm}/train_{name}.log")],
                     f"smoke: train {name}")
    run_parallel([("smoke eval", [PY, "-m", "touchdown.vision.evaluate", "--data", DS, "--split", "real_test", "--ckpt",
                                  f"{sm}/pixel/best.pt", "--out", f"{sm}/eval.json"], {}, f"{sm}/eval.md")], "smoke: score")
    log("SMOKE_OK")
    DS = real_ds


def main():
    assert os.path.getsize(V2) == 17520863, "join the v2 checkpoint first (notebook cell 2)"
    smoke()
    # 1. render: two streams at once, balanced by frame count (the dataset recipe is the same as detector v2's)
    run_parallel([
        ("stream A", ["sh", "-c", " && ".join(" ".join(c) for c in [
            gen("real_train", (0, 1), 1500), gen("real_test", (0, 1), 300), gen("val", (0, 5), 40, "mixed"),
            gen("pool", (0, 20), 100, "mixed", 22)])], {}, f"{OUT}/render_A.log"),
        ("stream B", gen("train", (0, 40), 100, "mixed"), {}, f"{OUT}/render_B.log"),
    ], "render dataset + pool")
    n = sum(1 for _ in open(f"{DS}/meta.jsonl"))
    log(f"dataset has {n} frames")

    # 2-3. baseline score and mining
    ev = [PY, "-m", "touchdown.vision.evaluate", "--data", DS, "--split", "real_test"]
    run_parallel([("eval v2", ev + ["--ckpt", V2, "--out", f"{OUT}/eval_v2.json"], {}, f"{OUT}/eval_v2.md")], "score v2")
    run_parallel([("mine", [PY, "-m", "touchdown.vision.mining", "--data", DS, "--ckpt", V2, "--splits", "train",
                            "real_train", "pool", "--top-frac", "0.3", "--out", f"{OUT}/hard.json"], {}, f"{OUT}/mine.log")],
                 "mine hard negatives")
    print(open(f"{OUT}/mine.log").read()[-400:], flush=True)

    # 4. three fine-tunes from the same start; two GPUs, so two at a time
    def train(name, extra_args, gpu):
        cmd = [PY, "-m", "touchdown.vision.train", "--data", DS, "--out", f"{OUT}/{name}", "--epochs", str(EPOCHS),
               "--lr", LR, "--init", V2, "--train-splits", "train", "real_train", "pool", "--test-split", "real_test",
               "--hard", f"{OUT}/hard.json"] + extra_args
        return (name, cmd, {"CUDA_VISIBLE_DEVICES": str(gpu)}, f"{OUT}/train_{name}.log")

    run_parallel([train("ctrl", ["--hard-control"], 0), train("hn_frames", [], 1)], "fine-tune ctrl + hn_frames")
    run_parallel([train("hn_pixel", ["--hn-lambda", "1.0"], 0)], "fine-tune hn_pixel")

    # 5. score all variants on the held-out frames, compare, choose
    names = ["ctrl", "hn_frames", "hn_pixel"]
    run_parallel([(f"eval {k}", ev + ["--ckpt", f"{OUT}/{k}/best.pt", "--out", f"{OUT}/eval_{k}.json"], {},
                   f"{OUT}/eval_{k}.md") for k in names], "score variants")
    evals = ["v2=" + f"{OUT}/eval_v2.json"] + [f"{k}={OUT}/eval_{k}.json" for k in names]
    run_parallel([("compare", [PY, "-m", "touchdown.vision.compare"] + evals + ["--out", f"{OUT}/compare.md"], {}, None)],
                 "compare at matched recall")

    sys.path.insert(0, "/tmp/touch_down")
    from touchdown.vision.compare import false_hazard_at_recall
    score = {}
    for k in ("hn_frames", "hn_pixel"):
        sweep = json.load(open(f"{OUT}/eval_{k}.json"))["0-10 m"]["sweep"]
        v = false_hazard_at_recall(sweep, 0.8)
        score[k] = v if v is not None else false_hazard_at_recall(sweep, 0.7)
    ok = {k: v for k, v in score.items() if v is not None}
    chosen = min(ok, key=ok.get) if ok else "hn_pixel"
    open(f"{OUT}/chosen.txt", "w").write(chosen + "\n")
    log(f"false-hazard rate at 80% recall (0-10 m): {score}; chosen: {chosen}")
    for k in names:
        os.replace(f"{OUT}/{k}/best.pt", f"{OUT}/{k}_best.pt")
        for f in glob.glob(f"{OUT}/{k}/last.pt"):
            os.remove(f)
    log("DONE")


if __name__ == "__main__":
    main()
