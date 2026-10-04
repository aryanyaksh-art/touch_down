import numpy as np
from scipy import ndimage

from touchdown.nav.correlate import match_template, ncc_map, render_template
from touchdown.nav.heightfield import HeightField
from touchdown.render.camera import Camera, look_at


def textured(n=200, seed=0):
    rng = np.random.default_rng(seed)
    return ndimage.gaussian_filter(rng.standard_normal((n, n)), 2.0)


def test_ncc_finds_integer_shift_exactly():
    img = textured()
    tpl = img[80:113, 90:123]                 # 33x33 cut from known location
    center_uv = np.array([90 + 16 + 0.5, 80 + 16 + 0.5])
    # pretend the prediction was off by (+5, -3): the template center is predicted at (+5, -3) from the truth
    pred = center_uv + np.array([5.0, -3.0])
    m = match_template(img, tpl, pred, search=12)
    assert abs(m.du - (-5.0)) < 0.05 and abs(m.dv - 3.0) < 0.05 and m.peak > 0.99


def test_subpixel_shift_recovered():
    base = textured(260, seed=1)
    shift = (0.4, -0.3)  # (dx, dy) pixels
    img = ndimage.shift(base, (shift[1], shift[0]), order=3, mode="nearest")
    tpl = base[100:133, 100:133]
    center = np.array([100 + 16 + 0.5, 100 + 16 + 0.5])
    m = match_template(img, tpl, center, search=8)
    assert abs(m.du - shift[0]) < 0.08 and abs(m.dv - shift[1]) < 0.08


def test_ncc_is_gain_and_offset_invariant():
    img = textured()
    tpl = img[80:113, 90:123]
    a = ncc_map(img, tpl)
    b = ncc_map(3.0 * img + 7.0, tpl)
    assert np.allclose(a, b, atol=1e-6)


def test_render_template_consistent_with_projection():
    # a tilted-plane terrain with texture: template centre pixel must show the landmark's own surface point
    res, n = 0.25, 200
    x = (np.arange(n) + 0.5 - n / 2) * res
    z = 0.2 * np.sin(x[None, :] / 2.0) + 0.1 * np.cos(x[:, None] / 1.5)
    hf = HeightField(z, res)
    cam = Camera(640, 480, 44.0)
    pos = np.array([0.0, 0.0, 20.0])
    R = look_at(pos, np.array([0.0, 0.0, 0.0]))
    lm = np.array([2.0, 1.0, hf.height(np.array([2.0]), np.array([1.0]))[0]])
    p_cam = R.T @ (lm - pos)
    uv = cam.project(p_cam[None])[0]
    sun = np.array([0.3, 0.2, 0.93])
    sun /= np.linalg.norm(sun)
    t = render_template(hf, cam, pos, R, sun, uv, half=16, landmark=lm)
    assert t is not None and t.shape == (33, 33) and np.isfinite(t).all()
    # template must match the same render from the same pose at +2 px => correlation peak at +2 px offset
    big = render_template(hf, cam, pos, R, sun, uv, half=40, landmark=lm)
    m = match_template(big, t, np.array([40 + 0.5, 40 + 0.5]) + np.array([2.0, 1.0]), search=6)
    assert abs(m.du + 2.0) < 0.1 and abs(m.dv + 1.0) < 0.1
