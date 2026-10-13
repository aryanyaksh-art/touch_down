# Notebooks

The heavy work (rendering, training, the Monte Carlo) runs on free GPUs. Notebooks `01` to `04` and `06` were written for Google Colab; everything since then runs on **Kaggle** (a free allowance of 30 GPU hours a week, which resets at midnight UTC between Friday and Saturday).

## How to run one on Kaggle

1. Create a new notebook, then **File > Import Notebook** and pick the `.ipynb` from this folder.
2. **Settings > Accelerator > GPU T4 x2** (the older P100 is too old for Blender 5) and turn **Internet on**.
3. Add any input the table asks for.
4. **Save Version > Save & Run All (Commit)**. The run goes on in the cloud with your computer off, and the output is kept under the notebook's Output tab.

Each notebook clones this repository and runs `scripts/kaggle_setup.sh` (Blender, the NASA terrain, the package), so the code is always the latest pushed version. The runners stop themselves before Kaggle's time limit and keep finished landings.

**The detector checkpoint is not in the repository** (it is a 17 MB binary and `*.pt` is git-ignored). Notebooks that fly with the detector expect a private Kaggle dataset named `touchdown-detector-v2`; to make your own, train one with notebooks `02` or `04`.

## The notebooks

| # | Notebook | Where | What it does | Input | Time |
|---|---|---|---|---|---|
| 01 | `01_render_dataset` | Colab | Render the labelled image dataset with Blender | none | hours |
| 02 | `02_train_unet` | Colab | Train the hazard U-Net on it | dataset | hours |
| 03 | `03_montecarlo` | Colab | The first Monte Carlo runs | detector | many hours |
| 04 | `04_overnight` | Colab | Detector v2 pipeline (render, train, score) alongside the Monte Carlo | none | overnight |
| 05 | `05_kaggle` | Kaggle | 1,000 landings, random thin-margin aim points, the conservative case (head radius 0.30 m, abort threshold 0.10) | detector | two sessions, about 10 h |
| 06 | `06_replays` | Colab | The first camera replays | detector | short |
| 07 | `07_kaggle_faithful` | Kaggle | **The main 1,000-landing run** with the published head radius (0.16 m) and abort threshold (0.01) | detector | about 8.4 h |
| 08 | `08_kaggle_replays` | Kaggle | Re-fly 12 chosen landings and export their camera frames for the site | detector | short |
| 09 | `09_kaggle_filter_sweep` | Kaggle | Navigation-filter calibration: 5 settings x 100 landings, with NEES | none | about 5 h |
| 10 | `10_kaggle_pictures` | Kaggle | One analysed 5 m picture per landing, and a summary with confidence intervals | output of 07 | about 2 h |
| 11 | `11_kaggle_ablation` | Kaggle | Ten evidence rules for the detector's live hazard map on seeds 0 to 299 (the false-alarm cost) | detector | about 3 h |
| 12 | `12_kaggle_ablation_hazards` | Kaggle | The same rules on the 91 hazard cases (the benefit) | detector | about 1 h |
| 13 | `13_kaggle_hardneg` | Kaggle | Hard-negative retraining of the detector: mine, fine-tune three ways, compare at matched recall (no gain) | detector | about 2 h |
| 14 | `14_kaggle_hardneg_closed_loop` | Kaggle | Closed-loop test of notebook 13's choice. Written, deliberately not run | output of 13 | about 4 h |
| 15 | `15_kaggle_wide_spike` | Kaggle | Build the wide 125 m terrain and fly 6 test descents | none | under 1 h |
| 16 | `16_kaggle_wide_paired` | Kaggle | The same 150 seeds flown from 125 m, to pair with the 45 m runs | detector | about 5 h |
| 17 | `17_kaggle_burn_sensitivity` | Kaggle | Delivery error with the assumed burn errors at zero and doubled (50 seeds each) | none | about 3 h |
| 18 | `18_kaggle_accel_sensitivity` | Kaggle | Same seeds with the unmodelled acceleration removed, to find what sets the 0.5 m floor. Written, waiting on GPU quota | none | about 3 h |
| 18c | `18c_colab_accel_sensitivity` | Colab | The same as 18, for a Colab T4 runtime; results are saved to Google Drive | none | about 3 h |

Results from each are in [docs/validation.md](../docs/validation.md) and [docs/descent_extension.md](../docs/descent_extension.md).
