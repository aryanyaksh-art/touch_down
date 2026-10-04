# Preparing for the expert review

Questions a space-robotics reviewer is likely to ask, with honest answers. Numbers marked (MC) come from the Monte Carlo and are filled in after the run; see [validation.md](validation.md).

## Understanding

**Why did OSIRIS-REx navigate with images instead of GPS or its lidar?**
There is no GPS at an asteroid, and Bennu's surface is poorly known in advance. NFT compares onboard terrain-model renderings with the camera, which gives a position fix relative to the surface itself, which is what matters for touching a specific spot. (Lidar guidance was the other onboard option; NFT was the primary at TAG. VERIFY the exact roles in Olds et al.)

**Why a ballistic descent after Matchpoint instead of continuous control?**
At ~8×10⁻⁵ m/s² effective gravity a free fall reaches the 10 cm/s contact speed after ~60 m, so a single burn sets up a soft arrival with no thrusting near the surface, which also keeps thruster plumes and contamination away. The same arithmetic explains the real Matchpoint altitude (54 m).

**Is the filter observable?**
Pixel measurements of known 3-D landmarks spread over the image determine position (a PnP-like problem). Velocity follows from successive fixes. With landmarks near nadir only, depth is weakly observable; with the field of view used here and landmarks spread ≥ 70 px apart it is well constrained.

**Why is NFT's low-altitude accuracy not directly comparable to the mission's 3.5 cm?**
The truth camera renders the same 5 cm model that the onboard model derives from, so centimetre-scale detail the real asteroid has but no model contains is absent. Low-altitude centimetre errors here are optimistic.

**Why is the landing error not simply the navigation error?**
It combines navigation error at the burn, burn execution error, and unmodelled forces over the ~500 s coast. The prediction error at 5 m is the quantity comparable to the mission's "predicted vs actual".

## Method choices

**Why two renderers?**
So the navigation algorithm is tested against a scene it did not render itself. Using one renderer for both would remove the model error that NFT actually has to tolerate.

**Why train on synthetic terrain and test on the real surface?**
It separates memorizing the test terrain from generalizing. Synthetic boulders are smooth ellipsoids, real ones are angular, so the real-terrain score is the honest measure of the sim-to-real gap.

**Why report false-safe rate instead of only IoU?**
Calling a hazard safe is the failure that ends a mission; calling safe ground hazardous only costs a retry. IoU hides that asymmetry.

**Is point-mass gravity adequate?**
Over a 50 m drop the field error is small compared to the unmodelled-acceleration allowance used (2×10⁻⁶ m/s²), but it was not quantified against a polyhedron model. State this as a limitation.

## Where the filter is weak (be upfront)

* NEES is above the expected value of 3: the filter is overconfident, especially with the coarse onboard model. The correlated errors (terrain model, sun direction) are not modelled as states. A consider-covariance or state-augmented approach is the proper fix.
* Attitude is assumed known; the real system estimates it.
* The abort threshold and head radius are assumptions, not mission values.

## What the project does and does not claim

Claims: the method is implemented end to end; it reproduces the structure of the mission's approach; simulated landing statistics land in the same range as the published single-landing figures.
Does not claim: equivalence with flight software, flight-qualified accuracy, or that a neural hazard detector would be accepted for flight.
