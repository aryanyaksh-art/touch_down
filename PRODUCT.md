# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **A space-robotics expert** reviewing the project (target about 2026-11-01). They judge whether it is technically credible and honest: what is faithful to OSIRIS-REx, what is an added extension, how the numbers were produced and where they are weak.
- **General visitors and classmates (TKS Build cohort)** who arrive from a link and should understand in seconds what a spacecraft landing by itself looks like, then see the evidence if they stay.
- Confirmed by the user: design for both, story first, then evidence.

## Product Purpose
TouchDown is a from-scratch recreation of the autonomous touch-and-go OSIRIS-REx performed at asteroid Bennu: camera-based navigation (Natural Feature Tracking), a ballistic descent, and a hazard-map back-away decision at about 5 m. It adds one clearly labelled extension, a neural hazard detector, and tests everything with 1,000 simulated landings compared with published data. The website is the public face of that work: a scroll journey from a telescope into a galaxy of 1,000 landings (one star each), through an explainer of how a probe sees, to real landings and the results. Success (confirmed by the user): after about a minute a visitor has learnt how asteroid hazard detection works through the story, which the user considers the strongest part of the site; believing the numbers and opening a landing follow from that.

## Positioning
Not a mission fan page and not a demo reel: every star on the page is one real simulated landing with its own picture, decision and numbers, and the page says plainly which parts are faithful to the mission and which are extensions or assumptions.

## Operating Context
- Static site (Vite + React + TypeScript + Motion), deployed to GitHub Pages from `web/`. Data are static JSON/WebP files under `web/public/data` (1,000 landings, 12 camera replays, 1,000 pictures, `summary.json`).
- The reviewer reads docs in the repo (`docs/validation.md`, `docs/descent_extension.md`, `docs/expert_prep.md`) alongside the site.
- Pinned scroll stages, canvas galaxy, and CSS-keyframe scene animations are existing mechanics of the flow.

## Capabilities and Constraints
- Everything that exists stays (confirmed by the user: "literally everything"): telescope opening, galaxy of 1,000 stars, dive onto the surface, "how a probe sees" (4 scenes), "three landings" (clean, back away, old map), results, per-landing overlay with replay or picture viewer.
- **Confirmed direction for the revamp:** more realistic, and the story is driven by a button that plays each animation instead of by scrolling. The user will describe the exact experience themselves; it needs 3D modelling (for example the real Bennu shape model and a spacecraft) that has not been started. Not yet specified: which scenes get 3D, camera behaviour, the button interaction model.
- Results shown today: median delivery error 0.39 m, 91.9% within 1 m (1,000 landings from 45 m); 3.4 cm predicted-vs-actual; back-away rate; a comparison of the 45 m vs 125 m start and burn-error sensitivity (numbers hard-coded in `web/src/lib/startAlt.ts`). New, not yet on the site: the acceleration sweep (0.68 to 0.34 m, 0.50 to 0.15 m), and a Matchpoint solver fix whose re-flown numbers are still pending (125 m figures may shift slightly).
- One real landing exists to compare with; claims are plausibility, not equivalence. Faithful vs extension labelling is mandatory.
- Constraints: no gradients anywhere (flat fills). Zero em-dashes in visible copy. Honest sample-vs-real labelling. Static hosting.
- Open (not decided): nothing else is pinned; typography, palette, layout and motion language are open to change.

## Brand Commitments
- The result must not feel childish, and must not read as a generic SaaS or startup page (confirmed by the user).
- Name: TouchDown. Independent educational recreation, not affiliated with NASA (footer credit stays). Flat, no gradients is the one binding visual commitment the user kept.
- Orange-red for hazards was a previous convention; the user left everything except "flat, no gradients" open to change.

## Evidence on Hand
- 1,000 simulated landings, 12 replays with camera frames, 1,000 pictures, summary with intervals (all real, in `web/public/data`).
- Banner and pipeline diagram in `docs/img`. No real mission footage or photographs are on hand; none may be invented.
- NASA terrain model of Nightingale (public, credited).

## Product Principles
1. Say what is real. Every claim carries its label (faithful, extension, assumption, sample).
2. The landings are the content. The galaxy, the overlay and the results all come from the same 1,000 records.
3. Story first, evidence one scroll away. A first-time visitor gets the idea before any statistic; a reviewer can reach intervals and caveats without hunting.
4. Plain words before jargon, precise numbers one click behind.
5. Calm pacing: each scene gets the scroll it needs to finish.

## Accessibility & Inclusion
- Respect `prefers-reduced-motion` (a static, readable story is already provided). Keyboard-reachable controls. Phones are first-class: the revamp should bring the pinned story to touch devices rather than a reduced version.
