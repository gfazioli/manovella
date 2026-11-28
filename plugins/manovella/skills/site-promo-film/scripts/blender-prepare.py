# A model as a plain GLB a film's page loads: run by blender.mjs prepare (and sample), in Blender,
#
#   blender -b [scene.blend] -P blender-prepare.py -- <args.json>
#
# args: { input (a model to import; none: the scene Blender has open), out, tris, size, texture,
#         static, ground, report }. What it does, in order:
#   1. imports the model (.glb .gltf .fbx .obj .stl .ply .usd .usda .usdc .usdz; a .blend is opened by Blender)
#   2. turns curves, text and surfaces into meshes, and drops what is hidden from the render
#   3. a model that does not move: every mesh with its modifiers and its transform applied, so the file
#      holds plain geometry at the origin. A model that moves (an action, an armature, shape keys) keeps
#      its objects and its animation, under one root that carries the placement (static: true flattens it too)
#   4. centres it on the vertical axis, stands it on the ground (ground: false centres it in height too)
#      and scales its longest side to `size`
#   5. decimates to `tris` triangles in all, each mesh by the same ratio (meshes with shape keys are left)
#   6. materials as glTF's PBR: a Principled BSDF is exported as it is; any other shader becomes one from
#      its colour, roughness and metalness; a surface with no material gets a neutral one. Textures wider
#      or taller than `texture` px are scaled down. What glTF cannot carry (procedural textures) is listed
#   7. exports a GLB: Y up, no cameras, no lights, no compression a loader needs a decoder for
# and writes `report` (JSON): triangles before and after, the size, the notes. blender.mjs reads the GLB
# itself for the rest.
import bpy
import json
import os
import sys
from mathutils import Matrix, Vector

A = json.load(open(sys.argv[sys.argv.index('--') + 1], encoding='utf-8'))
NOTES = []


def note(s):
    if s not in NOTES:
        NOTES.append(s)


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
        raise SystemExit(f'prepare: no importer for {ext} (.blend .glb .gltf .fbx .obj .stl .ply .usd .usda .usdc .usdz)')


def tris_of(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def principled(mat):
    """The material's Principled BSDF when it is what reaches the surface output, else None."""
    if not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'OUTPUT_MATERIAL' and n.is_active_output and n.inputs['Surface'].is_linked:
            src = n.inputs['Surface'].links[0].from_node
            return src if src.type == 'BSDF_PRINCIPLED' else None
    return None


def as_pbr(mat):
    """Any other shader as a Principled BSDF: the colour, roughness and metalness its nodes or its viewport settings give."""
    col, rough, metal, emit = list(mat.diffuse_color), mat.roughness, mat.metallic, None
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type in ('BSDF_DIFFUSE', 'BSDF_GLOSSY', 'BSDF_TOON', 'BSDF_SHEEN', 'BSDF_TRANSLUCENT') and 'Color' in n.inputs:
                col = list(n.inputs['Color'].default_value)
                if 'Roughness' in n.inputs:
                    rough = n.inputs['Roughness'].default_value
                if n.type == 'BSDF_GLOSSY':
                    metal = 1.0
            elif n.type == 'EMISSION':
                emit = (list(n.inputs['Color'].default_value), n.inputs['Strength'].default_value)
        mat.node_tree.nodes.clear()
    if mat.node_tree is None:
        mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    out, p = nodes.new('ShaderNodeOutputMaterial'), nodes.new('ShaderNodeBsdfPrincipled')
    p.inputs['Base Color'].default_value = col
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = emit[0]
        p.inputs['Emission Strength'].default_value = emit[1]
    links.new(p.outputs['BSDF'], out.inputs['Surface'])
    note(f'material "{mat.name}" was not a Principled BSDF: made one from its colour, roughness and metalness')


def materials(objects):
    neutral, seen = None, set()
    for ob in objects:
        me = ob.data
        if not me.materials or all(m is None for m in me.materials):
            if neutral is None:
                neutral = bpy.data.materials.new('Neutral')
                if neutral.node_tree is None:
                    neutral.use_nodes = True
                b = neutral.node_tree.nodes['Principled BSDF']
                b.inputs['Base Color'].default_value = (0.6, 0.6, 0.62, 1)
                b.inputs['Roughness'].default_value = 0.5
                note('a surface had no material: given "Neutral", a mid grey')
            if me.materials:
                for i in range(len(me.materials)):
                    me.materials[i] = neutral
            else:
                me.materials.append(neutral)
        for m in me.materials:
            if m is None or m.name in seen:
                continue
            seen.add(m.name)
            p = principled(m)
            if p is None:
                as_pbr(m)
                continue
            for name in ('Base Color', 'Roughness', 'Metallic', 'Normal', 'Emission Color', 'Alpha'):
                s = p.inputs.get(name)
                if s is None or not s.is_linked:
                    continue
                stack, image, made = [s.links[0].from_node], False, False
                while stack:   # an image behind the input is something glTF carries; a texture computed by a node is not
                    n = stack.pop()
                    image = image or n.type == 'TEX_IMAGE'
                    made = made or (n.type.startswith('TEX_') and n.type != 'TEX_IMAGE')
                    stack += [l.from_node for i in n.inputs for l in i.links]
                if made and not image:
                    note(f'material "{m.name}": its {name} is procedural, which glTF cannot carry (bake it to an image in Blender to keep it)')
    limit = int(A.get('texture') or 0)
    for img in bpy.data.images:
        w, h = img.size
        if limit and img.users and max(w, h) > limit:
            k = limit / max(w, h)
            img.scale(max(1, round(w * k)), max(1, round(h * k)))
            note(f'texture "{img.name}" scaled from {w}x{h} to {img.size[0]}x{img.size[1]}')


def main():
    if A.get('input'):
        import_model(A['input'])
    scene = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    # what the render would show, as meshes
    for ob in list(scene.objects):
        if ob.hide_render or not ob.visible_get():
            if ob.type in ('MESH', 'CURVE', 'SURFACE', 'FONT', 'META'):
                note(f'"{ob.name}" is hidden: left out')
                bpy.data.objects.remove(ob)
    shapes = [ob for ob in scene.objects if ob.type in ('CURVE', 'SURFACE', 'FONT', 'META')]
    if shapes:
        dg = bpy.context.evaluated_depsgraph_get()
        for ob in shapes:
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            new = bpy.data.objects.new(ob.name + ' mesh', me)
            new.matrix_world = ob.matrix_world.copy()
            scene.collection.objects.link(new)
            bpy.data.objects.remove(ob)
    meshes = [ob for ob in scene.objects if ob.type == 'MESH' and len(ob.data.polygons)]
    if not meshes:
        raise SystemExit('prepare: the model has no surface to export (no mesh with faces)')

    moves = any(ob.animation_data and ob.animation_data.action for ob in scene.objects) \
        or any(ob.type == 'ARMATURE' for ob in scene.objects) or any(ob.data.shape_keys for ob in meshes)
    static = bool(A.get('static')) or not moves
    if moves and static:
        note('static: the model\'s animation is dropped, its first frame kept')

    dg = bpy.context.evaluated_depsgraph_get()
    tris_in = 0
    if static:
        flat = []
        for ob in meshes:
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            me.transform(ob.matrix_world)
            if ob.matrix_world.determinant() < 0:
                me.flip_normals()
            me.name = ob.data.name
            tris_in += tris_of(me)
            flat.append((ob.name, me))
        for ob in list(scene.objects):
            bpy.data.objects.remove(ob)
        meshes = []
        for name, me in flat:
            ob = bpy.data.objects.new(name, me)
            scene.collection.objects.link(ob)
            meshes.append(ob)
        root = None
    else:
        root = bpy.data.objects.new(A.get('name') or 'Model', None)
        scene.collection.objects.link(root)
        for ob in [o for o in scene.objects if o.parent is None and o is not root]:
            ob.parent = root
        tris_in = sum(tris_of(ob.evaluated_get(dg).to_mesh()) for ob in meshes)

    # decimate, each mesh by the same ratio, twice at most: collapse lands near its ratio, not on it
    budget, tris_out = int(A.get('tris') or 0), tris_in
    for _ in range(2):
        if not budget or tris_out <= budget:
            break
        ratio = budget / tris_out
        for ob in meshes:
            if ob.data.shape_keys:
                note(f'"{ob.name}" has shape keys: not decimated')
                continue
            if tris_of(ob.data) < 64:
                continue
            mod = ob.modifiers.new('budget', 'DECIMATE')
            mod.ratio, mod.use_collapse_triangulate = ratio, True
            if static:
                dg = bpy.context.evaluated_depsgraph_get()
                me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
                ob.modifiers.remove(mod)
                old, ob.data = ob.data, me
                me.name = old.name
                bpy.data.meshes.remove(old)
            else:   # before an armature, so the skin follows the decimated mesh; the export applies it
                while ob.modifiers.find('budget') > 0:
                    ob.modifiers.move(ob.modifiers.find('budget'), 0)
        dg = bpy.context.evaluated_depsgraph_get()
        tris_out = sum(tris_of(ob.data) if static else tris_of(ob.evaluated_get(dg).to_mesh()) for ob in meshes)

    # place it: centred on the vertical axis, on the ground, its longest side `size`
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e30,) * 3), Vector((-1e30,) * 3)
    for ob in meshes:
        ev = ob.evaluated_get(dg)
        for v in ev.to_mesh().vertices:
            w = ev.matrix_world @ v.co
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    dims = hi - lo
    k = (float(A.get('size') or 1) / max(dims)) if max(dims) > 0 else 1
    centre = (lo + hi) / 2
    if A.get('ground', True):
        centre.z = lo.z
    place = Matrix.Scale(k, 4) @ Matrix.Translation(-centre)
    if static:
        for ob in meshes:
            ob.data.transform(place)
    else:
        root.matrix_world = place
    materials(meshes)

    bpy.ops.export_scene.gltf(
        filepath=A['out'], export_format='GLB', check_existing=False, export_yup=True,
        export_apply=not static and not any(ob.data.shape_keys for ob in meshes),
        export_cameras=False, export_lights=False, export_extras=False,
        export_materials='EXPORT', export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=False,
        export_animations=not static, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_optimize_animation_size=True, export_anim_slide_to_zero=True, export_skins=True, export_morph=True)
    with open(A['report'], 'w', encoding='utf-8') as f:
        json.dump({'static': static, 'tris_in': tris_in, 'tris_out': tris_out, 'objects': len(meshes),
                   'size': [round(v * k, 5) for v in (dims.x, dims.z, dims.y)],   # as glTF has it: x, up, depth
                   'notes': NOTES, 'blender': bpy.app.version_string}, f)


main()
