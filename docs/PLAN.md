# TouchDown — Recreating OSIRIS-REx Autonomous TAG at Bennu (TKS Build)

## Context

**Goal:** a TKS Build. Recreate the system that let OSIRIS-REx land on Bennu by itself on 2020-10-20: **Natural Feature Tracking (NFT)** navigation plus the onboard **hazard-map back-away** logic. Then add an extension the real spacecraft did not have: a **neural-network hazard detector** that runs on board during descent. Validate with 1,000 simulated landings, compared against published mission and Bennu data. An expert in space robotics reviews it, so the approach must hold up technically and the write-up must be honest about what is faithful to the mission and what is an extension.

**Constraints**
- Deadline is about 1 month (target review around 2026-11-01).
- The laptop is a Snapdragon X (ARM64) with 16 GB RAM and no NVIDIA GPU. Rendering, training, and the Monte Carlo run on **free Colab/Kaggle GPUs**. Code, the filter, and the website are developed locally.
- The repo is empty (`github.com/aryanyaksh-art/touch_down`), and so is the local folder.
- Planning uses Opus 5.5. **Coding uses Sonnet 5.5**, so this plan has to be specific enough to execute without guessing.
- Decisions made: a faithful NFT baseline plus an NN extension; Blender on Colab for rendering; U-Net segmentation; GitHub Pages for the site.

**Faithful vs. extension (state this up front in the README and to the expert)**
| Component | Real OSIRIS-REx | TouchDown |
|---|---|---|
| Navigation | NFT: render DTM feature templates on board, correlate with NavCam images, Kalman filter | Same method, implemented here |
| Hazard avoidance | Hazard map built on the ground and loaded on board; back-away at about 5 m if the NFT-predicted contact point is unsafe | Same (the **baseline**) |
| Onboard hazard *detection* | None | **Extension:** U-Net on descent images, fused into a live hazard map |
| Descent | Orbit departure → Checkpoint (~125 m) → Matchpoint (~54 m) → contact at ~10 cm/s | Same sequence |

## Published comparison targets (look up exact values in Week 1 and record them in `docs/references.md`)
| Metric | Published value | Source to cite |
|---|---|---|
| Delivery accuracy | within ~1 m of target | Lauretta et al. 2022 *Science*; Berry et al. 2022 (TAG flight ops) |
| NFT predicted vs. actual contact | 3.5 cm and 1.4 s | Olds et al., NFT flight performance papers |
| Pre-TAG predicted abort chance | <6% | NASA/UA countdown-to-TAG release |
| Back-away decision altitude | ~5 m | NASA NFT/hazard-map description |
| Checkpoint / Matchpoint altitude | ~125 m / ~54 m; contact −10 cm/s | NASA countdown-to-TAG |
| Boulder size-frequency distribution slope | global −2.9 ± 0.3; candidate sites −2.3 to −3.0 | DellaGiustina et al. 2019 *Nat. Astron.*; Burke et al. 2021 *Remote Sens.* |
| Bennu constants | GM ≈ 4.89 m³/s², rotation period ≈ 4.296 h, mean radius ≈ 245 m, albedo ≈ 0.044 | Scheeres 2019; Barnouin 2019; Lauretta 2019 |
| Hazard definition (rock height and slope thresholds), hazard-map resolution, Nightingale safe-area size | **look these up** | Berry et al. 2022; Enos et al.; Olds et al. |
| NavCam (TAGCAMS) | 2592×1944 px, ~44°×32° FOV | Bos et al. 2018 TAGCAMS paper |

## Architecture

```
touch_down/
  README.md  CLAUDE.md  pyproject.toml (uv)  .gitignore (data/, outputs/, *.blend1)
  configs/            bennu.yaml camera.yaml terrain.yaml tag.yaml dispersions.yaml train.yaml
  touchdown/
    bennu/            constants.py, shape.py (load OBJ, extract site patch, mesh→heightfield DTM), sun.py
    terrain/          boulders.py (power-law size sampling + placement), hazards.py (truth hazard map: rock height/slope)
    render/           camera.py (pinhole, NavCam-like intrinsics), blender_worker.py (runs inside Blender), client.py (sends poses, gets frames)
    dataset/          generate.py (random poses/sun → RGB + semantic mask + depth), manifest
    vision/           unet.py, train.py, infer.py, metrics.py (IoU, per-size recall)
    nav/              catalog.py (pick maplets from DTM), onboard_render.py (NumPy photometric maplet render + shadows),
                      correlate.py (NCC template match → pixel residuals), ekf.py (pos/vel EKF, NIS check)
    gnc/              dynamics.py (Bennu-fixed rotating frame: point-mass gravity + Coriolis + centrifugal, RK4),
                      targeting.py (Checkpoint/Matchpoint burns via STM differential correction),
                      tag_sequence.py (state machine), backaway.py (baseline: prior hazard map; extension: NN live map)
    sim/              landing.py (closed loop), dispersions.py, montecarlo.py (resumable, sharded)
    analysis/         sfd.py (power-law MLE fit, Clauset method), compare_published.py, plots.py, export_replays.py
  notebooks/          01_render_dataset.ipynb  02_train_unet.ipynb  03_montecarlo.ipynb  (Colab/Kaggle)
  web/                Vite + React + TS replay viewer → GitHub Pages via Actions
  docs/               method.md, references.md, validation.md, expert_prep.md, PLAN.md (copy of this plan)
  tests/              pytest unit tests per module
```

### Key design decisions
1. **Two renderers, on purpose.** The "truth" camera is Blender Cycles: the full-resolution site mesh plus injected boulders, with real shadows. The onboard NFT renderer is a simple NumPy photometric model working on a *coarser* DTM, which is what the spacecraft actually did. The mismatch between them is realistic model error, and it is the main reason NFT has residuals at all.
2. **Terrain.** Use NASA's public Bennu shape model (SBN/PDS shape-model page or SBMT; the OLA v20 global model, or the Nightingale regional DTM if it fits within limits). Crop a patch of about 200×200 m around Nightingale (~56°N, ~43°E; verify the coordinates). Inject boulders smaller than the model resolution: diameters from a power law with slope −2.9 (configurable), placed as rock meshes partly buried in the surface. Each boulder gets an object index → pixel-perfect masks.
3. **Labels** (3 classes): `0 safe`, `1 boulder` (rock taller than the hazard height), `2 unsafe` (local slope above the threshold, or terrain the camera can't see because it's in shadow). Derived in Blender from object-index and normal/depth passes plus `hazards.py`.
4. **Blender on Colab** runs as a headless Linux Blender (downloaded tarball, `blender -b -P blender_worker.py`). This avoids `bpy`/Python version conflicts. The worker is a persistent process: it loads a terrain once, then answers pose requests over stdin/stdout JSON. The closed-loop sim talks to it through `render/client.py`.
5. **Monte Carlo cost:** 50 terrain realizations × 20 trajectory dispersions = 1,000 landings, each about 20 NavCam frames at 640×480 → ~20k renders ≈ 6–10 GPU-hours. Shard it across Colab/Kaggle sessions and make it resumable: results go to per-landing JSON so a lost session doesn't lose work.
6. **Experiment design (the interesting result).** Run each landing under two scenarios: (A) the onboard hazard map is complete, and (B) the hazard map is *stale*, missing X% of boulders (for example, ones too small for the ground team to map). Compare the baseline against baseline+NN for safe-contact rate, false back-aways, and missed hazards. This shows *when* an onboard detector actually adds value.
7. **NN extension decision rule:** after Matchpoint, segment each frame, project the hazard pixels onto the DTM using the NFT state, and fuse them into a live grid (log-odds). At the 5 m decision point, back away if the predicted contact ellipse overlaps live or prior hazards. Retargeting to a new site is a stretch goal; the real mission did not do it.

## 4-week schedule (each week ends with something that runs)

**Week 1: Foundation and rendering** (to ~Oct 11)
- Scaffold the repo. Install a native ARM64 Python 3.12 with `uv` locally for the core, nav, and gnc code (numpy, scipy, trimesh, pyyaml, pytest). Torch/Blender work runs on Colab only.
- Keep `data/` out of OneDrive sync: put it under `%LOCALAPPDATA%` or exclude it, because shape models are hundreds of MB.
- Download the Bennu model; write `shape.py` and the Nightingale patch → DTM heightfield.
- `boulders.py`: sample sizes from the power law, place rocks, unit test that the injected size distribution reproduces −2.9.
- `blender_worker.py` and `camera.py`: render RGB + mask + depth for one pose; check the images visually against real OSIRIS-REx NavCam/PolyCam images of Nightingale.
- Start `01_render_dataset.ipynb`: about 5,000 labeled images (altitudes 5–150 m, randomized sun angle, camera pointing, and boulder field).
- Fill in `docs/references.md` with the exact published values.

**Week 2: Vision and NFT** (to ~Oct 18)
- `02_train_unet.ipynb`: U-Net (ResNet-18 encoder via `segmentation_models_pytorch`), 512×512 crops, Dice + cross-entropy loss, train/val/test split by *terrain realization* so test terrain is never seen in training. Report IoU and boulder recall by size bin.
- NFT: `catalog.py` picks ~30–60 high-texture maplets near the site; `onboard_render.py` predicts each feature's appearance from the predicted pose and sun; `correlate.py` uses normalized cross-correlation (NCC) to get pixel residuals; `ekf.py` is a 6-state position/velocity EKF with camera-projection measurements and a NIS gate.
- Open-loop test: fly a known trajectory, render frames, and confirm the EKF converges and its covariance is consistent (NEES test).

**Week 3: Guidance and closed loop** (to ~Oct 25)
- `dynamics.py` (unit test: energy/Jacobi constant is conserved without burns), `targeting.py` (Checkpoint/Matchpoint burns with execution errors), `tag_sequence.py`, `backaway.py`.
- `landing.py`: one complete closed-loop landing locally, using pre-rendered frames or the CPU fallback, then on Colab with the Blender worker.
- `dispersions.yaml`: initial state errors, burn magnitude/pointing errors, sun angle, DTM noise, stale-map fraction.
- `03_montecarlo.ipynb`: run 1,000 landings × 2 scenarios, sharded and resumable.

**Week 4: Analysis, website, expert prep** (to ~Nov 1)
- `compare_published.py`: landing-error distribution (median, 95th percentile, CEP) vs. ~1 m; predicted-vs-actual contact vs. 3.5 cm; abort rate vs. <6%; boulder size-distribution slope fit from NN detections vs. the injected −2.9 vs. the published values, labeled clearly as a measure of *detector bias*, since the boulders were injected.
- `export_replays.py` → ~25 curated landings (successes, back-aways, NN catches, failures) as JSON + WebP frames, plus a Monte Carlo summary JSON.
- `web/`: replay page with the camera frame (NN hazard overlay + NFT feature boxes toggles), a top-down site map (true vs. estimated track, covariance ellipse, hazard map, target), altitude/time and error plots, a decision banner (TAG / BACK-AWAY + reason), and a scrubber. Dashboard page with the Monte Carlo scatter, published-vs-ours table, and a methods summary. Deploy with a GitHub Actions → Pages workflow; keep it under ~100 MB.
- `docs/method.md`, `validation.md`, `expert_prep.md`. The last one covers likely reviewer questions: why OSIRIS-REx switched to NFT as primary over lidar guidance; whether the EKF is observable; whether point-mass gravity is adequate (quantify it against a polyhedron gravity check at the site if time allows); the sim-to-real gap; why the onboard NFT renderer is deliberately coarser than the truth renderer; and the limits of synthetic boulder statistics.

**What to cut if behind (in order):** NN retargeting (stretch already) → reduce Monte Carlo frames per landing to ~10 → shrink the dataset to 3k → simplify the website to one replay page plus a stats table. **Never cut:** the faithful NFT baseline, the 1,000-landing Monte Carlo, the published-comparison table.

## Working conventions (put in CLAUDE.md for the Sonnet coding phase)
- All physical constants and thresholds live in `configs/*.yaml` with a source comment; no magic numbers in code.
- Every module has a pytest unit test; the sim is seeded and deterministic.
- Frames: Bennu body-fixed (rotating) frame for dynamics and DTM; camera frame +z boresight; document it in `docs/method.md`.
- Commit at each milestone and push to `origin` (`aryanyaksh-art/touch_down`). Large data is never committed; the trained model (~50 MB) goes in a GitHub Release.

## Verification
- **Unit:** `uv run pytest`. Checks include the injected size-distribution slope recovered within ±0.1, a dynamics conservation check, the EKF on a synthetic linear case, NCC finding a known shift exactly, and camera project/unproject round trips.
- **Rendering:** a side-by-side contact sheet of synthetic frames next to real NavCam images of Nightingale; masks overlaid on RGB to check alignment.
- **NN:** test-split IoU per class and recall per boulder-size bin, on held-out terrain.
- **NFT:** NEES/NIS consistency plots; position error vs. altitude on open-loop runs.
- **End-to-end:** one closed-loop landing replayed in the local web viewer (`npm run dev` and the browser pane), then the full Monte Carlo summary checked against the published table.
- **Website:** the GitHub Pages build passes; check the replay page at phone width and desktop width.
