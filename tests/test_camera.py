import numpy as np

from touchdown.render.camera import Camera, look_at


def test_project_unproject_roundtrip():
    cam = Camera(640, 480, 44.0)
    uv = np.array([[100.0, 50.0], [320.0, 240.0], [600.0, 400.0]])
    rays = cam.unproject(uv)
    back = cam.project(rays * 37.0)
    assert np.allclose(back, uv, atol=1e-9)


def test_principal_point_is_boresight():
    cam = Camera()
    assert np.allclose(cam.unproject(np.array([[320.0, 240.0]])), [[0, 0, 1]])


def test_hfov_matches_edge_ray():
    cam = Camera(640, 480, 44.0)
    ray = cam.unproject(np.array([[640.0, 240.0]]))[0]
    assert np.isclose(np.degrees(np.arctan2(ray[0], ray[2])), 22.0)


def test_look_at_axes_orthonormal_and_forward():
    R = look_at([0, 0, 100], [0, 0, 0])  # nadir
    assert np.allclose(R.T @ R, np.eye(3), atol=1e-12)
    assert np.allclose(R[:, 2], [0, 0, -1])
    assert np.isclose(np.linalg.det(R), 1.0)
    R2 = look_at([0, -50, 80], [0, 0, 0])  # oblique, north-up
    assert np.allclose(R2.T @ R2, np.eye(3), atol=1e-12)
    assert R2[1, 1] < 0 
