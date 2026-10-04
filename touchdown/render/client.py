"""Talk to a persistent headless Blender worker (touchdown/render/blender_worker.py)."""
import glob
import json
import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from touchdown.bennu.dtm import DTM
from touchdown.bennu.paths import data_dir
from touchdown.render.camera import Camera

WORKER = Path(__file__).with_name("blender_worker.py")


def find_blender() -> str:
    env = os.environ.get("TOUCHDOWN_BLENDER")
    if env:
        return env
    hits = glob.glob(str(data_dir() / "blender" / "*" / "blender.exe")) + \
        glob.glob(str(data_dir() / "blender" / "*" / "blender"))
    if hits:
        return hits[0]
    on_path = shutil.which("blender")
    if on_path:
        return on_path
    raise FileNotFoundError("Blender not found; set TOUCHDOWN_BLENDER")


class BlenderRenderer:
    """Renders frames of one DTM. Use as a context manager; the Blender process stays alive between frames."""

    def __init__(self, dtm_path: str | Path, samples: int = 32, blender: str | None = None):
        self.dtm = DTM.load(dtm_path)
        self.tmp = Path(tempfile.mkdtemp(prefix="td_render_"))
        exe = blender or find_blender()
        args = ["-b", "--factory-startup", "-P", WORKER.as_posix(), "--",
                "--dtm", Path(dtm_path).as_posix(), "--samples", str(samples)]
        if os.name == "nt":
            # Quirk on this Windows-on-Arm laptop: CreateProcess from Python fails with a side-by-side error for
            # Blender's exe, but the same exe starts fine through Git Bash. Launch via bash there.
            line = "cd " + shlex.quote(Path(exe).parent.as_posix()) + " && ./" + Path(exe).name + " " +                 " ".join(shlex.quote(a) for a in args)
            cmd = [shutil.which("bash") or "bash", "-c", line]
        else:
            cmd = [exe] + args
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                     text=True, bufsize=1)
        self._log: list[str] = []
        self._wait_for("@@READY")
        self._n = 0

    def _wait_for(self, prefix: str) -> str:
        for line in self.proc.stdout:
            if line.startswith(prefix):
                return line
            self._log.append(line)
        raise RuntimeError("Blender exited:\n" + "".join(self._log[-30:]))

    def render(self, cam: Camera, cam_pos, R_local_from_cam, sun_dir, albedo: float = 0.044,
               sun_strength: float = 1.0, samples: int | None = None) -> dict:
        """Returns {'rgb': (h,w,3) float32 linear, 'pos': (h,w,3) float32 local xyz (NaN = no surface)}."""
        self._n += 1
        out = self.tmp / f"f{self._n}.npz"
        req = {"id": self._n, "out": str(out), "cam_pos": list(map(float, cam_pos)),
               "R": np.asarray(R_local_from_cam).tolist(), "hfov_deg": cam.hfov_deg, "w": cam.width, "h": cam.height,
               "sun_dir": list(map(float, sun_dir)), "albedo": albedo, "sun_strength": sun_strength}
        if samples:
            req["samples"] = samples
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        self._wait_for("@@RESULT")
        with np.load(out) as d:
            frame = {"rgb": d["rgb"].astype(np.float32), "pos": d["pos"]}
        out.unlink()
        return frame

    def close(self):
        try:
            self.proc.stdin.write(json.dumps({"cmd": "quit"}) + "\n")
            self.proc.stdin.flush()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
