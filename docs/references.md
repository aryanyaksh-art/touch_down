# Published values and sources

Status: CONFIRMED = read in a source during this project. VERIFY = recalled, check the paper before citing. TODO = not yet found.

## Mission performance (comparison targets)
| Quantity | Value | Status | Source |
|---|---|---|---|
| TAG delivery accuracy | within ~1 m of target | CONFIRMED (summary) | NFT flight-performance summary, U. Arizona experts page; check Lauretta 2022 / Berry 2022 for exact figure |
| Predicted vs. actual contact | 3.5 cm and 1.4 s | CONFIRMED (summary) | same; locate the primary paper |
| Pre-TAG predicted abort chance | < 6% | CONFIRMED | NASA "OSIRIS-REx Begins its Countdown to TAG" |
| Back-away decision altitude | ~5 m (16 ft) | CONFIRMED | NASA countdown-to-TAG |
| Checkpoint / Matchpoint | ~125 m / ~54 m | CONFIRMED | NASA countdown-to-TAG |
| Contact vertical velocity | -10 cm/s | CONFIRMED | NASA countdown-to-TAG |
| Required delivery accuracy | within ~7 m (pre-TAG requirement) | CONFIRMED (press) | NASA countdown-to-TAG |

## Bennu boulder statistics
| Quantity | Value | Status | Source |
|---|---|---|---|
| Candidate-site PSFD slopes | -3.0 +/- 0.2 to -2.3 +/- 0.1 (0.01 m/px images) | CONFIRMED | Burke et al. 2021, Remote Sensing 13(7):1315 |
| Particle size range mapped | 0.3 cm to 95 m | CONFIRMED | Burke et al. 2021 |
| Global slope | about -2.9 +/- 0.3 | VERIFY | DellaGiustina et al. 2019, Nat. Astron. |

## Hazard definition (needed for labels and back-away logic)
| Quantity | Value | Status |
|---|---|---|
| Hazardous object size | >= 21 cm longest dimension (min size that obstructs the inner annulus of the TAGSAM head) | CONFIRMED (secondary: search summary of NASA/mission text; confirm in Enos/Berry) |
| Max slope TAGSAM can accommodate | 14 deg | CONFIRMED (same caveat) |
| Nightingale sampling region | ~8 m diameter (26 ft) | CONFIRMED (NASA) |
| Hazard-map resolution | TODO | find in Berry et al. 2022 / Enos et al. |
| Hazard map classes | green (safe) / yellow (caution) / red (hazard); contact predicted in yellow or red => abort | CONFIRMED (NASA) |

## Camera
| Quantity | Value | Status |
|---|---|---|
| NavCam (TAGCAMS) resolution / FOV | 2592x1944 px, ~44x32 deg | VERIFY | Bos et al. 2018 |

## Data products
- NASA SVS Bennu models (https://svs.gsfc.nasa.gov/5069):
  - TAG site, 5 cm, 4.3M polygons, OBJ 235.9 MB: `l_00050mm_alt_ptm_5595n04217_v020.obj`
  - Global OLA v20, 3.4M polygons, OBJ 195.3 MB: `g_00880mm_alt_ptm_0000n00000_v020.obj`
- SBN radar shape model (1.2 MB) is too coarse; not used.

## Data-derived facts (measured in this project)
- SVS Nightingale tile is only ~56.5 x 56.5 m at 5 cm, centred at radius ~221 m. The plan assumed 200 m; the 125 m Checkpoint footprint (~100 m wide at 44 deg FOV) is larger than the tile. Needs the coarse global model for the outer region or a smaller-footprint Checkpoint rendering.
- Height above best-fit plane: std ~1.2 m, range about -2.7 to +5.8 m (large boulders present).

## Known issues / open items (Week 1)
- Boulder size-frequency slope from the real tile, now with watershed splitting of touching rocks: -2.15 +/- 0.12 (D > 0.75 m, n=323), -2.53 +/- 0.18 (D > 1.0 m, n=191), -3.4 +/- 0.4 (D > 1.5 m, n=77, noisy). Published Bennu candidate-site range -2.3 to -3.0 (Burke et al. 2021). Consistent above ~0.75 m. Below that the count is incomplete (slope -1.2 at D > 0.3 m): the 21 cm height threshold on a 5 cm heightfield misses small rocks, so the hazard map is only complete for larger boulders. Before the watershed fix the slope was -1.5 to -2.0 because touching rocks merged.
- Hazard fractions on the real tile (safe 40%, boulder 27%, steep 33%) are for the whole 50 m tile, which is boulder-rich; the central 8 m disk is 88% safe. Slope window (0.5 m) and ground-opening (2 m) are assumptions.
- Synthetic terrain: injected boulder density N(>1 m) = 0.055/m^2 is taken from the real tile (merged-component count, so a lower bound); slope -2.9 from DellaGiustina 2019 (VERIFY). With these, synthetic hazard fractions (safe 0.44, boulder 0.25, steep 0.31) are close to the real tile (0.39 / 0.27 / 0.34). Synthetic boulders are smooth half-ellipsoids; real ones are angular. This is the main sim-to-real gap and is what the real-terrain test set measures.
- Dataset altitudes are limited to 4-45 m because the 5 cm tile is only ~48 m wide (frames must stay on the tile). Higher-altitude views need the global model (downloaded, not yet used).
- GPU rendering path (Linux Blender on Colab) is written but not yet tested; CPU path verified locally (7-13 s/frame).

## NFT open-loop result (scripts/nft_openloop.py, one run, seed 0)
- 0.1 m/s descent 40 m -> 6 m over the real Nightingale tile, 17 frames at 20 s. Initial error 0.55 m. Error falls to 0.06-0.2 m above 22 m (coarse 25 cm onboard model) and 0.01-0.05 m below (fine 5 cm onboard model).
- Calibration (NEES, 3 dof, expected mean 3): ~1-3 below 20 m; 10-20 between 22 and 34 m, i.e. mildly overconfident with the coarse model. One run only; the Monte Carlo gives real statistics.
- Optimistic at low altitude: the truth camera renders the same 5 cm model the onboard 5 cm model is derived from (plus 2 cm noise). Real centimetre-scale terrain not in any model is absent here. Do not compare the low-altitude centimetre errors directly with the mission's 3.5 cm predicted-vs-actual contact figure.
- Bug found and fixed on the way: one-sided cropping when downsampling the onboard DTM shifted it ~10 cm (0.3 m navigation bias).
- Filter design choices that are ASSUMPTIONS: 41x41 px templates, +-14 px search, 12 landmarks, 20 s frame cadence, attitude known exactly, landmark-height uncertainty = max(3 cm, 0.4 x model resolution).

## Render performance notes
- Dataset render on a T4: 82 frames/min after moving per-pixel positions to a GPU ray caster (was 4 frames/min with Blender's position pass). Full 4,500-frame dataset in about an hour.
- Lit-image render without positions (what navigation needs): 0.33 s per frame on a T4.
