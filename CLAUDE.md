# TouchDown — working notes for Claude

Read `docs/PLAN.md` first. It is the approved plan: architecture, 4-week schedule, published comparison targets, verification.

## What this is
A TKS Build: recreate OSIRIS-REx's autonomous Touch-And-Go (TAG) at Bennu.
- Faithful baseline: Natural Feature Tracking (NFT) navigation + hazard-map back-away at ~5 m.
- Extension (not in the real mission): U-Net onboard hazard detection fused into a live hazard map.
- Validation: 1,000 simulated landings compared against published OSIRIS-REx/Bennu numbers.
- An expert in space robotics will review it. Always keep "faithful vs. extension" explicit in code comments and docs.

## Conventions
- Constants and thresholds live in `configs/*.yaml` with a source comment. No magic numbers in code.
- Every module gets a pytest test. Simulations are seeded and deterministic.
- Frames: Bennu body-fixed (rotating) frame for dynamics and DTM; camera +z is boresight. Document in `docs/method.md`.
- Never fabricate published values. If a number is not confirmed from a source, mark it TODO in `docs/references.md`.
- Heavy work (Blender rendering, U-Net training, Monte Carlo) runs on Colab/Kaggle. Locally: core, nav, gnc, tests, web.
- Keep `data/` and `outputs/` out of git. The folder is inside OneDrive, so large downloads should go under `%LOCALAPPDATA%\TouchDown\data` (set `TOUCHDOWN_DATA` env var).
- Python via `uv`, pinned to native ARM64 3.13 in `.python-version`. `requires-python >= 3.12` so Colab can run the package.
- Windows quirk: Python `subprocess` cannot start the ARM64 Blender (side-by-side error) but Git Bash can; `touchdown/render/client.py` launches Blender through bash on Windows. Do not 'simplify' this.
- Commit at each milestone and push to origin/main.

## Environment
Windows 11, Snapdragon X (ARM64), 16 GB RAM, no NVIDIA GPU. Git Bash and PowerShell available.
Blender 5.2.2 (Windows ARM64 portable) is at `%LOCALAPPDATA%/TouchDown/data/blender/blender-5.2.2-windows-arm64/blender.exe`; use the same 5.2.2 (linux-x64) on Colab.
Data in `%LOCALAPPDATA%/TouchDown/data`: site OBJ, global OBJ, `nightingale_dtm_5cm.npz`, `nightingale_vertices_m.npy`.

## Renderer notes
- `Render Result.pixels` is empty in background Blender; the worker round-trips float EXR files instead.
- Worker outputs radiance (Lambertian, albedo 0.044). Per-pixel positions come from a GPU ray caster on Colab (see Render performance) or Blender's position pass as a fallback; hazard labels are looked up from them (`touchdown/dataset/labels.py`).
- Verified: every hit point lies on its pixel ray to 0.0000 deg (scripts/render_demo.py).

## Torch
No PyTorch wheels exist for Windows ARM64. For local smoke tests there is an emulated x64 env at `%LOCALAPPDATA%/TouchDown/venv-torch` (run with `PYTHONPATH=. <venv>/Scripts/python.exe -m pytest`). Real training runs on Colab. torch tests use `pytest.importorskip`.

## Web
`web/` is Vite + React + TS + Motion (`motion/react`). Rollup's native binary does not load on Windows ARM, so `package.json` overrides rollup with `@rollup/wasm-node`. Build: `cd web && npm run build`. Dev: preview server `web` in `.claude/launch.json`.
- Design (agreed with the user): flat night sky, NO gradients anywhere, Space Mono + Unbounded, orange-red `#ff5a36` only for hazards, mixed real star colours, no text drawn on the galaxy (only the hover label). Built with the animate / emil-design-eng / animation-vocabulary / impeccable / design-taste skills; keep using them (motion skills first) for any web change. Zero em-dashes in visible copy. User wants click-style questions, not typing.
- Flow (all one scroll, `Hero.tsx`, 460vh sticky stage): flat vector telescope zooms straight into its blue lens (no sliding), a clip-path circle reveals the galaxy (`Galaxy.tsx`, canvas, one star per landing, three spiral arms by outcome, distance from core = delivery error rank), then the camera dives into the core and lands on the asteroid surface (`Surface.tsx`). Then `Story.tsx`: four short explainer chapters (camera looks down, shadows, hazard map, safe spot) and three landing scenes (clean, back away, old map) as CSS-keyframe flat-vector animations that play on arrival; "See a real one" opens a real landing from the data. Then the results dashboard. Removed on request: tour, faithful-vs-added table (still in README/docs), how-it-works list.
- Landing picker (bottom right of the galaxy): slider + number box, capped at the max landing, rings the star in amber, Open appears once something is picked. Click a star or open `#/landing/<seed>`: `LandingOverlay` unfolds from the star. Replay landings show `ReplayViewer`; others show `DataCard`, with `PictureView` (zoom/pan, raw/truth/detector layers, before-after slider, hover readout) when `pictures.json` lists the seed.
- Phones and reduced motion get `SimpleHero` (still picture, then the galaxy) and a static story. Desktop-first.
- `lib/model.ts` builds stars from `landings.json` (+ `index.json` for replay seeds); `lib/tour.ts` picks one example landing per story scene. If `landings.json` is missing the page shows sample data (`demoLandings`) with a visible label.
- Data lives in `web/public/data`: replays (`export_replays`), `landings.json`/`summary.json`, and one picture per landing from `python -m touchdown.analysis.render_pictures` (notebook `10_kaggle_pictures.ipynb`, re-renders the 5 m decision view above the predicted contact point; not the exact flight frame). **`.gitignore` ignores `data/`, so this folder is NOT committed and the Pages build has no data yet: add `!web/public/data/` to `.gitignore` when the real data is ready.** `pictures.json` is `{seeds: [...], detector: bool}`.
- Testing quirks: the Browser pane throttles rAF while hidden, so animations look stuck; call `tabs_select` on the tab and wait several seconds before judging a screenshot. Local fake data for UI tests (`web/public/data`, gitignored) must be deleted before real data goes in. Beware class-name collisions (`.scene`, `.replay`, `.overlay` were each reused by accident; camera layers are `.cam-layer`, story button is `.anim-replay`).
- Deploy workflow: `.github/workflows/pages.yml` (Pages must be enabled in repo settings, source = GitHub Actions).

## Render performance (measured)
- Blender Cycles beauty render, 640x480, 16 spp: 0.3 s on a Colab T4, ~1.3 s on the 8-core laptop CPU (with `use_persistent_data`).
- Blender's position pass is ~13 s/frame on the T4 (cause not found; not a shader recompile and not a settings change). So per-pixel positions come from a PyTorch heightfield ray caster (`touchdown/render/raycast_torch.py`), validated against the NumPy one to <1 cm. The Blender position pass remains as the CPU/no-torch fallback.
- NFT template rendering is batched across landmarks and uses `touchdown/nav/raycast_gpu.py` when a GPU exists (`TOUCHDOWN_NAV_GPU=0` disables, `=cpu` forces torch on CPU for tests).
- Colab: **run long jobs inside a notebook cell** (`!python scripts/overnight.py`, which prints a heartbeat). Jobs started from the Colab terminal with `nohup` do NOT count as activity: the notebook looks idle and the free runtime is shut down after ~90 minutes (this killed two runs). Free Colab also caps a session at ~12 h and has no supported background execution (Google Colab FAQ). For unattended jobs use Kaggle's Save & Run All.

## Constraints on this machine
- **Windows Smart App Control now blocks unsigned DLLs, so Python (numpy) cannot run locally.** Do not turn it off (security setting, one-way). Run tests through GitHub Actions CI (push, then `gh run list`) or on Colab. File editing, git and `gh` still work; use `python` (system, stdlib only) for small patch scripts.
- Inline multi-line scripts in the Bash tool sometimes fail to parse; write a script file and run it instead.

## Colab runbook
- A fresh runtime: clone the repo, then `sh /content/touch_down/scripts/colab_setup.sh`. Drive must be mounted from a notebook cell (needs the user's consent popup).
- Persistent state lives on Drive under `MyDrive/touchdown/`: `dataset/`, `runs/<name>/best.pt`, `montecarlo/v1/landing_*.json` (resumable). `/content` is wiped on a disconnect.
- Long jobs: run from a notebook cell (see Render performance note); the terminal is for short checks (`ls`, `tail`, `pgrep`).

## Kaggle runbook (Colab's free GPU allowance ran out after ~6 h)
- Account `aryanyaksh` (phone-verified). Private dataset `aryanyaksh/touchdown-detector-v2` holds the v2 checkpoint as `best.pt.part00` + `best.pt.part01` (upload limit was 10 MB per file; the notebook rejoins them with `find ... | sort | xargs cat`, then asserts size 17520863).
- Notebook `notebook1d8d2e5b39` is `notebooks/05_kaggle.ipynb` imported (File, Import Notebook). Settings: Accelerator **GPU T4 x2** (P100 is too old for Blender 5), Internet on, the dataset attached. 30 GPU h/week.
- Run unattended with Save Version, "Save & Run All (Commit)". `scripts/kaggle_run.py` stops flights at 8.5 h so the commit finishes and `/kaggle/working` is kept. Stop the interactive draft session (Run menu, Stop session) or it burns quota alongside the commit.
- Experiment: `--aim-mode random_safe` (random aim point, true clearance >= 0.4 m, 10 m from the tile edge). Pilot (20 landings, seeds 0-19) ran ~100 landings/h. Version 1 flies seeds 0-849; a second session should fly 850-1000. Landings are NOT merged with the 513 old best-aim-point Colab landings (different experiment).
- Reading output text via browser tools is unreliable (rendered in an iframe); use the Output tab to download `summary.json`/`sensitivity.json`.

## Current state and in-flight jobs (2026-10-10)
- **Defaults changed to published values**: `SimConfig.head_radius_m = 0.16` (TAGSAM outer diameter 32 cm, Walsh et al. 2022) and `p_abort = 0.01` (Norman et al. 2022: >99% safety). The first 1,000-landing result (docs/validation.md section 6b) used 0.30 / 0.10 and is labelled the conservative case. Results JSON now records `head_radius_m`, `p_abort_threshold`, `corr_factor`, `sigma_a_filter`.
- Kaggle notebook `notebookc37b0c0e06` = `notebooks/07_kaggle_faithful.ipynb` (1,000 landings, published parameters, writes `/kaggle/working/mc_faithful`, stops at 10.5 h). Started 2026-10-10 ~14:30 local.
- Kaggle notebook `notebookda05519401` = `notebooks/09_kaggle_filter_sweep.ipynb` (5 filter settings x 100 landings; prints a NEES table; writes `calibration.md`). No dataset input needed.
- Faithful run FINISHED (2026-10-11, 8.4 h, 1,000 landings, head 0.16 m, p_abort 0.01; numbers read from the Kaggle log): delivery error median 0.39 m, 95th pct 1.26 m, 91.9% within 1 m, predicted vs actual contact 3.4 cm median (7.4 cm 95th). Back-away rate 9.6% (complete map, baseline). Hazard contact when proceeding: 0.5% (complete baseline), 0.9% (stale baseline), 0.3% with the detector on either map; needless back-aways 1.0% / 0.7% baseline vs 7.4% / 7.2% with the detector. Filter sweep done (docs/validation.md 6c). The log truncates; the full `summary.json` needs the user-approved download.
- Kaggle notebook `notebook902951d8e5` = `notebooks/11_kaggle_ablation.ipynb` (detector false-alarm ablation, seeds 0-299, ten evidence rules judged on the same flights, writes `ablation.json`/`ablation.md` + `summary.json`). Started 2026-10-11 ~00:00 local, about 3 h, runs alongside the faithful run (2 GPU slots). Its `L0` rule must reproduce `complete_nn`/`stale_nn`. Next: read `ablation.md`, pick the rule with the best hazards-avoided vs needless-added trade-off, add it to docs/validation.md; a retrained detector (hard-negative mining) is the follow-up and needs a dataset re-render on Kaggle (the old one is on Colab Drive).
- Running on Kaggle (2026-10-11 ~11:00): replays `notebook77aa711d8d` (notebook 08, 12 seeds: 528 4 460 383 17 869 397 781 12 150 333 612; writes `web_data.zip`) and pictures `notebookfa3fe0a1c0` (notebook 10, one picture per landing from the faithful output, also recomputes `summary.json` with intervals; writes `pictures.zip`). Faithful output was downloaded to the scratchpad (`results.zip` in Downloads) and `web/public/data/{landings,summary}.json` built locally (the Kaggle summary lacked CIs; the pictures run regenerates it). Next: hazard-case ablation = notebooks/12_kaggle_ablation_hazards.ipynb (91 seeds, `--seed-list`). Ablation on seeds 0-299 (notebook 11) showed 0 hazard contacts, so its benefit side was empty; its cost side: needless back-aways 25 (L0) down to 4 (L16, same as no detector).
- Post-run runbook, in order: (1) user approves downloading `summary.json` + the landing JSONs from the notebook Output tab into a scratch folder; (2) `python scripts/pick_replay_seeds.py DIR` and paste its seeds/titles into notebooks/08; (3) `python scripts/build_web_data.py DIR --out web/public/data --summary DIR/summary.json`; (4) run notebook 08 (replays) then 10 (pictures, input = the faithful run output) on Kaggle T4 x2, unzip into `web/public/data`; (5) add `!web/public/data/` to `.gitignore`, commit, push, check the Pages deploy; (6) update docs/validation.md and README with the faithful-parameter numbers and CIs (re-run compare_published on the new landings).
- Status 2026-10-11: all Kaggle jobs are done and published. Live site has the real 1,000 landings, 12 camera replays, 1,000 pictures and the interval `summary.json` (`!web/public/data/` is in `.gitignore`). Hazard-case ablation `notebookce103684d1` (notebook 12) finished in ~50 min; results are in docs/validation.md 6f (L0 and L1 keep the full benefit; L4 trades one hazard for a third fewer false alarms; no threshold removes the cost). Possible next jobs: detector retrained with hard negatives (dataset re-render on Kaggle), calibrated filter on the 1,000 landings, 125 m descent extension, expert-review docs.
- Browser quirk: after a screenshot timeout the Chrome tab can be stuck with a tiny viewport (418x206 CSS px) even though `resize_window` reports success; open a fresh tab (`tabs_context_mcp` with `createIfEmpty`) instead of fighting it.
- Kaggle UI quirks: after File > Import Notebook the dialog needs ~10 s before the file input exists; the editor does not draw cells in screenshots at this window size but the imported notebook still runs (check the Logs page); stop interactive draft sessions so they do not burn quota; two GPU sessions can run at once.
