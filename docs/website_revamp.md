# Website revamp: decisions (2026-10-15)

Agreed with the user in a 62-question round. This is the brief the build follows; change it only with the user. The current live site stays unchanged until the user approves the new home page. Work happens on the branch `revamp-3d`.

## Principles
- No scrolling. Everything is click to play: two small circle buttons at the bottom centre (back, forward), arrows on the circles. Space and right arrow go forward, left arrow goes back. Clicking during an animation jumps to its end. Only landings have links (`#/landing/<n>`).
- More realistic: real NASA data and models, real-time 3D (three.js with react-three-fiber), a single low hard sun and black shadows, no gradients.
- Not childish, not a generic startup page. Calmer typeface (replace Unbounded and Space Mono; a clean mono for numbers only). UI is pure white and grey on black.
- Keep everything that exists (galaxy, telescope opening, story, landing view, replays); the story wording is kept exactly, only timing adapts.

## Home page (first checkpoint)
- Realistic 3D reflector telescope on a mount, in the bottom 45 to 50 percent of the screen, on a dark hilltop silhouette. Slow auto-rotate only (no drag). Built from a free model if a good one is available, else modelled in code from references (none free and downloadable without an account was good enough, so it is modelled in code).
- Background: NASA SVS Deep Star Maps (public domain), 8K on desktop and 4K on phones, very slow drift. Upper half is open sky.
- Constant meteor shower: thin bright streaks from one radiant, one every second or two with occasional bursts, plus a few rocky asteroids drifting across the far sky.
- Nothing else on screen (no title, no top bar) except the two circle buttons.
- Steps: 1) slow push-in toward the radiant, caption "Let's take a look". 2) pull back to the telescope view with a short caption. 3) the telescope turns until the eyepiece faces the camera, the camera flies through the eyepiece (short optical tunnel, then a round star view that widens to full screen); the NASA star map, denser and brighter, with a realistic Bennu-shaped rocky asteroid streaking by. 4) the camera swings round, chases the asteroid, then pulls back to reveal the galaxy.

## Galaxy
- Procedural 3D spiral galaxy from tens of thousands of real-coloured stars (warm core, blue-white arms, pink knots, dust lanes), true black background with the NASA star map. Drag to rotate, scroll or pinch to zoom, slow idle rotation. Stars are scenery only: no link to landings.
- Slim bottom bar: landing slider and number box with Open; "Watch the story" outlined pill with a play arrow at bottom right. No hover labels on stars.

## Landing view
- Picture viewer (raw, truth, detector layers, zoom, pan, before/after, hover readout) on the left; decision banner, numbers and the complete/stale map and baseline/detector toggles on the right. Background: the NASA sky dimmed behind a dark panel. Camera replays for the 12 special landings are kept.

## Story
- Opens on a plain NASA star field with "Watch the story" centred and a circle button. Back and forward circle buttons, one animation per press, progress 1 to 7.
- All seven scenes in real-time 3D: OSIRIS-REx model (NASA 3D Resources, public domain), the real Nightingale terrain mesh (NASA SVS 5069, reduced), one low sun, hard black shadows. Hazard map is a flat unlit grid draped over the terrain; the camera moves are cinematic and fixed (no user control); transitions are a camera travel or a quick fade to black. Hazard colour: none, outlines and brightness only.

## Not now
- Statistics and results section: hidden but kept in the code. No sound. Credits: the footer line only (name the authors and licences of any CC-BY item there).

## Technology and delivery
- three.js with react-three-fiber. Phones get the same experience at lighter quality (4K sky, fewer stars and meteors, lower mesh detail). A brief loading screen with a progress ring; story assets stream in the background. Reduced motion: cross-fades between still scene frames, no meteors or camera moves.

## Files fetched (scratch, outside the repo: `%LOCALAPPDATA%/TouchDown/data/web3d`)
- `starmap_8k.jpg` (7.2 MB), `starmap_4k.jpg` (2.3 MB): NASA SVS 3895 Deep Star Maps, celestial coordinates.
- `bennu_global_v20.glb` (60.6 MB): NASA SVS 5069, global Bennu, 3.4 M polygons.
- `bennu_nightingale.glb` (77.3 MB): NASA SVS 5069, Nightingale sample site tile, 4.3 M polygons.
- All public domain; credit "NASA's Scientific Visualization Studio; data NASA/University of Arizona/CSA/York University/MDA". - `Osiris_Rex.glb` (4.3 MB, NASA VTAD, from science.nasa.gov/resource/osiris-rex-3d-model), fetched with the user's OK on 2026-10-15.

## Built (status 2026-10-15)
- Home: telescope, meteors, eyepiece, asteroid chase, orbitable galaxy with the landing picker, landing view, story intro. Story: seven 3D scenes in `web/src/home/story/`:
  - `terrain.ts` (pure): height field rasterised from the decimated Nightingale tile (`public/assets/models/nightingale_site.glb`, 281k triangles, 25 m radius, metres, +y up), a per-cell hazard map (rock more than 0.28 m above the fitted local plane, or slope above 24 degrees; story thresholds, not the mission's), and a deterministic choice of the patch and the three landing sites.
  - `script.ts` (pure): `storyPose(scene, u)` gives camera, probe, sun elevation and overlay state for every scene.
  - `StoryWorld.tsx`: renders it (one hard sun with shadow map, real OSIRIS-REx model with the sampler head as its origin, draped white grid/outline/ring overlays from `draped.ts`, camera cone, thruster flames, dust). `useStory.ts` plays one scene per press (a second press skips to the end), `StoryUI.tsx` is the controls.
- "See a real one" opens the landing view of a real landing picked from the data (`lib/tour.ts`); the story stays where it was.
- Rebuild the story ground with the scratch script that decimates `bennu_nightingale.glb` (area-weighted mean face normal gives up; crop to 25 m; meshopt simplify): not committed, ask for it if the mesh has to change.
