# Scripts

Run from the repo root with `uv run python scripts/<name>.py`. Scripts marked *stdlib* use only the Python standard library, so they also run where numpy cannot (for example on a locked-down machine).

## Setup

| Script | Purpose |
|---|---|
| `fetch_data.py` | Download NASA's Bennu models into the data directory outside the repo (`--global` adds the whole-asteroid model) |
| `build_dtm.py` | Turn the 5 cm Nightingale mesh into a cropped 5 cm height grid |
| `build_wide_dtm.py` | Build the wide 125 m truth terrain (tile + 88 cm global model + synthetic outer boulders) and a hillshade preview |
| `colab_setup.sh` | Rebuild a fresh Colab runtime in one command (Blender, code, data) |
| `kaggle_setup.sh` | The same for a fresh Kaggle session; every Kaggle notebook starts with it |

## Figures and checks

| Script | Purpose |
|---|---|
| `make_figures.py` | The Nightingale terrain and hazard figure |
| `render_demo.py` | Render frames at several altitudes, overlay labels, and verify that rendered 3D positions lie on their camera rays |
| `synthetic_check.py` | Compare a synthetic training terrain with the real tile |
| `inspect_site.py` | Hazard fractions and boulder size statistics for the real tile |

## Navigation and landing demos

| Script | Purpose |
|---|---|
| `nft_openloop.py` | A prescribed descent over the real tile to test the navigation filter |
| `fly_demo.py` | Fly a few full closed-loop landings with Blender frames |

## Monte Carlo runners (Kaggle and Colab)

| Script | Purpose |
|---|---|
| `kaggle_run.py` | Run a chunk of the Monte Carlo on Kaggle, stop before the session limit, then summarise. Options for the detector, the 125 m start (`--wide`), burn-error and acceleration scaling, and the false-alarm ablation. *stdlib* |
| `kaggle_hardneg.py` | The whole hard-negative retraining experiment (notebook 13). *stdlib* |
| `overnight.py` | The long Colab jobs from one foreground process with a heartbeat (Colab shuts down idle runtimes). *stdlib* |

## Analysis helpers (run on the finished landing JSON files)

| Script | Purpose |
|---|---|
| `pick_replay_seeds.py` | Choose instructive seeds for the website replays. *stdlib* |
| `pick_hazard_seeds.py` | List the seeds where touching down would hit a hazard (the only ones where the detector can matter). *stdlib* |
| `compare_start_alt.py` | Paired comparison of the same seeds from 125 m and from 45 m, with bootstrap intervals. *stdlib* |
| `wide_report.py` | Matchpoint altitude and navigation error by altitude band for descents from 125 m. *stdlib* |
| `build_web_data.py` | Build the small data files the website reads. *stdlib* |

The heavier analysis lives in the package: `python -m touchdown.analysis.compare_published`, `.sensitivity`, `.ablation`, `.calibration`, `.export_replays`, `.render_pictures`.

## Performance

| Script | Purpose |
|---|---|
| `bench_render.py` | Time the renderer (Blender-side vs. round trip) |
| `profile_flight.py` | Profile one landing to see where the Python-side time goes |
