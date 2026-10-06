# Validation

How each part is checked, what the check does and does not show, and where the numbers live. Results from the final Monte Carlo are produced by `python -m touchdown.analysis.compare_published DIR` and pasted into the table at the end.

## 1. Unit-level checks (automated, `uv run pytest`)

| Component | Check |
|---|---|
| Dynamics | Jacobi constant conserved to 1e-9 over 600 s; state-transition matrix matches finite differences; free-fall time from 54 m is ~1100 s |
| Camera | project/unproject round trip; edge ray equals the stated field of view; look-at frames orthonormal |
| Renderer (manual, `scripts/render_demo.py`) | every rendered pixel's 3-D point lies on its camera ray to 0.0000°, which rules out flipped or mirrored axes between Blender and the rest of the code |
| Labels | pixel labels are looked up from the 3-D position under each pixel, so they register exactly; unit test on cell indexing |
| Ray caster | flat and ramp cases, off-grid miss, shadow behind a wall |
| NCC matching | recovers integer and sub-pixel shifts; invariant to gain and offset |
| EKF | converges from metre-level error; gates gross outliers; NEES consistent when errors are independent; joint update equals sequential when there is no correlation |
| Targeting | the solution reaches the target at −10 cm/s; a 1 mm/s velocity error moves the landing by ~0.5 m |
| Boulders | the sampled size distribution recovers the requested slope; injected boulders are detected as hazards |
| Closed loop | a whole flight on a synthetic site (no Blender) completes, converges, and lands at ~10 cm/s |

## 2. Navigation (open loop, `scripts/nft_openloop.py`)

A prescribed 0.1 m/s descent over the real tile with Blender frames. Findings and the bugs they exposed are in [references.md](references.md): a 10 cm grid shift in the onboard model (fixed), vanishing matches at low altitude with a 25 cm model (fixed by a 5 cm onboard level), and over-confidence caused by correlated terrain-model errors (addressed with a common-mode term in the update). The filter is checked with NEES (expected mean 3 for 3 degrees of freedom).

## 3. Hazard detector (run `unet_v1`, 30 epochs, final)

Train and validation terrains are synthetic; the test terrain is the real Nightingale surface, never seen in training.

| Split | mIoU | IoU safe / boulder / steep | Hazard pixels called safe | Safe pixels called hazard |
|---|---|---|---|---|
| Validation (synthetic terrain) | 0.54 | 0.60 / 0.60 / 0.41 | 24% | 23% |
| **Test (real Nightingale)** | **0.39** | **0.57 / 0.26 / 0.35** | **30%** | 20% |

The drop from 0.60 to 0.26 boulder IoU between synthetic and real terrain is the sim-to-real gap: injected boulders are smooth half-ellipsoids and real ones are angular. Validation on synthetic terrain overstates real performance. The real-terrain row is the number to quote.

## 4. End to end (Monte Carlo)

Compared with published figures. Only one real landing exists, so agreement shows plausibility, not equivalence.

| Quantity | Published | Source status |
|---|---|---|
| Delivery error | within ~1 m of target | summary-level, exact figure to confirm |
| Predicted vs. actual contact | 3.5 cm, 1.4 s | summary-level, locate primary paper |
| Back-away probability before TAG | < 6% | NASA release |
| Contact speed | 10 cm/s | NASA release |

Boulder statistics: the published size-frequency slope for Bennu (−2.3 to −3.0 at candidate sites) is compared with the slope recovered from the detector's output on the real tile. Because the injected training boulders use −2.9, a match would be partly circular on synthetic terrain; on the real tile it measures detection bias across sizes. (Open: the slope computed directly from the DTM hazard map is too shallow because touching rocks merge; see references.md.)

## 5. Sensitivity (to do)

Vary the assumed parameters that are not mission values (abort threshold, head radius, stale-map cutoff, correlated-error terms) and report how the conclusions move. A conclusion that depends on one of them should be stated as conditional.

## 6. Results table

Monte Carlo of 1,000 landings is running (seeds 0-999, results one JSON per landing). **Provisional numbers from the first 69 landings** (not final, small sample):

| Quantity | TouchDown (n=69) | Published |
|---|---|---|
| Delivery error, median / 95th pct | 0.31 m / 1.02 m | within ~1 m (one real landing) |
| Within 1 m of the aim point | 94.2% | 1 of 1 |
| Predicted vs. actual contact, median / 95th pct | 3.2 cm / 6.6 cm | 3.5 cm |
| Back-away rate, baseline | 1.4% | < 6% predicted before TAG |

| Scenario | Back-away | Hit a hazard | Needless back-away | Safe touchdown |
|---|---|---|---|---|
| Complete map, baseline | 1.4% | 1.4% | 0.0% | 97.1% |
| Stale map, baseline | 1.4% | 1.4% | 0.0% | 97.1% |
| Complete map + detector | 8.7% | 1.4% | 7.2% | 89.9% |
| Stale map + detector | 8.7% | 1.4% | 7.2% | 89.9% |

Replace with the final table after the run (`python -m touchdown.analysis.compare_published DIR`).

**Reading the provisional result.** The detector does not reduce hazard contacts in this experiment and adds needless back-aways. The aim point has 2.3 m of clearance from any hazard, so the baseline already succeeds 97% of the time and there is little for a detector to add; and the stale-map scenario (boulders under 0.8 m removed) barely changes the prior. The experiment may simply be too easy to show a benefit. See section 7.

## 7. Known weaknesses and planned fixes

| Weakness | Evidence | Planned or possible fix |
|---|---|---|
| Detector misses 30% of hazard pixels on real terrain | real-terrain test, section 3 | Make injected boulders angular instead of ellipsoidal (the main sim-to-real gap); optionally train on part of the real tile and test on a disjoint part; choose the operating threshold from a precision-recall curve for the task (false-safe vs. needless back-away trade-off) |
| Filter is overconfident | NEES 8-14 at the decision (expected ~3) | Errors are correlated terrain-model errors, not process noise, so first calibrate the measurement side (R and the common-mode terms) against NEES over the Monte Carlo; process noise Q is a cheap second knob to sweep |
| Simulated descent starts at 45 m, not at the real Checkpoint (125 m) | the 5 cm tile is 48 m wide | The final phase (from ~54 m) is what matters for the touchdown decision and is covered; the Checkpoint to Matchpoint phase and its dispersions are assumed (start dispersion in `SimConfig`). To extend upward, stitch the real 88 cm global model (already downloaded) around the 5 cm tile rather than inventing terrain procedurally |
| Detector adds no value in the current experiment | provisional Monte Carlo | Harder conditions: aim points with marginal clearance, harsher stale-map variants (see sensitivity analysis), more boulder coverage near the aim point |
| Decision parameters are not mission values | head radius, abort threshold | Sensitivity analysis, `python -m touchdown.analysis.sensitivity` |
