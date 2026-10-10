# Website

Vite + React + TypeScript, animated with [Motion](https://motion.dev). A flat night sky: no gradients anywhere.

**What it does.** Scrolling zooms from a flat vector telescope into its blue lens, which swells into a galaxy where every star is one simulated landing (three spiral arms by outcome, distance from the core is how far the landing ended from its aim point). Scrolling on dives into the core and lands on an asteroid, then a pinned full-screen reel plays seven short animations: how a probe sees hazards, and three landings (clean, backing away, an out-of-date map). Four animated tiles summarise the results. Click a star, use the landing slider, or open `#/landing/<seed>` to see that landing: a full camera replay for exported ones, or a data card with the analysed 5 m picture (zoom, layers, before/after slider, hover readout).

```bash
cd web
npm install
npm run dev      # local preview
npm run build    # production build into web/dist
```

## Data

The page reads static files from `public/data/`:

| File | Made by |
|---|---|
| `landings.json`, `summary.json` | `scripts/build_web_data.py` and `python -m touchdown.analysis.compare_published` |
| `site.json`, `index.json`, `replays/` | `python -m touchdown.analysis.export_replays` |
| `pictures/`, `pictures.json` | `python -m touchdown.analysis.render_pictures` (Kaggle notebook 10) |

Without `landings.json` the page shows 1,000 generated sample stars with a visible "sample data" tag. `public/data` is currently ignored by git (the repo-wide `data/` rule); add `!web/public/data/` to `.gitignore` when the real run is exported.

## Notes

- Layout: `src/components/Hero.tsx` (telescope, galaxy, dive), `Reel.tsx` and `Story.tsx` (the seven scenes), `Results.tsx` (tiles), `LandingOverlay.tsx`, `ReplayViewer.tsx`, `PictureView.tsx`, `Galaxy.tsx` (canvas). Constants like scroll phases live at the top of `Hero.tsx`.
- Phones and reduced-motion get a still picture and a static galaxy instead of the scroll zoom; the reel keeps working, with fades instead of wipes.
- Rollup's native binary does not load on Windows on Arm, so `package.json` overrides it with `@rollup/wasm-node`. Builds work the same elsewhere.
- Deployment: `.github/workflows/pages.yml` builds and publishes to GitHub Pages on every push that touches `web/`.
