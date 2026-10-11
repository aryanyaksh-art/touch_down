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

### 3b. Diagnosis of the real-terrain failure (task-aligned evaluation, `touchdown/vision/evaluate.py`)

Run on the real-Nightingale test frames (300). Two natural hypotheses were tested and **both rejected**: that the headline score is dragged down by high-altitude frames the detector is not used on, and that it only misses small rocks near the 21 cm threshold.

| Altitude | Frames | mIoU | Boulder IoU | Hazard pixels called safe | Safe called hazard |
|---|---|---|---|---|---|
| 0-10 m | 112 | 0.37 | 0.26 | 34.4% | 17.2% |
| 10-22 m | 105 | 0.38 | 0.22 | 26.3% | 23.6% |
| 22-50 m | 83 | 0.43 | 0.31 | 29.2% | 19.0% |

Boulder recall (an object counts as found if at least half its pixels are labelled boulder), by physical size:

| Altitude | 0.2-0.5 m | 0.5-1 m | 1-2 m | 2-5 m |
|---|---|---|---|---|
| 0-10 m | 15% (n=393) | 19% (n=216) | 20% (n=114) | 10% (n=52) |
| 10-22 m | 12% (n=1435) | 21% (n=737) | 21% (n=369) | 6% (n=176) |
| 22-50 m | 18% (n=4657) | 33% (n=2594) | 37% (n=1071) | 31% (n=541) |

Threshold sweep, 10-22 m (P(not safe) above t): pixel hazard recall / false-hazard rate = 94% / 67% at t=0.2, 75% / 24% at t=0.5, 52% / 8% at t=0.8.

Findings: (1) performance does not improve at low altitude; (2) recall is low at every size and lowest for the largest boulders at low altitude, so this is not label ambiguity near the 21 cm threshold; (3) moving the threshold trades misses for false alarms along a poor curve, so thresholding or morphological clean-up cannot fix it; (4) the contact-zone metric is uninformative on this tile (100 of 105 frames at 10-22 m have a hazard within 1 m of the aim point), a limitation of the test terrain. The conclusion is a domain gap: the detector has not learned what real boulders look like. The fix is on the data side (angular synthetic boulders, some real training terrain), then the model; the first test of that is section 3c.

## 3c. Detector v2: angular boulders and real west-half training frames

Changes from v1 (both applied together, so their separate effects are **not** isolated yet): synthetic training terrains use a mix of ellipsoidal and angular boulders, and 1,500 frames of the real tile's **west half** are added to training. Both detectors are scored on frames from the **east half** of the real tile (300 frames, never seen in training; the footprint of every frame lies on one side of the split). Run `unet_v2`, 30 epochs, `scripts/overnight.py`.

| Altitude | Detector | mIoU | Boulder IoU | Hazard pixels called safe | Safe called hazard |
|---|---|---|---|---|---|
| 0-10 m (211 frames) | v1 | 0.34 | 0.22 | 35.8% | 19.8% |
| 0-10 m | **v2** | **0.46** | **0.55** | 28.2% | 21.3% |
| 10-22 m (89 frames) | v1 | 0.34 | 0.20 | 18.7% | 35.4% |
| 10-22 m | **v2** | **0.53** | **0.66** | 16.4% | 27.7% |

Boulder recall at 0-10 m by size (v1 -> v2): 0.2-0.5 m 13% -> 57%; 0.5-1 m 17% -> 76%; 1-2 m 11% -> 84%; 2-5 m 3% -> 83%. At 10-22 m the 2-5 m class goes from 10% to 96%. Near the aim point (hazard within 1 m of it, threshold 0.6, 0-10 m): v2 finds 98% of such frames with 0% false alarms; v1 found 93% with 40%.

What did not improve much: the share of hazard pixels called safe (35.8% -> 28.2% at 0-10 m) and safe pixels called hazard (about 21-28%). Hazard pixels include steep slopes, which v2 does not handle much better than v1.

**Caveats.** (1) The east half is held out but is the same site as the west half used in training, so this is easier than a new site and overstates generalization. (2) No ablation yet: the gain cannot be assigned to angular boulders versus real training frames. (3) Closed-loop effect on landings has not been measured yet (the Monte Carlo above used v1).

## 4. End to end (Monte Carlo)

Compared with published figures. Only one real landing exists, so agreement shows plausibility, not equivalence.

| Quantity | Published | Source status |
|---|---|---|
| Delivery error | within ~1 m of target | summary-level, exact figure to confirm |
| Predicted vs. actual contact | 3.5 cm, 1.4 s | summary-level, locate primary paper |
| Back-away probability before TAG | < 6% | NASA release |
| Contact speed | 10 cm/s | NASA release |

Boulder statistics: the published size-frequency slope for Bennu (−2.3 to −3.0 at candidate sites) is compared with the slope recovered from the detector's output on the real tile. Because the injected training boulders use −2.9, a match would be partly circular on synthetic terrain; on the real tile it measures detection bias across sizes. (The slope computed directly from the real tile's hazard map is consistent with the published range above about 0.75 m once touching rocks are split by a watershed; below that the count is incomplete. See references.md.)

## 5. Sensitivity (script ready; run on the finished Monte Carlo)

`python -m touchdown.analysis.sensitivity DIR` re-tests the saved landings without re-flying. Vary the assumed parameters that are not mission values (abort threshold, head radius, stale-map cutoff, correlated-error terms) and report how the conclusions move. A conclusion that depends on one of them should be stated as conditional.

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

### 6b. Harder experiment, detector v2 (Kaggle, 1,000 landings, seeds 0-999)

Each landing aims at a **random** point that is safe on the true map (clearance of at least 0.4 m, 10 m from the tile edge) instead of the single safest point, so margins are thin and a stale map or a detector can matter. This is an extension, not the mission's site selection. The detector is v2 (section 3c). Flown in two Kaggle sessions on 2 T4 GPUs (seeds 0-849, then 850-999); the second reused the first's saved landings, so the summary below covers all 1,000.

| Quantity | TouchDown (n=1,000) | Published |
|---|---|---|
| Delivery error, median / 95th pct | 0.39 m / 1.26 m | within ~1 m (one real landing) |
| Within 1 m of the aim point | 91.9% | 1 of 1 |
| Predicted vs. actual contact, median / 95th pct | 3.4 cm / 7.4 cm | 3.5 cm |
| Back-away rate, baseline, complete map | 17.7% | < 6% predicted pre-TAG (not comparable: our aim points are deliberately marginal) |

| Scenario | Back-away | Hit a hazard (proceeded) | Needless back-away | Safe touchdown |
|---|---|---|---|---|
| Complete map, baseline | 17.7% | 0.6% | 1.8% | 81.7% |
| Stale map, baseline | 16.2% | 1.9% | 1.6% | 81.9% |
| Complete map + detector | 25.1% | 0.3% | 8.9% | 74.6% |
| Stale map + detector | 24.7% | 0.6% | 8.8% | 74.7% |

**Reading it.** With a stale prior map the baseline hits a hazard in 1.9% of landings (19 of 1,000); adding the detector cuts that to 0.6% (6 of 1,000). That is real but costly: needless back-aways rise from 1.6% to 8.8% (16 to 88 landings), about five to six extra needless back-aways per hazard contact avoided. The cause is the detector's false-alarm rate (22-28% of safe pixels called hazard, section 3c). The event counts are small, so the benefit is suggestive rather than precise. The result is conditional on the assumptions: head radius 0.3 m (at 0.5 m the stale baseline hits hazards in 4.1-4.3%), the aim-point rule above, and the stale-map cutoff. Hazard contacts do not depend on the stale cutoff between 0.8 and 4 m, nor on the abort threshold (0.01 to 0.5). The earlier max-clearance experiment (513 landings with v1) found no benefit because the aim point was too safe to need a detector.

Replays on the website are re-flown on a different GPU from these runs, so small rendering differences are possible.

### 6c. Filter calibration sweep (Kaggle, 100 landings per setting, seeds 0-99)

Same flights re-run with different filter settings (`notebooks/09_kaggle_filter_sweep.ipynb`; measurement-correlation factor `corr` and filter process noise `sigma_a`). NEES is the filter's own consistency check: for 3 degrees of freedom the mean should be 3 and 95% of landings should fall under 7.815.

| Setting | n | NEES mean (expect 3) | NEES median | Within 95% bound (expect 95%) | Nav error at decision, median | Contact predicted vs actual, median | Back-away |
|---|---|---|---|---|---|---|---|
| baseline (corr 1.5, sigma_a 2e-6) | 100 | 9.6 | 7.6 | 52% | 2.5 cm | 2.9 cm | 12.0% |
| corr 2.0 | 100 | 7.0 | 5.4 | 67% | 2.5 cm | 3.2 cm | 12.0% |
| corr 2.5 | 100 | 5.2 | 4.1 | 80% | 2.6 cm | 3.1 cm | 12.0% |
| corr 3.0 | 100 | 4.0 | 3.1 | 88% | 2.7 cm | 3.1 cm | 16.0% |
| corr 2.5 + sigma_a 1e-5 | 100 | 1.9 | 1.6 | 100% | 2.1 cm | 2.2 cm | 15.0% (read from a truncated log line; confirm in `calibration.md`) |

Reading: the default filter is overconfident (mean NEES 9.6, only 52% inside the bound), as already documented. Inflating the measurement errors helps steadily, and adding process noise overshoots into mild conservatism (NEES 1.9, everything inside the bound). The best-calibrated setting lies between the last two rows. None of this changes the position estimates much (navigation error at the decision stays 2 to 3 cm) and the back-away rate moves only between 12% and 16% on 100 landings, so the headline results are not sensitive to it. The published-parameter 1,000-landing run uses the default filter; a calibrated setting is a candidate for a final re-run. Single seed set, n = 100 per row, so differences of a few points are within noise.

### 6d. Final run with the published parameters (Kaggle, 1,000 landings, seeds 0-999)

Same flights and random thin-margin aim points as 6b, judged with the published TAGSAM head radius (0.16 m, Walsh et al. 2022) and an abort threshold of 0.01 (Norman et al. 2022), detector v2. Intervals are 95% bootstrap (medians, percentiles) or Wilson (rates) intervals from `summary.json`, recomputed by notebook 10 on the same 1,000 landings.

| Quantity | Result (95% interval) |
|---|---|
| Delivery error | median 0.39 m (0.37 to 0.40), 95th percentile 1.26 m (1.11 to 1.44) |
| Within 1 m of the aim point | 91.9% (90.0 to 93.4) |
| Predicted vs. actual contact point | median 3.4 cm (3.2 to 3.6), 95th percentile 7.4 cm (published single landing: 3.5 cm) |
| Back-away rate, complete map, no detector | 9.6% (7.9 to 11.6); OSIRIS-REx predicted under 6% before its landing |
| Would hit a hazard if it never backed away | 9.1% (7.5 to 11.0) |

| Setup | Back-away | Hit a hazard when proceeding | Needless back-away | Safe touchdown |
|---|---|---|---|---|
| complete map, baseline | 9.6% | 0.5% | 1.0% | 89.9% |
| stale map, baseline | 8.9% | 0.9% | 0.7% | 90.2% |
| complete map, + detector | 16.2% | 0.3% | 7.4% | 83.5% |
| stale map, + detector | 16.0% | 0.3% | 7.2% | 83.7% |

Reading: with the published parameters the faithful baseline hits a hazard in about 0.5% to 0.9% of landings. The detector cuts that to 0.3% but multiplies needless back-aways by roughly seven, the same trade seen in 6b. The hazard counts are small (5 and 9 landings out of 1,000 proceed into a hazard under the baseline), so the benefit side is statistically weak.

Paired against the baseline on the same flights (95% intervals):

| Ground map | Hazard contacts, baseline to detector | Needless back-aways, baseline to detector | Extra needless per hazard avoided | McNemar p |
|---|---|---|---|---|
| complete | 5 to 3 (2 avoided, 0 introduced) | 10 to 74 | 32 (11.7 to 75) | 0.50 |
| stale | 9 to 3 (6 avoided, 0 introduced) | 7 to 72 | 10.8 (5.5 to 36) | 0.031 |

Only the stale-map benefit is significant, and it costs about 11 needless back-aways per hazard avoided. With a complete ground map the detector's benefit is not distinguishable from zero.

### 6e. Detector false-alarm ablation (Kaggle, seeds 0-299)

The detector's live hazard map flags a cell when its summed evidence is above zero (rule `L0`). Ten rules were judged on the same flights (`touchdown/sim/landing.py: NN_ABLATION`): higher evidence totals (L1 to L16) and minimum flagged-region sizes (`b9`, `b25` connected cells).

| Rule | Needless back-aways of 300 |
|---|---|
| no detector | 4 |
| L0 (shipped) | 25 |
| L1 / L2 | 22 / 22 |
| L4 | 16 |
| L8 | 9 |
| L16 | 4 |
| L0_b9 / L2_b9 / L4_b9 | 22 / 20 / 14 |
| L2_b25 | 19 |

Raising the evidence threshold removes false alarms steadily, and L16 flags essentially nothing (same as no detector). These 300 seeds contained no hazard contact at all, so the benefit side (hazards avoided) is empty here and no rule can be judged best from them.

### 6f. The same rules on the hazard cases (Kaggle, 91 landings where contact would hit a hazard)

`notebooks/12_kaggle_ablation_hazards.ipynb` re-flies exactly the 91 landings of the faithful run where touching down would hit a hazard, so this is the benefit side. The baseline numbers match the 1,000-landing run (5 hazard contacts with a complete map, 9 with a stale one), and `L0` reproduces its 3 and 3.

| Rule | Hazard contacts, complete map | Hazard contacts, stale map | Hazards avoided (complete / stale) | McNemar p (stale) |
|---|---|---|---|---|
| no detector | 5 | 9 | | |
| L0 (shipped) | 3 | 3 | 2 / 6 | 0.031 |
| L1 | 3 | 3 | 2 / 6 | 0.031 |
| L2 | 3 | 4 | 2 / 5 | 0.062 |
| L4 | 3 | 4 | 2 / 5 | 0.062 |
| L8 | 4 | 5 | 1 / 4 | 0.125 |
| L16 | 5 | 8 | 0 / 1 | 1.0 |
| L0_b9 | 3 | 3 | 2 / 6 | 0.031 |
| L2_b9 | 3 | 4 | 2 / 5 | 0.062 |
| L4_b9 | 4 | 5 | 1 / 4 | 0.125 |
| L2_b25 | 4 | 5 | 1 / 4 | 0.125 |

Reading, both halves together (cost from 6e, benefit from here):
- **L1 is a free small win:** it keeps the full benefit (2 and 6 hazards avoided) and cuts needless back-aways from 25 to 22 of 300.
- **L4 trades one hazard for a third of the false alarms:** 16 instead of 25 needless back-aways of 300, at the price of one stale-map hazard (6 avoided down to 5, not significant at this sample size).
- **No rule removes the cost and keeps the benefit.** L16 has the baseline's false-alarm rate but also none of the benefit. The false alarms and the true catches come from the same evidence, so a threshold alone cannot separate them.
- **Caveats:** the benefit side is 2 to 6 landings, so differences of one landing between rules are noise. Cost and benefit come from different seed sets (random seeds 0-299 vs. the 91 hazard seeds). A detector retrained with hard negatives is the real fix, not a threshold.

## 7. Known weaknesses and planned fixes

| Weakness | Evidence | Planned or possible fix |
|---|---|---|
| Detector misses 30% of hazard pixels on real terrain | real-terrain test, section 3 | Make injected boulders angular instead of ellipsoidal (the main sim-to-real gap); optionally train on part of the real tile and test on a disjoint part; choose the operating threshold from a precision-recall curve for the task (false-safe vs. needless back-away trade-off) |
| Filter is overconfident | NEES 8-14 at the decision (expected ~3) | Errors are correlated terrain-model errors, not process noise, so first calibrate the measurement side (R and the common-mode terms) against NEES over the Monte Carlo; process noise Q is a cheap second knob to sweep |
| Simulated descent starts at 45 m, not at the real Checkpoint (125 m) | the 5 cm tile is 48 m wide | The final phase (from ~54 m) is what matters for the touchdown decision and is covered; the Checkpoint to Matchpoint phase and its dispersions are assumed (start dispersion in `SimConfig`). To extend upward, stitch the real 88 cm global model (already downloaded) around the 5 cm tile rather than inventing terrain procedurally |
| Detector adds no value in the current experiment | provisional Monte Carlo | Harder conditions: aim points with marginal clearance, harsher stale-map variants (see sensitivity analysis), more boulder coverage near the aim point |
| Decision parameters are not mission values | head radius, abort threshold | Sensitivity analysis, `python -m touchdown.analysis.sensitivity` |
