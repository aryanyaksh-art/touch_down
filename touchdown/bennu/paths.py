"""Where large data lives. Kept outside the OneDrive-synced repo folder."""
import os
from pathlib import Path


def data_dir() -> Path:
    env = os.environ.get("TOUCHDOWN_DATA")
    if env:
        p = Path(env)
    else:
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
        p = Path(base) / "TouchDown" / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


SITE_OBJ = "l_00050mm_alt_ptm_5595n04217_v020.obj"  # NASA SVS Nightingale 5 cm tile, coordinates in km
