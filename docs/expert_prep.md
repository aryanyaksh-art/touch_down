# Preparing for the expert review

Questions a space-robotics reviewer is likely to ask, with honest answers. Numbers come from [validation.md](validation.md) and [descent_extension.md](descent_extension.md); every published value and its confirmation status is in [references.md](references.md). Throughout, "faithful" means a method the real mission used, and "extension" means something added that the mission did not have.

## The short version

TouchDown rebuilds OSIRIS-REx's autonomous touch-and-go end to end in simulation: Blender-rendered camera frames of NASA's 5 cm Nightingale terrain, Natural Feature Tracking (NFT) with a Kalman filter, a Matchpoint-style burn to a ballistic descent at 10 cm/s, and a hazard-map back-away decision at about 5 m (all faithful). The one extension is a neural hazard detector fused into a live hazard map.

Headline (1,000 landings from 45 m, random thin-margin aim points, published head radius 0.16 m and abort threshold 0.01; 95% intervals):

| Quantity | Result | Published (one real landing) |
|---|---|---|
| Delivery error, median | 0.39 m (0.37 to 0.40) | within about 1 m |
| Within 1 m of the aim point | 91.9% (90.0 to 93.4) | 1 of 1 |
| Predicted vs. actual contact, median | 3.4 cm (3.2 to 3.6) | 3.5 cm |

The same seeds flown from the real 125 m Checkpoint (150 seeds): delivery median 0.68 m, 79% within 1 m, predicted vs. actual 4.1 cm. That run is the more faithful geometry and is the number to quote for delivery accuracy; the 45 m runs understate it (see below). One real landing exists, so agreement shows plausibility, not equivalence.

## Understanding

**Why did OSIRIS-REx navigate with images instead of GPS or its lidar?**
There is no GPS at an asteroid, and Bennu's surface is poorly known in advance. NFT compares onboard renderings of a terrain model with the camera image, which gives a position fix relative to the surface itself, which is what matters for touching a specific spot. (Lidar guidance was the other onboard option; NFT was the primary at TAG. VERIFY the exact roles in Olds et al. before stating them as fact.)

**Why a ballistic descent after Matchpoint instead of continuous control?**
At about 8×10⁻⁵ m/s² effective gravity, a free fall reaches the 10 cm/s contact speed after about 60 m of drop, so one burn sets up a soft arrival with no thrusting near the surface (which also keeps thruster plumes away). From Matchpoint at 54 m the arc takes about 790 s. The spacecraft arrives at Matchpoint coasting at roughly 0.08 m/s and the burn slows it to about 0.04 m/s, which is why the Matchpoint burn is about 0.07 m/s in the simulation (NASA also describes it as slowing the descent).

**Is the filter observable?**
Pixel measurements of known 3-D landmarks spread over the image determine position (a PnP-like problem); velocity follows from successive fixes. With landmarks near nadir only, depth is weakly observable; with the field of view used here and landmarks at least 70 px apart it is well constrained. Not proven formally.

**Why is the landing error not simply the navigation error?**
It combines navigation error at the burn, burn execution error, and unmodelled forces over the roughly 790 s coast. Navigation error at Matchpoint is about 8 cm; the delivery error (median 0.68 m from 125 m) is dominated by the assumed burn execution error acting over the coast. The prediction error at 5 m is the quantity comparable to the mission's "predicted vs. actual".

**Why did starting at 125 m make delivery worse than starting at 45 m?**
Because the Matchpoint burn is realistic. From 45 m the start state was almost on the final arc, so the burn was about 5 mm/s and its assumed errors (1% magnitude, 0.5° pointing, 0.2 mm/s fixed) barely mattered. From 125 m the burn is about 73 mm/s, and the same error model acts for the whole arc. Median delivery error rises from 0.39 m to 0.68 m (paired difference +0.28 m, 95% interval +0.11 to +0.35, 150 seeds). The error model is an assumption, not mission data, and was fixed before this run, not tuned to it. A sensitivity run on 50 seeds shows the effect: with perfect burns the median is still 0.50 m, with the assumed errors 0.68 m, with them doubled 0.85 m (95th percentile 1.9 m, only 58% within 1 m). A second run removed the assumed unmodelled acceleration (1e-6 m/s^2): the median falls to 0.34 m with the assumed burn errors and 0.15 m with perfect burns, so that acceleration, not the burn, is the larger part of the delivery error. So "about 1 m" holds for the assumed errors, but how often it is met depends on two numbers that are not mission values.

## Method choices

**Why two renderers?**
So the navigation algorithm is tested against a scene it did not render itself. The camera sees Blender's render of the truth terrain; NFT renders its templates with a separate NumPy photometric model from a coarser, noisier copy of the terrain. Using one renderer for both would remove the model error NFT has to tolerate.

**Why train the detector on synthetic terrain and test on the real surface?**
It separates memorizing the test terrain from generalizing. Training terrains are the real ground with its boulders removed and new power-law boulders injected (slope −2.9, density from the real tile; both extrapolations below the fitted range, see references.md). The east half of the real tile is held out and was never trained on. Caveat: the west half is in training and the closed-loop flights cross both halves, so closed-loop results are easier than a new site would be.

**Why report false-safe rate instead of only IoU?**
Calling a hazard safe is the failure that ends a mission; calling safe ground hazardous only costs a retry. IoU hides that asymmetry.

**Why random aim points?**
The real site was chosen for large clearance, so a detector has almost nothing to catch there (the first 513 landings with the max-clearance aim point showed no detector benefit). Random aim points that are safe on the true map but with thin margins (at least 0.4 m clearance, 10 m from the tile edge) stress the back-away logic. This is an extension, not the mission's site selection, and it is why the back-away rate (about 10 to 17%) is not comparable with the mission's under 6%.

**What is a hazard, and what is a "stale" map?**
Hazard = a rock 21 cm or more tall (TAGSAM inner opening) or a slope above 14° (both confirmed, Walsh et al. 2022). Rocks are found from a heightfield by grey-opening (2 m window), so overhangs and rocks under about 21 cm are invisible; the hazard map is complete only for larger boulders. A stale map omits boulders under 0.8 m (an assumption), standing in for rocks the ground team missed.

**Is point-mass gravity adequate?**
Over a 54 m drop the field error is small compared with the unmodelled-acceleration allowance used (1×10⁻⁶ m/s² truth, 2×10⁻⁶ in the filter), but it was not quantified against a polyhedron model. State it as a limitation. The Coriolis term is included and matters: it pushes the spacecraft about 8 m sideways during the 11-minute coast, which the nominal trajectory compensates.

## Results and how to read them

**What do the 45 m runs cover, and what do they miss?**
They start inside the 48 m terrain tile, so they cover the last part of the descent, with a Matchpoint burn placed 60 s after the start rather than at 54 m. The Checkpoint-to-Matchpoint coast and navigation above 45 m are not covered, and the small burn makes delivery error too optimistic.

**What does the 125 m extension do?**
It embeds the real 5 cm tile in a 160 m terrain built from NASA's 88 cm global model (real data, smooth), with synthetic boulders outside the tile (one fixed realization, an assumption). NFT's high-altitude level uses a coarse onboard model without those boulders. Hazard maps and aim points stay on the real tile. It flew 6 test descents (NFT never lost lock; Matchpoint reached at 52 to 57 m) and then 150 paired seeds. Navigation errors above 54 m (about 0.1 m) are optimistic because the global model is both the camera's truth and the basis of the onboard model there. The Checkpoint burn itself is not simulated.

**How does the back-away rate compare with the published under 6%?**
It does not, and should not be compared: our aim points are deliberately marginal (9.6% over 1,000 seeds from 45 m with a complete map; about 15 to 17% on the 150 seeds from 125 m).

## The detector (be upfront)

- **Held-out frames (east half of the real tile):** v2 (angular synthetic boulders plus real west-half training frames) reaches boulder IoU 0.55 (0 to 10 m) and 0.66 (10 to 22 m); v1 was 0.22 and 0.20. The gain came from two changes applied together, so their separate effects are not isolated.
- **Closed loop, 1,000 landings:** with a stale prior map the detector cuts hazard contacts from 9 to 3 (McNemar p = 0.031) but raises needless back-aways from 7 to 72, about 11 extra needless back-aways per hazard avoided (interval 5.5 to 36). With a complete map the benefit is not distinguishable from zero (5 to 3, p = 0.50).
- **Can the cost be removed?** Ten evidence rules for the live map were tried on the same flights (6e, 6f). A mild threshold (L1) keeps the full benefit and trims false alarms slightly; a stronger one (L4) gives up one stale-map hazard for about a third fewer false alarms; no rule removes the cost and keeps the benefit.
- **Hard-negative retraining (6g):** concentrating training on the detector's own false alarms gave no gain beyond a random-frame control (0.5 points of false-hazard rate at matched recall); the stronger pixel loss made it worse. One setting, one seed.
- **What to claim:** a working, tested extension whose benefit appears only when the ground map is stale and which costs a lot of needless back-aways. Do not present it as an improvement for flight. The honest next steps are more real-terrain training data and a better operating point per altitude.

## Where the work is weak (be upfront)

- **The filter is overconfident.** On seeds 0 to 99 the default filter has mean NEES 9.6 against an expected 3, with 52% of landings inside the 95% bound (6c); inflating measurement errors fixes most of it with little change to the position estimates. The 1,000-landing mean NEES (161) is far larger than that sweep, which points to a few badly inconsistent landings; not yet investigated. The default filter was used for the published-parameter runs.
- **Low-altitude navigation is optimistic.** The truth camera renders the same 5 cm model the onboard model derives from, so centimetre errors are not comparable with the mission's 3.5 cm. The same holds above 54 m in the wide terrain.
- **Several parameters are not mission values:** the abort threshold (the mission's number is unpublished; 0.01 follows its stated >99% safety), burn execution errors, start dispersions, the stale cutoff. The head radius is confirmed (0.16 m from the published 32 cm outer diameter; 0.30 m is kept as a conservative sensitivity case). A sensitivity analysis exists for the decision parameters; the burn-error assumption was varied on 50 seeds (0x, 1x, 2x: median delivery 0.50, 0.68, 0.85 m) and so was the unmodelled acceleration (1e-6 m/s^2, on or off: median 0.68 to 0.34 m with the assumed burn errors, 0.50 to 0.15 m with perfect burns), so the delivery error from 125 m depends on both assumptions. The acceleration was only run at zero and the assumed value, not at intermediate levels.
- **A targeting failure at Matchpoint.** In the two acceleration-off runs one landing of 50 (seed 14) is a gross outlier: the Matchpoint solve did not converge, commanded a 66 m/s burn and the spacecraft flew away (3.1e5 m error). It is a solver defect, not physics. Whether the earlier 125 m runs (150 and 50 seeds) contain the same failure was not checked, so their "within 1 m" shares may be slightly low; medians are unaffected.
- **Attitude is known exactly;** the real system estimates it. Photometry is Lambertian (Bennu is darker with an opposition surge).
- **Terrain realism:** boulders injected for training are idealized; outside the 5 cm tile in the 125 m runs the boulders are synthetic.
- **One real landing** exists to compare with. The claim is plausibility, not equivalence.

## If asked what you would do next

1. Make the Matchpoint targeting solve robust (seed 14 does not converge), count how many earlier 125 m seeds failed the same way and re-fly them. The acceleration and burn-error sensitivities are done (descent_extension.md); intermediate acceleration levels and a time-varying force model would be the next refinement.
2. Run the full 1,000 landings from 125 m (about 55 GPU hours; unrealistic on the free tier, so more paired seeds instead).
3. Re-run with a calibrated filter and report the effect on the back-away decision.
4. Quantify point-mass gravity against a polyhedron model.
5. Replace the synthetic outer boulders with a real boulder map or a different realization to see how sensitive navigation is to them.

## What the project does and does not claim

Claims: the method is implemented end to end and tested (the pytest suite runs in CI); it reproduces the structure of the mission's approach; simulated landing statistics land in the same range as the published single-landing figures; the detector extension was tested honestly, including its failures.
Does not claim: equivalence with flight software, flight-qualified accuracy, that the 0.68 m reflects mission performance (the burn errors are assumed), or that a neural hazard detector would be accepted for flight.
