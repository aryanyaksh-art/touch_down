import numpy as np

from touchdown.dataset.generate import sample_pose, sun_vector, to_image


def test_sample_pose_geometry_and_bounds():
    rng = np.random.default_rng(0)
    for _ in range(200):
        pos, R, meta = sample_pose(rng, (48.0, 48.0))
        assert 4.0 <= meta["alt_m"] <= 45.0 and 0 <= meta["tilt_deg"] <= 15.0
        assert np.allclose(R.T @ R, np.eye(3), atol=1e-9) and np.isclose(np.linalg.det(R), 1.0)
        tx, ty = meta["target"]
        assert abs(tx) <= 24.0 and abs(ty) <= 24.0
        # boresight points at the target (on the z=0 plane)
        t = -pos[2] / R[2, 2]
        hit = pos + t * R[:, 2]
        assert np.allclose(hit[:2], meta["target"], atol=1e-6)
        # distance to the target equals the sampled altitude
        assert np.isclose(np.linalg.norm(hit - pos), meta["alt_m"], rtol=1e-6)


def test_sun_vector_unit_and_elevation():
    s = sun_vector(90.0, 30.0)
    assert np.isclose(np.linalg.norm(s), 1.0)
    assert np.isclose(s[2], 0.5) and s[0] > 0.8  # azimuth 90 = east


def test_to_image_dtype_range_and_noise():
    rng = np.random.default_rng(1)
    rgb = np.random.default_rng(2).random((48, 64, 3)).astype(np.float32) * 0.04
    img = to_image(rgb, rng)
    assert img.dtype == np.uint8 and img.shape == (48, 64)
    assert img.max() > 150  # auto-exposure brings dark radiance into range


def test_sample_pose_x_side_keeps_target_on_one_half():
    rng = np.random.default_rng(2)
    for side in (+1, -1):
        for _ in range(100):
            _, _, meta = sample_pose(rng, (48.0, 48.0), alt_range=(4.0, 22.0), x_side=side)
            assert side * meta["target"][0] >= 0.0
