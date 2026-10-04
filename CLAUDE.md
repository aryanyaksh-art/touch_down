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
Blender 5.2.2 (Windows ARM64 portable) is at `%LOCALAPPDATA%TouchDowndatablenderblender-5.2.2-windows-arm64blender.exe`; use the same 5.2.2 (linux-x64) on Colab.
Data in `%LOCALAPPDATA%TouchDowndata`: site OBJ, global OBJ, `nightingale_dtm_5cm.npz`, `nightingale_vertices_m.npy`.

## Renderer notes
- `Render Result.pixels` is empty in background Blender; the worker round-trips float EXR files instead.
- Worker outputs radiance (Lambertian, albedo 0.044) and a per-pixel local-xyz position map; hazard labels are looked up from the position map (`touchdown/dataset/labels.py`).
- Verified: every hit point lies on its pixel ray to 0.0000 deg (scripts/render_demo.py).
- Speed on this laptop: ~7-13 s per 640x480 frame (16 spp, CPU). Bulk rendering goes to Colab GPU.

## Torch
No PyTorch wheels exist for Windows ARM64. For local smoke tests there is an emulated x64 env at `%LOCALAPPDATA%\TouchDownenv-torch` (run with `PYTHONPATH=. <venv>/Scripts/python.exe -m pytest`). Real training runs on Colab. torch tests use `pytest.importorskip`.
