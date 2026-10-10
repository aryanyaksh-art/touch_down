import numpy as np
import pytest

pytest.importorskip("PIL")

from touchdown.analysis.render_pictures import decision_pose


def test_decision_pose_looks_straight_down_above_the_predicted_contact():
    res = {"contact_pred": [1.5, -2.0], "decision_alt_est": 5.1, "sun_az": 90.0, "sun_el": 30.0}
    pos, R, sun = decision_pose(res)
    assert np.allclose(pos, [1.5, -2.0, 5.1])
    # nadir attitude: the camera boresight (+z) maps to local -z
    assert np.allclose(R @ np.array([0, 0, 1.0]), [0, 0, -1.0], atol=1e-9)
    # sun is a unit vector, 30 degrees above the horizon, due east
    assert np.isclose(np.linalg.norm(sun), 1.0)
    assert np.isclose(sun[2], np.sin(np.radians(30.0)))
    assert sun[0] > 0.8 and abs(sun[1]) < 1e-9
