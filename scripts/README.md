# Scripts

Run from the repo root with `uv run python scripts/<name>.py`.

**Setup**

| Script | Purpose |
|---|---|
| `fetch_data.py` | Download NASA's Bennu models (`--global` adds the whole-asteroid model) into the data directory outside the repo |
| `build_dtm.py` | Turn the 5 cm Nightingale mesh into a cropped 5 cm height grid |
| `colab_setup.sh` | Rebuild a fresh Colab runtime in one command (Blender, code, data) |

**Figures and checks**

| Script | Purpose |
|---|---|
| `make_figures.py` | The Nightingale terrain and hazard figure |
| `render_demo.py` | Render frames at several altitudes, overlay labels, and verify that rendered 3D positions lie on their camera rays |
| `synthetic_check.py` | Compare a synthetic training terrain with the real tile |
| `inspect_site.py` | Hazard fractions and boulder size statistics for the real tile |

**Navigation and landing demos**

| Script | Purpose |
|---|---|
| `nft_openloop.py` | A prescribed descent over the real tile to test the navigation filter |
| `fly_demo.py` | Fly a few full closed-loop landings with Blender frames |

**Performance**

| Script | Purpose |
|---|---|
| `bench_render.py` | Time the renderer (Blender-side vs. round trip) |
| `profile_flight.py` | Profile one landing to see where the Python-side time goes |
