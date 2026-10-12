# Extension: descent from the real Checkpoint (125 m)

Status: implemented, unit-tested (CI), and flown 6 times (notebook 15) and then 150 times on the same seeds as the 45 m runs (notebook 16, 2026-10-12). Nothing here changes the default results (45 m start, `docs/validation.md` 6d); it is opt-in (`montecarlo --wide`, `SimConfig.waypoint_alt_m`).

## Why

The published sequence is: Checkpoint burn at about 125 m, Matchpoint burn at about 54 m roughly 11 minutes later, then a ballistic descent to contact at 10 cm/s (see `docs/references.md`). The default runs start at 45 m, inside the 48 m tile, so they cover only the last part, and the Matchpoint burn is put at 60 s after the start instead of at 54 m. The upstream part (Checkpoint to Matchpoint, 125 m to 54 m) has never been simulated, and neither has NFT navigation at 54 to 125 m with a coarse onboard model.

## What is confirmed and what is assumed

| Item | Value | Status |
|---|---|---|
| Checkpoint altitude / Matchpoint altitude | about 125 m / about 54 m | CONFIRMED (Norman et al. 2022; NASA SVS 4862) |
| Matchpoint about 11 minutes after the Checkpoint burn | 660 s | CONFIRMED in NASA SVS 4862 text (eoPortal says about 10 min; the sim uses 660 s) |
| Global model resolution | 88 cm (OLA v20) | CONFIRMED (SVS product name) |
| Tile footprint vs. camera footprint | 48 m wide vs. about 100 m at 125 m (44 deg FOV) | measured / computed |
| Terrain outside the 5 cm tile | the real 88 cm global model, cubic-upsampled | real data, but smooth: it does not resolve rocks below a few metres |
| Boulders outside the tile | **ASSUMPTION:** synthetic, same power law (slope -2.9) and density (0.055 per m^2 above 1 m) as inside the tile, one fixed realization | not real terrain |
| Onboard model outside the tile | **ASSUMPTION:** the same terrain without the synthetic boulders (what a ground-built model would hold) | the mismatch is intended |
| Dispersions at Checkpoint | **ASSUMPTION:** the same as the 45 m runs (1.5 m position, 3 mm/s velocity, 0.4 m / 2 mm/s navigation error) | not mission values |

## How it works

1. **Wide truth terrain** (`touchdown/bennu/widedtm.py`, `scripts/build_wide_dtm.py`). The tile is embedded in a 5 cm grid padded by 56 m on every side, on the same local frame, so cell indices map to the same local xy as in the tile and the Blender renderer, ray casters and hazard code are unchanged. Outside the tile the height is the upsampled global model plus the tile-minus-global offset (low-passed over 2 m so rocks stay out), held constant outward and faded to zero over 10 m, so there is no step at the seam. The tile itself is kept exactly. Heights are above the tile's fitted plane, so far from the centre they include curvature (about 26 m at the grid corners). Grid size is about 3,200 by 3,200 cells (10 M).
2. **Hazards and aim points stay on the tile.** Hazard classes, clearance and the aim-point draw come from the real 5 cm tile only; nothing is mapped outside it, and every contact point lies inside it.
3. **Checkpoint phase** (`SimConfig.waypoint_alt_m = 54`, `start_alt_m = 125`, `matchpoint_time_s = 660`). The nominal path is a coast from 125 m over the aim point (plus the start offset) to a point 54 m above the aim point, reached after 660 s (`gnc/targeting.solve_waypoint`, full rotating-frame propagation; Coriolis alone pushes the spacecraft about 8 m sideways in that time, so the nominal velocity compensates). The Matchpoint burn then runs exactly as in the 45 m runs (computed from the filter estimate, executed with errors).
4. **NFT** uses the fine level (5 cm tile) below 22 m and a coarse level (25 cm cells from the wide onboard model) above it, so at 125 m the templates come from the global-model terrain and the correlation runs against an image that also contains the synthetic rocks.

## What this does not fix

- The Checkpoint burn itself and its execution errors are not simulated; only a nominal coast with start dispersions.
- Outside the tile the "truth" is partly synthetic, so navigation results above about 45 m show how NFT behaves on terrain with the right statistics, not on the real surface.
- Cost: about twice as many frames per landing as the 45 m runs, so only a subset of seeds is planned.

## Results of the first 6 descents from 125 m (Kaggle notebook 15, seeds 0-5, random aim points, no detector)

Terrain build (11 s, 3,211 x 3,204 cells, 74 MB): where the real 5 cm tile and the 88 cm global model overlap, tile minus global has a mean of 0.17 m and an RMS of 0.30 m (0.18 m after the 2 m low-pass), so the blend offset is small; 42,172 synthetic boulders were stamped outside the tile. The hillshade preview shows the tile sitting in the surrounding terrain with no visible seam.

| Seed | Matchpoint altitude reached | Nav error at Matchpoint | Nav error at decision | Delivery error | Predicted vs. actual contact | Frames | Wall time |
|---|---|---|---|---|---|---|---|
| 0 | 53.4 m | 0.090 m | 0.036 m | 0.77 m | 6.5 cm | 70 | 202 s |
| 1 | 53.9 m | 0.060 m | 0.012 m | 0.38 m | 2.9 cm | 70 | 198 s |
| 2 | 52.4 m | 0.079 m | 0.018 m | 0.42 m | 3.1 cm | 69 | 197 s |
| 3 | 52.3 m | 0.139 m | 0.033 m | 0.56 m | 4.0 cm | 69 | 197 s |
| 4 | 55.2 m | 0.058 m | 0.033 m | 1.15 m | 2.0 cm | 71 | 203 s |
| 5 | 56.9 m | 0.147 m | 0.033 m | 0.51 m | 3.0 cm | 71 | 199 s |

All six flew from 125 m, reached Matchpoint within about 3 m of 54 m (52.3 to 56.9 m), and none backed away.

Navigation by true altitude band (all frames of the 6 flights):

| Altitude | Frames | Median nav error (max) | Median landmarks used | Frames with no NFT update |
|---|---|---|---|---|
| above 100 m | 78 | 0.097 m (0.235) | 11 | 0 |
| 54 to 100 m | 125 | 0.098 m (0.313) | 10 | 0 |
| 22 to 54 m | 135 | 0.084 m (0.190) | 9 | 0 |
| 5 to 22 m | 76 | 0.028 m (0.087) | 12 | 0 |

**What this shows.** The whole pipeline works end to end from the real Checkpoint altitude: the wide terrain renders (about 200 s and 70 frames per landing), NFT never lost lock above 54 m, the coast to the Matchpoint waypoint lands near 54 m, and the rest of the descent behaves as in the 45 m runs.

**What it does not show.**
- Six landings: no rates or intervals, and the delivery errors (0.38 to 1.15 m, median 0.54 m) are not comparable with the 1,000-landing result (median 0.39 m).
- The navigation errors above 54 m (about 0.1 m) are probably **optimistic**. Outside the tile, the global model is both the camera's truth and the basis of the onboard model, so large-scale shape matches exactly; the only mismatch is the synthetic boulders and the 3 cm onboard noise. The real onboard model of the 88 cm global product carries its own errors against the true surface, which are unknown and not modelled. Treat this as a check that NFT works at those altitudes with a coarse model, not as a measurement of the navigation error the mission had there.
- The Checkpoint burn and its execution errors are still not simulated.

**Cost.** About 200 s per landing, so about 18 landings per GPU hour (the 45 m runs: about 100 per hour). A 1,000-landing run would take about 55 GPU hours, more than a weekly Kaggle allowance; a paired comparison on 100 to 200 seeds (5 to 11 hours) is the realistic size.

## Paired comparison: the same 150 seeds from 125 m and from 45 m (Kaggle notebook 16)

Seeds 0 to 149 (random thin-margin aim points, head radius 0.16 m, abort threshold 0.01, detector v2 judged alongside the baseline), flown from 125 m over the wide terrain and compared seed by seed with the same seeds from the 45 m runs (`scripts/compare_start_alt.py`; the two share sun, aim point, onboard-model noise and start offsets). Differences are medians of the paired differences with 95% bootstrap intervals.

| Metric (150 paired seeds) | From 125 m | From 45 m | Paired difference (125 m minus 45 m) |
|---|---|---|---|
| Delivery error, median | 0.675 m | 0.392 m | +0.281 m (+0.108 to +0.347) |
| Predicted vs. actual contact, median | 4.1 cm | 3.0 cm | +0.9 cm (+0.7 to +1.1) |
| Navigation error at the 5 m decision, median | 3.5 cm | 2.5 cm | +1.0 cm (+0.7 to +1.1) |
| Landings that would touch a hazard if never aborted | 25 of 150 | 17 of 150 | differ in 38 seeds |
| Back-away, complete map, baseline | 25 | 19 | differ in 40 seeds |
| Back-away, complete map, with detector | 29 | 29 | differ in 40 seeds |
| Back-away, stale map, baseline / detector | 22 / 26 | 19 / 29 | differ in 37 seeds |
| Wall time per landing, median | 228 s | 30 s | 7.6 times |

The 125 m run's own headline numbers (150 landings): delivery median 0.675 m (0.59 to 0.77), 95th percentile 1.31 m (1.22 to 1.41), 79.3% within 1 m (72.2 to 85.0); predicted vs. actual contact median 4.1 cm (3.8 to 4.5), 95th percentile 9.2 cm; Matchpoint reached at 49 to 60 m (target 54 m) in every landing; hazard contact when proceeding: 2 landings (complete map) and 5 (stale map) of 150 for the baseline, the same 2 and 5 with the detector; needless back-aways 2 / 2 for the baseline and 6 / 6 with the detector.

**Why delivery error went up: the Matchpoint burn is realistic now.** The median Matchpoint burn is 0.073 m/s from 125 m against 0.0051 m/s in the 45 m runs (14 times larger). That is physical: the spacecraft arrives at 54 m coasting at about 0.08 m/s and the burn has to slow it to the roughly 0.04 m/s that gives a ballistic arc to contact at 10 cm/s (NASA describes the burn as slowing the descent). In the 45 m runs the start state was already almost on the final arc, so the burn was tiny and its assumed execution errors (1% magnitude, 0.5 degree pointing, 0.2 mm/s fixed; **assumptions, not mission values**) hardly mattered. With a realistic burn those errors act for the roughly 790 s ballistic arc and add up to a few tenths of a metre. Navigation error at Matchpoint is the same in both (0.081 m vs. 0.088 m), so the extra error is not a navigation effect. A larger delivery error also moves contact points toward hazards on thin-margin aim points, which is why more seeds would touch a hazard (25 vs. 17) and more back away. So the 45 m headline numbers understate delivery error; the 125 m run is the more faithful geometry.

**Against the published numbers.** The mission delivered within about 1 m (one landing) and its predicted-vs-actual contact was 3.5 cm. The 125 m runs give a median of 0.68 m, 79% within 1 m and 4.1 cm. The burn-error parameters were fixed before this run and not tuned to it, but they are also not mission values, so this agreement is plausible, not validated. The back-away rate (about 15 to 17% of these seeds) is not comparable with the mission's under 6%: the random aim points are deliberately thin-margin, not the carefully chosen real site.

**What this does not show.**
- 150 seeds, not 1,000: the 45 m and 125 m numbers on the same 150 seeds are the fair comparison; the 1,000-landing figures in `validation.md` cover different seeds (for example 9.1% would-touch-a-hazard over 1,000 seeds against 11.3% on these 150 at 45 m).
- Detector effects are measured on 2 to 6 hazard landings and are noise.
- The unpaired mean navigation consistency statistic at the decision (NEES) is 23 at 125 m against 161 at 45 m; it is dominated by outliers and was not investigated, so it is not claimed as a calibration improvement.
- Navigation above 54 m is optimistic (see the first-six section), and the Checkpoint burn itself is still not simulated.
