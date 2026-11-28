# The sample model, built from nothing: the Acme Pod, a small desk device (a shell, a ribbed band, a
# ring of light, a dial that turns). It is what template/models/acme.glb is exported from, so the
# templates, the Studio and the tests have a neutral product to show that is nobody's. It is part of
# Manovella and under its licence (MIT): no model, texture or scan from anywhere else is in it.
#
#   node blender.mjs sample <out.glb>       runs this in Blender, then blender-prepare.py on the result
#
# Every vertex is computed here (profiles turned round the vertical axis), so the same Blender gives the
# same file. Its materials are named for a page to recolour: Shell, Band, Metal, Rubber and Accent, the
# brand's colour (SPACE's model.tint('Accent', C.accent)). One animation, "Dial": the dial turns a third
# of a turn in 1.5 s. Blender's Z is up and its front is -Y; glTF's export turns that into Y up, front +Z.
import bpy
from math import cos, pi, radians, sin, tan
from mathutils import Vector

SEG = 72            # steps round the axis: a silhouette of 72 sides reads as round at any size a film shows
FPS = 30


def lin(c):         # an sRGB byte triple as Blender's linear colour
    return tuple(((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c) + (1.0,)


def material(name, rgb, rough, metal=0.0, glow=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = lin(rgb)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if glow:
        p.inputs['Emission Color'].default_value = lin(rgb)
        p.inputs['Emission Strength'].default_value = glow
    m.diffuse_color = lin(rgb)
    return m


def fillet(points, radii, steps=5):
    """The profile with the corners named in radii ({index: radius}) rounded by an arc of `steps` parts."""
    out = [points[0]]
    for i in range(1, len(points) - 1):
        r = radii.get(i, 0)
        if not r:
            out.append(points[i])
            continue
        p = Vector(points[i])
        a = (Vector(points[i - 1]) - p).normalized()
        b = (Vector(points[i + 1]) - p).normalized()
        half = a.angle(b) / 2
        c = p + (a + b).normalized() * (r / sin(half))
        v0, v1 = p + a * (r / tan(half)) - c, p + b * (r / tan(half)) - c
        turn = v0.angle(v1) * (1 if v0.x * v1.y - v0.y * v1.x > 0 else -1)
        for s in range(steps + 1):
            t = turn * s / steps
            out.append((c.x + v0.x * cos(t) - v0.y * sin(t), c.y + v0.x * sin(t) + v0.y * cos(t)))
    out.append(points[-1])
    return out


def lathe(name, profile, mat, parent, seg=SEG, flute=None, sharp=38):
    """A mesh from a profile of (radius, height) points turned round Z. A point on the axis is one vertex.
    Traced outward along the bottom, up the side and inward along the top, its faces look outward.
    flute = (count, depth): the radius swells in `count` ribs round the axis, for a ribbed side."""
    verts, faces, ring = [], [], []
    for (r, z) in profile:
        if r < 1e-9:
            ring.append([len(verts)] * seg)
            verts.append((0.0, 0.0, z))
            continue
        row = []
        for i in range(seg):
            a = 2 * pi * i / seg
            k = r + (flute[1] * (0.5 + 0.5 * cos(flute[0] * a)) if flute else 0)
            row.append(len(verts))
            verts.append((k * cos(a), k * sin(a), z))
        ring.append(row)
    for k in range(len(ring) - 1):
        lo, hi = ring[k], ring[k + 1]
        for i in range(seg):
            j = (i + 1) % seg
            f = [lo[i], lo[j], hi[j], hi[i]]
            f = [v for n, v in enumerate(f) if v not in f[:n]]   # on the axis a quad is a triangle
            if len(f) >= 3:
                faces.append(f)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    if sharp:
        me.set_sharp_from_angle(angle=radians(sharp))   # the fillets shade round, a step stays a step
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    return ob


def build():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, 1 + int(1.5 * FPS)

    shell = material('Shell', (226, 224, 219), 0.52)
    band = material('Band', (58, 60, 68), 0.92)
    metal = material('Metal', (205, 207, 212), 0.3, metal=1.0)
    rubber = material('Rubber', (24, 24, 28), 0.85)
    accent = material('Accent', (91, 91, 247), 0.35, glow=0.5)

    root = bpy.data.objects.new('Acme Pod', None)
    scene.collection.objects.link(root)

    lathe('Foot', fillet([(0, 0), (0.40, 0), (0.40, 0.02), (0.36, 0.02)], {1: 0.008}, 3), rubber, root)
    lathe('Base', fillet([(0, 0.02), (0.47, 0.02), (0.47, 0.15), (0.452, 0.15)], {1: 0.045, 2: 0.006}), shell, root)
    lathe('Band', [(0.452, 0.15), (0.452, 0.45)], band, root, seg=SEG * 8, flute=(SEG, 0.012), sharp=None)
    lathe('Top', fillet([(0.452, 0.45), (0.47, 0.45), (0.47, 0.56), (0.325, 0.56), (0.325, 0.546), (0, 0.546)],
                        {1: 0.006, 2: 0.05, 3: 0.004}), shell, root)
    lathe('Ring', fillet([(0.272, 0.546), (0.272, 0.553), (0.318, 0.553), (0.318, 0.546)], {1: 0.003, 2: 0.003}, 2), accent, root)
    dial = lathe('Dial', fillet([(0, 0.546), (0.262, 0.546), (0.262, 0.606), (0, 0.606)], {1: 0.004, 2: 0.014}), metal, root)
    # the dial's mark, so its turn shows; the origin stays on the axis so it turns with the dial
    mark = lathe('Mark', fillet([(0, 0.606), (0.016, 0.606), (0.016, 0.609), (0, 0.609)], {2: 0.002}, 2), accent, dial, seg=24)
    for v in mark.data.vertices:
        v.co.y -= 0.205
    light = lathe('Light', fillet([(0, 0), (0.013, 0), (0.013, 0.004), (0, 0.004)], {2: 0.003}, 2), accent, root, seg=24)
    light.rotation_euler = (radians(90), 0, 0)   # its axis toward the front
    light.location = (0, -0.4695, 0.085)

    # "Dial": a third of a turn, eased, 1.5 s
    dial.rotation_euler = (0, 0, 0)
    dial.keyframe_insert('rotation_euler', index=2, frame=1)
    dial.rotation_euler = (0, 0, radians(-120))
    dial.keyframe_insert('rotation_euler', index=2, frame=1 + int(1.5 * FPS))
    dial.animation_data.action.name = 'Dial'
    scene.frame_set(1)


build()
