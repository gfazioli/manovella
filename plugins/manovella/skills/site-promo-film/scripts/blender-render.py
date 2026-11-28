# A hero shot as a PNG sequence with alpha, a frame a file: run by blender.mjs render, in Blender,
#
#   blender -b [scene.blend] -P blender-render.py -t <threads> -- <args.json>
#
# args: { input (a model to import and light; none: the .blend Blender has open, with its own camera,
#         lights and animation), out, frames [first, last], fps, size [w, h], engine, samples, seed,
#         shutter (degrees), position (START | CENTER | END), pose { yaw, pitch, dist, fov }, turntable
#         (seconds a turn), tint { material: [r, g, b] }, opaque, gpu, resume, hold, report }
#
# A model that is not a .blend gets a stage made here: a camera on the orbit the page's SPACE.orbit
# uses (yaw and pitch in degrees, dist in the model's longest sides, a vertical field of view), the
# studio light Blender ships (its own studio.exr, CC0) with one soft key from the upper left, a ground
# that only catches the shadow, and a turntable. The picture is rendered on a clear background, in the
# Khronos PBR Neutral view, which keeps a brand's colours (three.js's NeutralToneMapping is the same curve).
#
# Reproducible: Cycles on the CPU, `samples` for every pixel (no adaptive sampling), a seed per frame
# (seed + frame), OpenImageDenoise on the CPU. Motion blur is Blender's own, over the film's shutter:
# shutter/360 of a frame, opening on the frame's moment (START) as render.mjs's subframes do.
# Between frames it waits while the `hold` file exists: blender.mjs's thermal governor writes it.
import bpy
import json
import os
import sys
import time
from math import cos, pi, radians, sin
from mathutils import Vector

A = json.load(open(sys.argv[sys.argv.index('--') + 1], encoding='utf-8'))


def say(**kw):
    print('MANOVELLA ' + json.dumps(kw), flush=True)


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == '.stl':
        bpy.ops.wm.stl_import(filepath=path)
    elif ext == '.ply':
        bpy.ops.wm.ply_import(filepath=path)
    elif ext in ('.usd', '.usda', '.usdc', '.usdz'):
        bpy.ops.wm.usd_import(filepath=path)
    else:
        raise SystemExit(f'render: no importer for {ext} (.blend .glb .gltf .fbx .obj .stl .ply .usd .usda .usdc .usdz)')


def fcurves_of(ob):
    """An object's animation curves: Blender 4.4 and later keep them per slot, earlier ones on the action."""
    act = ob.animation_data.action
    if hasattr(act, 'fcurves'):
        return list(act.fcurves)
    from bpy_extras import anim_utils
    return list(anim_utils.action_get_channelbag_for_slot(act, ob.animation_data.action_slot).fcurves)


def stage(scene, first, fps):
    """A camera, a light, a ground and a turntable round the imported model."""
    meshes = [ob for ob in scene.objects if ob.type == 'MESH']
    if not meshes:
        raise SystemExit('render: the model has no mesh')
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e30,) * 3), Vector((-1e30,) * 3)
    for ob in meshes:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    side = max(hi - lo)
    centre = (lo + hi) / 2
    turn = bpy.data.objects.new('Turntable', None)
    turn.location = (centre.x, centre.y, lo.z)
    scene.collection.objects.link(turn)
    dg.update()
    for ob in [o for o in scene.objects if o.parent is None and o is not turn]:
        world = ob.matrix_world.copy()
        ob.parent = turn
        ob.matrix_world = world
    T = float(A.get('turntable') or 0)
    if T > 0:
        turn.rotation_euler = (0, 0, 0)
        turn.keyframe_insert('rotation_euler', index=2, frame=first)
        turn.rotation_euler = (0, 0, 2 * pi)
        turn.keyframe_insert('rotation_euler', index=2, frame=first + T * fps)
        for fc in fcurves_of(turn):
            fc.extrapolation = 'LINEAR'
            for k in fc.keyframe_points:
                k.interpolation = 'LINEAR'

    P = {'yaw': 28, 'pitch': 14, 'dist': 2.9, 'fov': 30, **(A.get('pose') or {})}
    yaw, pitch = radians(P['yaw']), radians(P['pitch'])
    cam = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.angle = radians(P['fov'])
    cam.data.clip_start, cam.data.clip_end = side * 0.01, side * 100
    cam.location = centre + side * P['dist'] * Vector((sin(yaw) * cos(pitch), -cos(yaw) * cos(pitch), sin(pitch)))
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam

    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    exr = os.path.join(bpy.utils.system_resource('DATAFILES'), 'studiolights', 'world', 'studio.exr')
    if os.path.exists(exr):
        env = world.node_tree.nodes.new('ShaderNodeTexEnvironment')
        env.image = bpy.data.images.load(exr)
        world.node_tree.links.new(env.outputs['Color'], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 0.45   # the room: reflections and fill; the key below draws the one shadow
    else:   # a Blender without its studio lights: an even grey sky
        bg.inputs['Color'].default_value = (0.5, 0.5, 0.52, 1)
    scene.world = world
    key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'AREA'))
    key.data.size = side * 2.2
    key.data.energy = 340 * side * side
    key.location = centre + side * Vector((-2.2, -1.6, 2.6))
    key.rotation_euler = (centre - key.location).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(key)
    if scene.render.engine == 'CYCLES':   # the ground shows only the shadow it catches
        me = bpy.data.meshes.new('Ground')
        r = side * 30
        me.from_pydata([(-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new('Ground', me)
        ground.location = (centre.x, centre.y, lo.z)
        ground.is_shadow_catcher = True
        scene.collection.objects.link(ground)
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'


def main():
    made = bool(A.get('input'))
    if made:
        import_model(A['input'])
    scene = bpy.context.scene
    engine = (A.get('engine') or ('cycles' if made else '')).lower()
    if engine:
        scene.render.engine = {'cycles': 'CYCLES', 'eevee': 'BLENDER_EEVEE'}[engine]
    r = scene.render
    was = r.fps / r.fps_base
    fps = float(A.get('fps') or was)
    first, last = A.get('frames') or [scene.frame_start, scene.frame_end]
    if made:
        r.fps, r.fps_base = round(fps), round(fps) / fps
        stage(scene, first, fps)
    elif abs(fps - was) > 1e-6:   # the scene's animation keeps its length in seconds: its frames are remapped
        r.frame_map_old, r.frame_map_new = 100, max(1, round(100 * fps / was))
        r.fps, r.fps_base = round(fps), round(fps) / fps
        if not A.get('frames'):
            first, last = round(first * fps / was), round(last * fps / was)
    if not scene.camera:
        raise SystemExit('render: the scene has no camera')
    if A.get('size'):
        r.resolution_x, r.resolution_y = A['size']
    r.resolution_percentage = 100
    r.film_transparent = not A.get('opaque')
    shutter = float(A.get('shutter', 360))
    r.use_motion_blur = shutter > 0
    r.motion_blur_shutter = shutter / 360
    r.motion_blur_position = A.get('position') or 'START'
    samples, seed, device = int(A.get('samples') or 64), int(A.get('seed') or 1), 'CPU'
    if scene.render.engine == 'CYCLES':
        c = scene.cycles
        c.device = 'CPU'
        if A.get('gpu'):   # a GPU Cycles can use: with factory settings none is switched on, and 'GPU' alone renders on the CPU
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in (['METAL'] if sys.platform == 'darwin' else ['OPTIX', 'CUDA', 'HIP', 'ONEAPI']):
                try:
                    prefs.compute_device_type = kind
                except TypeError:
                    continue
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == kind
                    c.device, device = 'GPU', kind
                    break
            else:
                say(note='--gpu: Cycles finds no GPU it can use here: rendered on the CPU')
        c.samples, c.use_adaptive_sampling = samples, False
        c.use_denoising, c.denoiser, c.denoising_use_gpu = True, 'OPENIMAGEDENOISE', False
        c.use_animated_seed = False
    else:
        device = 'GPU'
        scene.eevee.taa_render_samples = samples
        scene.eevee.motion_blur_steps = 8
    for name, rgb in (A.get('tint') or {}).items():
        m = bpy.data.materials.get(name)
        p = m and m.node_tree and m.node_tree.nodes.get('Principled BSDF')
        if not p:
            raise SystemExit(f'render: no material "{name}" with a Principled BSDF to tint ({", ".join(x.name for x in bpy.data.materials)})')
        lin = [((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in rgb] + [1.0]
        p.inputs['Base Color'].default_value = lin
        p.inputs['Emission Color'].default_value = lin
    r.use_persistent_data = True
    im = r.image_settings
    if hasattr(im, 'media_type'):
        im.media_type = 'IMAGE'
    im.file_format, im.color_mode, im.color_depth, im.compression = 'PNG', 'RGBA', '8', 30
    r.use_file_extension = True
    # no date, host or file name written into the PNGs (blender.mjs takes out what Cycles still writes,
    # its render times): the same frame is then the same file, and carries nothing of where it was made
    for name in dir(r):
        if name.startswith('use_stamp'):
            setattr(r, name, False)

    os.makedirs(A['out'], exist_ok=True)
    took = []
    for f in range(int(first), int(last) + 1):
        path = os.path.join(A['out'], f'{f - int(first) + 1:04d}.png')
        if A.get('resume') and os.path.exists(path):
            say(frame=f, reused=True)
            continue
        while A.get('hold') and os.path.exists(A['hold']):
            time.sleep(0.5)
        t0 = time.time()
        scene.frame_set(f)
        if scene.render.engine == 'CYCLES':
            scene.cycles.seed = (seed + f) % 2147483647
        r.filepath = path
        bpy.ops.render.render(write_still=True)
        took.append(time.time() - t0)
        say(frame=f, seconds=round(took[-1], 2), file=path)
    with open(A['report'], 'w', encoding='utf-8') as fh:
        json.dump({'frames': int(last) - int(first) + 1, 'first': int(first), 'fps': fps, 'size': [r.resolution_x, r.resolution_y],
                   'engine': scene.render.engine, 'device': device, 'samples': samples, 'seed': seed, 'shutter': shutter,
                   'position': r.motion_blur_position, 'transparent': r.film_transparent,
                   'view': scene.view_settings.view_transform, 'seconds': [round(x, 2) for x in took],
                   'blender': bpy.app.version_string}, fh)


main()
