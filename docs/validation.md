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

## 3. Hazard detector

Train and validation terrains are synthetic; the test terrain is the real Nightingale surface, never seen in training. Reported: per-class IoU, false-safe rate, and boulder recall by physical size. The real-terrain test is the number that matters; validation on synthetic terrain overstates it.

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

Pasted from the Monte Carlo summary after the run.
