# Replay website

Vite + React + TypeScript. Replays a simulated landing: the camera frame with hazard labels and landmark matches, a top-down map with the true and estimated paths, altitude and error plots, and the land or back-away decision. A results section shows the Monte Carlo statistics against the published figures.

```bash
cd web
npm install
npm run dev      # local preview
npm run build    # production build into web/dist
```

The page reads static files from `public/data/`, produced by:

```bash
python -m touchdown.analysis.export_replays --out web/public/data --mc <monte-carlo-dir> [--checkpoint best.pt]
```

Until that has been run, the site shows a "no replays yet" message.

Notes
- Rollup's native binary does not load on Windows on Arm, so `package.json` overrides it with `@rollup/wasm-node`. Builds work the same elsewhere.
- Deployment: `.github/workflows/pages.yml` builds and publishes to GitHub Pages. Pages must be enabled in the repository settings (source: GitHub Actions).
