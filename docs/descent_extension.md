# Extension: descent from the real Checkpoint (125 m)

Status: implemented, unit-tested (CI), and flown 6 times on Kaggle (notebook 15, 2026-10-11). Nothing here changes the default results (45 m start, `docs/validation.md` 6d); it is opt-in (`montecarlo --wide`, `SimConfig.waypoint_alt_m`). No full Monte Carlo has been run from 125 m yet.

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
