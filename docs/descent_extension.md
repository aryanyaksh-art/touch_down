# Extension: descent from the real Checkpoint (125 m)

Status: code written and unit-tested (CI); first Kaggle test flights pending (notebook 15). Nothing here changes the default results (45 m start, `docs/validation.md` 6d); it is opt-in (`montecarlo --wide`, `SimConfig.waypoint_alt_m`).

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
