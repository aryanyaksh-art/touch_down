"""Runs INSIDE Blender (5.2): blender -b -P blender_worker.py -- --dtm site.npz [--samples N]

Self-contained (does not import touchdown). Builds the DTM as a mesh once, then serves render requests read as
JSON lines on stdin. For each request it writes <out>.npz with
  rgb  (h,w,3) float16  scene-linear radiance of a Lambertian surface lit by a sun (raw, not exposed)
  pos  (h,w,3) float32  local-frame position of the surface under each pixel, NaN where the ray misses
and answers with a line '@@RESULT {"id":..., "out":...}' on stdout.

Request keys: id, out, cam_pos [x,y,z], R (3x3 local_from_cam, OpenCV axes), hfov_deg, w, h,
  sun_dir [x,y,z] (unit vector from the surface TOWARD the sun), samples, albedo, sun_strength.
"""
import json
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

POS_OFFSET = 50.0  # keeps emission colours positive; subtracted on readback


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = {"dtm": None, "samples": 32, "device": "CPU"}
    i = 0
    while i < len(argv):
        if argv[i] == "--dtm":
            a["dtm"] = argv[i + 1]
            i += 2
        elif argv[i] == "--device":
            a["device"] = argv[i + 1]
            i += 2
        elif argv[i] == "--samples":
            a["samples"] = int(argv[i + 1])
            i += 2
        else:
            i += 1
    return a


def build_terrain(z, res):
    ny, nx = z.shape
    xs = (np.arange(nx) + 0.5 - nx / 2.0) * res
    ys = (np.arange(ny) + 0.5 - ny / 2.0) * res
    X, Y = np.meshgrid(xs, ys)
    co = np.stack([X, Y, z.astype(np.float64)], axis=-1).reshape(-1, 3).astype(np.float32)
    idx = np.arange(ny * nx).reshape(ny, nx)
    quads = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], axis=-1).reshape(-1, 4)
    mesh = bpy.data.meshes.new("terrain")
    mesh.vertices.add(len(co))
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set("vertex_index", quads.ravel().astype(np.int32))
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new("terrain", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def make_beauty_material(albedo):
    m = bpy.data.materials.new("beauty")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfDiffuse")
    bsdf.name = "diffuse"
    bsdf.inputs["Color"].default_value = (albedo, albedo, albedo, 1.0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


def make_position_material():
    m = bpy.data.materials.new("position")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    add = nt.nodes.new("ShaderNodeVectorMath")
    add.operation = "ADD"
    add.inputs[1].default_value = (POS_OFFSET, POS_OFFSET, POS_OFFSET)
    nt.links.new(geo.outputs["Position"], add.inputs[0])
    nt.links.new(add.outputs["Vector"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return m


def setup_device(scene, device):
    """CPU, or GPU via OptiX/CUDA (Colab/Kaggle). Falls back to CPU if no GPU is usable."""
    scene.cycles.device = "CPU"
    if device.upper() != "GPU":
        return "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
        except Exception:
            continue
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = d.type != "CPU"
            scene.cycles.device = "GPU"
            return kind
    return "CPU"


def render_to_array(scene, w, h, path):
    """Render, write a float EXR (scene-linear, no colour transform), read it back. Render Result.pixels is
    empty in background mode, so the file round trip is the reliable route."""
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = "Non-Color"
    arr = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)[::-1]  # Blender stores the bottom row first


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    d = np.load(args["dtm"])
    terrain = build_terrain(d["z"], float(d["res_m"]))

    scene.render.engine = "CYCLES"
    print("@@DEVICE " + setup_device(scene, args["device"]), flush=True)
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("w")
    world.color = (0, 0, 0)
    scene.world = world

    cam_data = bpy.data.cameras.new("cam")
    cam_data.sensor_fit = "HORIZONTAL"
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.05
    cam_data.clip_end = 2000.0
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)

    mat_beauty, mat_pos = make_beauty_material(0.044), make_position_material()
    terrain.data.materials.append(mat_beauty)
    print("@@READY", flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        if req.get("cmd") == "quit":
            break
        w, h = int(req["w"]), int(req["h"])
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.resolution_percentage = 100
        cam_data.lens = (36.0 / 2.0) / np.tan(np.radians(req["hfov_deg"]) / 2.0)
        R = np.array(req["R"], float)  # columns: cam x (right), y (down), z (forward), in local coordinates
        Rb = np.stack([R[:, 0], -R[:, 1], -R[:, 2]], axis=1)  # Blender camera: x right, y up, looks along -z
        M = np.eye(4)
        M[:3, :3] = Rb
        M[:3, 3] = req["cam_pos"]
        cam.matrix_world = Matrix(M.tolist())
        sd = Vector(req["sun_dir"]).normalized()
        sun.rotation_euler = (-sd).to_track_quat("-Z", "Y").to_euler()  # light travels along -sun_dir
        sun_data.energy = float(req.get("sun_strength", 1.0))

        a = float(req.get("albedo", 0.044))
        mat_beauty.node_tree.nodes["diffuse"].inputs["Color"].default_value = (a, a, a, 1.0)
        terrain.data.materials[0] = mat_beauty
        scene.cycles.samples = int(req.get("samples", args["samples"]))
        scene.cycles.filter_width = 1.5
        beauty = render_to_array(scene, w, h, req["out"] + ".beauty.exr")

        if req.get("want_pos", True):
            terrain.data.materials[0] = mat_pos  # 1 spp + tiny filter = point-sampled at pixel centres
            scene.cycles.samples = 1
            scene.cycles.filter_width = 0.01
            posr = render_to_array(scene, w, h, req["out"] + ".pos.exr")
            pos = posr[..., :3] - POS_OFFSET
            pos[posr[..., 3] < 0.5] = np.nan
        else:  # navigation needs only the lit image; skipping the position pass halves the render cost
            pos = np.full((1, 1, 3), np.nan, np.float32)
        for suffix in (".beauty.exr", ".pos.exr"):
            try:
                import os
                os.remove(req["out"] + suffix)
            except OSError:
                pass
        np.savez_compressed(req["out"], rgb=beauty[..., :3].astype(np.float16), pos=pos.astype(np.float32))
        print("@@RESULT " + json.dumps({"id": req["id"], "out": req["out"]}), flush=True)


main()
