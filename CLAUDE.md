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
`web/` is Vite + React + TS. Rollup's native binary does not load on Windows ARM, so `package.json` overrides rollup with `@rollup/wasm-node`. Build: `cd web && npm run build`. Replay data lives in `web/public/data` (written by `python -m touchdown.analysis.export_replays`). Deploy workflow: `.github/workflows/pages.yml` (Pages must be enabled in repo settings, source = GitHub Actions).

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
