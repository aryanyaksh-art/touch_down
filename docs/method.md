# Method

What TouchDown does, why, and where it departs from the real OSIRIS-REx. Items marked **ASSUMPTION** are choices of this project, not mission facts. Sources and confirmation status of every number are in [references.md](references.md).

## 1. Scope and fidelity

| Part | Real OSIRIS-REx | This project |
|---|---|---|
| Navigation | NFT: terrain model rendered onboard, correlated with NavCam images, Kalman filter | Same structure, reimplemented |
| Burns | Checkpoint (~125 m) and Matchpoint (~54 m), computed onboard from the NFT state | Single Matchpoint-style burn at ~41 m (limited by the 48 m terrain tile) |
| Contact | Ballistic descent to contact at ~10 cm/s | Same |
| Hazard avoidance | Ground-built hazard map; back-away at ~5 m if the predicted contact is unsafe | Same, as the **baseline** |
| Hazard detection | None onboard | **Extension:** U-Net on descent images |
| Attitude | Estimated | Assumed known exactly (**ASSUMPTION**) |
| Gravity | Irregular field | Point mass + rotating frame (**ASSUMPTION**, error ~1% at this scale) |

The Checkpoint burn and everything above ~45 m are not simulated: the highest-resolution public terrain (NASA's 5 cm Nightingale tile) is 48 m wide, and camera frames above ~45 m would leave it.

## 2. Frames and conventions

* **Body frame:** Bennu-fixed, origin at the centre of mass, +z along the spin axis, rotating at 2π / 4.296 h.
* **Local site frame:** east, north, up at the centre of the Nightingale tile, fixed to the body. "Up" is the normal of the plane fitted to the tile; heights are metres above that plane. All navigation, rendering and guidance run in this frame.
* **Camera:** OpenCV convention (x right, y down, z forward), pinhole, 44° horizontal field of view, 640×480 render resolution (**VERIFY** against Bos et al. 2018).

## 3. Terrain and hazards

* Truth terrain: NASA SVS `l_00050mm_alt_ptm_5595n04217_v020` (5 cm tile at 55.95°N 42.17°E), converted to a 5 cm heightfield. A heightfield cannot represent overhangs under boulders.
* Hazard definition (confirmed, see references): objects ≥ 21 cm obstruct the sampler head; slopes > 14° exceed what it can accommodate. A heightfield gives heights, not object dimensions, so **ASSUMPTION:** a rock is a connected region ≥ 21 cm above local ground (estimated by grey-opening, 2 m window), and slope is measured over a 0.5 m window.
* Classes: safe, boulder, steep. The aim point is the location of maximum clearance from any hazard, standing in for the mission's chosen point.

## 4. Two renderers on purpose

* **Truth camera:** Blender Cycles, Lambertian surface (albedo 0.044), one sun, cast shadows, sensor noise added afterwards. Labels are looked up from the 3D position under each pixel, so they register exactly with the image.
* **Onboard model:** coarser and noisier than the truth, as on the spacecraft. Two levels: 25 cm (3 cm height error) above 22 m altitude, 5 cm (2 cm error) below. The mismatch between what is rendered onboard and what the camera sees is the source of realistic navigation error. **Limitation:** the truth tile has no centimetre-scale detail beyond 5 cm, so low-altitude navigation here is optimistic.

## 5. Natural Feature Tracking

Per frame (`touchdown/nav/nft.py`):

1. Pick up to 12 catalog landmarks predicted to lie well inside the image, best texture first, at least 70 px apart.
2. For each, render a 41×41 px Lambertian template of the onboard terrain around the landmark as seen from the *predicted* pose and sun, including cast shadows (heightfield ray casting).
3. Correlate the template against the image within ±14 px using zero-mean normalized cross-correlation; refine the peak to sub-pixel with a parabola.
4. Accept matches with peak ≥ 0.55 and a clear margin over the second-best peak.
5. Each match becomes a pixel measurement of a known 3-D point. Template size, search radius and feature count are **ASSUMPTIONS**.

## 6. Navigation filter

* State: position and velocity (6), local frame. Propagation: nonlinear rotating-frame point-mass dynamics (RK4); covariance by the state-transition matrix from the analytic gravity gradient, plus process noise from an unmodelled acceleration of 2×10⁻⁶ m/s² (**ASSUMPTION**).
* Measurement: pixel position of each landmark. Noise per landmark is inflated by (a) correlation noise, (b) the onboard model's error converted to pixels at that landmark's range, (c) a correlated-error factor of 1.5, and (d) landmark height uncertainty, which enters as a rank-one term through d(pixel)/d(landmark height), i.e. parallax. Innovation gate: χ² 99% (2 dof). Joseph-form update, sequential over landmarks.
* Known weakness: the filter is **overconfident** (NEES above the expected 3). See validation notes.

## 7. Guidance: the Matchpoint burn

Choose the velocity v₀ and time of flight T that put the spacecraft on the aim point at the surface with vertical speed −10 cm/s (four equations, four unknowns, Newton with finite-difference Jacobian over the full nonlinear propagation). The burn is Δv = v₀ − v̂, executed with proportional (1%), fixed (0.2 mm/s) and pointing (0.5°) errors.

A consistency check worth knowing: with Bennu's surface gravity (~8×10⁻⁵ m/s² effective), a free fall reaches 10 cm/s after dropping ~60 m. This is why a ballistic approach to 10 cm/s contact must begin below about 60 m, matching the real Matchpoint altitude of 54 m.

## 8. The back-away decision

At about 5 m (by the filter's own altitude estimate) the filter's state is propagated to the surface to give a predicted contact point and its covariance (including the coupling from vertical-position uncertainty). The probability that the sampler head (radius 0.3 m, **ASSUMPTION**) overlaps a hazard cell is estimated by sampling that distribution against a clearance map. If it exceeds 10% (**ASSUMPTION**), the spacecraft backs away. Off-map contact counts as unsafe.

## 9. The neural extension

* U-Net (about 4.4 M parameters at the default base width of 24), 3 classes, trained with weighted cross-entropy + Dice.
* **Train on synthetic, test on real:** training and validation terrains are the real Nightingale ground with its boulders removed and new boulders injected from a power law (slope −2.9, density from the real tile); the real Nightingale surface with real boulders is the held-out test set. The injected boulders are smooth half-ellipsoids, so test performance measures the synthetic-to-real gap.
* In flight, below 22 m, each frame's non-safe probability is projected onto the terrain with the estimated pose and fused over frames as log-odds. At the decision, the live map is united with the ground map before the clearance test.

## 10. Monte Carlo

One flight per seed; the decision is judged under four conditions from the same frames (ground map complete or stale, with or without the detector). The "stale" map omits boulders under 0.8 m (**ASSUMPTION**). Randomized per landing: start offset (1.5 m), start velocity (3 mm/s), initial navigation error (0.4 m, 2 mm/s), burn errors, unmodelled acceleration (1×10⁻⁶ m/s²), sun direction, onboard-model error realization. All values are in `SimConfig`.

## 11. Limitations to state plainly

* One real landing exists; matching its numbers shows plausibility, not equivalence.
* Truth terrain resolution equals the finest onboard resolution, so centimetre-scale navigation is optimistic.
* Attitude known exactly; point-mass gravity; Lambertian photometry (Bennu is darker and has an opposition surge).
* Simulated altitudes start at 45 m, not at Checkpoint.
* Several decision parameters (head radius, abort threshold) are not mission values.
