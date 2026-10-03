"""Download the NASA SVS Bennu models into the data directory (outside the repo). Usage: uv run python scripts/fetch_data.py [--global]"""
import sys
import requests
from touchdown.bennu.paths import data_dir

BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a005000/a005069/"
FILES = {"site": "l_00050mm_alt_ptm_5595n04217_v020.obj",  # Nightingale, 5 cm, ~236 MB
         "global": "g_00880mm_alt_ptm_0000n00000_v020.obj"}  # whole asteroid, 88 cm, ~195 MB

if __name__ == "__main__":
    wanted = ["site"] + (["global"] if "--global" in sys.argv else [])
    for key in wanted:
        out = data_dir() / FILES[key]
        if out.exists():
            print("have", out.name); continue
        print("downloading", FILES[key])
        with requests.get(BASE + FILES[key], stream=True, timeout=60) as r:
            r.raise_for_status()
            with open(out, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    print("data dir:", data_dir())
