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
- Python 3.12 via `uv` (the system Python 3.14 is too new for torch/Blender tooling).
- Commit at each milestone and push to origin/main.

## Environment
Windows 11, Snapdragon X (ARM64), 16 GB RAM, no NVIDIA GPU. Git Bash and PowerShell available.
