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
- Boulder PSFD slope from the DTM hazard map is too shallow (-1.2 at dmin 0.3 m rising to -2.0 at dmin 1.5 m) vs published -2.3 to -3.0. Likely causes: touching rocks merge into one component (no watershed split), the 2 m grey-opening ground model absorbs rocks wider than 2 m, and a heightfield censors small rocks. Fix before using this number as a validation result.
- Hazard fractions on the real tile (safe 40%, boulder 27%, steep 33%) are for the whole 50 m tile, which is boulder-rich; the central 8 m disk is 88% safe. Slope window (0.5 m) and ground-opening (2 m) are assumptions.
