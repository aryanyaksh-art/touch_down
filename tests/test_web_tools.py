import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _landing(seed, **kw):
    r = {"seed": seed, "delivery_error_m": 0.3, "unsafe_contact": False, "contact_true": [0.1, -0.2],
         "clearance_at_contact_m": 1.0, "log": [{"t": 0}],
         "abort": {"complete_baseline": False, "stale_baseline": False, "complete_nn": False, "stale_nn": False},
         "p_hazard": {"complete_baseline": 0.0, "stale_baseline": 0.0, "complete_nn": 0.0, "stale_nn": 0.0}}
    r.update(kw)
    return r


def _write(d: Path, rows):
    for r in rows:
        (d / f"landing_{r['seed']:05d}.json").write_text(json.dumps(r))


def test_pick_covers_each_outcome_and_skips_frame_logs(tmp_path):
    pick = _load("pick_replay_seeds")
    rows = [
        _landing(0),
        _landing(1, unsafe_contact=True, abort={"complete_baseline": True, "stale_baseline": True, "complete_nn": True, "stale_nn": True},
                 p_hazard={"complete_baseline": 0.9, "stale_baseline": 0.9, "complete_nn": 0.9, "stale_nn": 0.9}),
        _landing(2, unsafe_contact=True, abort={"complete_baseline": False, "stale_baseline": False, "complete_nn": False, "stale_nn": True},
                 p_hazard={"complete_baseline": 0.0, "stale_baseline": 0.0, "complete_nn": 0.0, "stale_nn": 0.6}),
        _landing(3, unsafe_contact=True, clearance_at_contact_m=0.05),
        _landing(4, abort={"complete_baseline": False, "stale_baseline": False, "complete_nn": False, "stale_nn": True},
                 p_hazard={"complete_baseline": 0.0, "stale_baseline": 0.0, "complete_nn": 0.0, "stale_nn": 0.4}),
        _landing(5), _landing(6),
    ]
    _write(tmp_path, rows)
    R = pick.load(str(tmp_path))
    assert all("log" not in r for r in R)
    labels = {label: seed for seed, label in pick.pick(R, n_typical=2)}
    assert labels["Clean touchdown"] == 0
    assert labels["Justified back-away"] == 1
    assert labels["Detector catches a missed boulder"] == 2
    assert labels["Missed hazard"] == 3
    assert labels["Needless back-away by the detector"] == 4


def test_build_web_data_writes_small_records(tmp_path):
    src, out = tmp_path / "mc", tmp_path / "web"
    src.mkdir()
    _write(src, [_landing(i) for i in range(3)])
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_web_data.py"), str(src), "--out", str(out)], check=True,
                   capture_output=True)
    rows = json.loads((out / "landings.json").read_text())
    assert [r["seed"] for r in rows] == [0, 1, 2]
    assert set(rows[0]) == {"seed", "delivery_error_m", "unsafe_contact", "contact_true", "abort"}
