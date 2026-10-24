"""
Footwear, headwear and accessories, all built around the rest-pose body (see tailor.py):
sneakers and sandals with real soles, a fila, a backpack, bags, a watch, a necklace and earrings.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

import fabrics
import looks
import mhbody
import tailor as T

# ----------------------------------------------------------------------------- helpers


def rigid(ob, h, bone):
    looks.rigid_on_bone(ob, h, bone)
    return ob


def catmull(points, per=8):
    """A smooth curve through control points (Catmull-Rom)."""
    P = [np.asarray(p, float) for p in points]
    P = [P[0]] + P + [P[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return np.array(out)


def lateral(path, surface):
    """Directions across a strap running along `path` on a surface: perpendicular to both the path and the
    surface normal, so the strap lies flat."""
    tree = T.surface_tree(surface)
    t = np.gradient(path, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    nrm = np.array([tree.find_nearest(Vector(p))[1][:] for p in path])
    side = np.cross(t, nrm)
    return side / np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)


def rounded_box(name, centre, size, material, bevel=0.015, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=tuple(centre))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = size
    if rot is not None:
        ob.rotation_euler = rot
    bpy.context.view_layer.update()
    me = ob.data
    for v in me.vertices:
        v.co = ob.matrix_world @ v.co
    ob.matrix_world = Matrix.Identity(4)
    bv = ob.modifiers.new('Bevel', 'BEVEL'); bv.width = bevel; bv.segments = 4
    T._apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.materials.append(material)
    return ob


def to_rest(ob, arm, bone):
    """An object modelled while the armature is posed: move it to where it sits in the rest pose on `bone`."""
    bpy.context.view_layer.update()
    m = arm.data.bones[bone].matrix_local @ arm.pose.bones[bone].matrix.inverted()
    for v in ob.data.vertices:
        v.co = m @ v.co


# ----------------------------------------------------------------------------- footwear


def _foot(B, side):
    sel = B.mask({f'foot_{side}', f'ball_{side}'}) | (B.mask({f'calf_{side}'}) & (B.co[:, 2] < B.ankle + 0.01))
    pts = B.co[sel]
    heel = np.array([np.median(pts[:, 0]), pts[:, 1].max(), B.floor + 0.045])
    toe = np.array([np.median(pts[pts[:, 1] < pts[:, 1].min() + 0.03][:, 0]), pts[:, 1].min(), B.floor + 0.02])
    return sel, pts, heel, toe


def _sole(pts, floor, height, out=0.008, n=48):
    q = pts[:, :2]
    hl = T.hull2d(q)
    c = hl.mean(0)
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    r = T.radial(hl, c, th) + out
    ring = lambda z: np.column_stack([c[0] + r * np.cos(th), c[1] + r * np.sin(th), np.full(n, z)])  # noqa: E731
    return T.tube([ring(floor - 0.004), ring(floor + height * 0.5), ring(floor + height)])


def sneakers(h, B, upper='#f4f3ef', sole='#e6e1d3', accent='#1d8a4e', line='#8d939a'):
    """
    Trainers: a padded upper fitted around the foot with a proper heel collar, a thick cupsole with a contrasting
    sidewall line, a coloured heel tab and side stripe, and a striped lace panel over the instep.
    """
    mats = [fabrics.leather('sneaker-sole', sole, 0.7), fabrics.leather('sneaker-upper', upper, 0.42),
            fabrics.leather('sneaker-accent', accent, 0.4),
            fabrics.cloth('sneaker-laces', '#efede8', 0.8, weave='knit', weave_scale=300, print_fn=fabrics.stripes('#9a9a96', 90, 'Y', 0.7)),
            fabrics.leather('sneaker-line', line, 0.6)]
    out = []
    for side in ('l', 'r'):
        sel, pts, heel, toe = _foot(B, side)
        L = np.linalg.norm(toe - heel)
        rings = T.limb_rings(B, sel, [heel, toe], lambda u, th: 0.008 + 0.003 * (u / L) + 0 * th, start=-0.012, end=L + 0.014, n=40, step=0.008, slab=0.008)
        ob = T.fuse(f'sneaker-{side}', [T.tube(rings), _sole(pts, B.floor, 0.028)], voxel=0.0035, smooth=4)
        fx = np.median(pts[:, 0])

        def collar(y):
            # High around the heel, sloping down to the tongue at the front of the opening.
            return B.ankle + 0.02 - 0.03 * np.clip((heel[1] - 0.03 - y) / 0.07, 0, 1)
        T.cut(ob, lambda P, fx=fx: np.where((np.abs(P[:, 0] - fx) < 0.09) & (P[:, 1] > heel[1] - 0.14), P[:, 2] - collar(P[:, 1]), -1))
        for m in mats:
            ob.data.materials.append(m)
        for p in ob.data.polygons:
            c = p.center
            if c.z < B.floor + 0.026:
                p.material_index = 4 if c.z > B.floor + 0.02 else 0
            elif c.y > heel[1] - 0.03 and c.z > B.floor + 0.04:
                p.material_index = 2                                   # heel tab
            elif abs(c.x - fx) > 0.026 and B.floor + 0.032 < c.z < B.floor + 0.05 and toe[1] + 0.05 < c.y < heel[1] - 0.04:
                p.material_index = 2                                   # side stripe
            elif abs(c.x - fx) < 0.022 and c.z > B.floor + 0.05 and c.y < heel[1] - 0.07:
                p.material_index = 3                                   # laces
            else:
                p.material_index = 1
        T.set_rest(ob)
        T.skin(ob, B, h['armature'], smooth=4)
        out.append(ob)
    return out


def sandals(h, B, color='#3b2416', style='slide', strap_color=None):
    """Sandals: a leather sole with straps over the foot ('slide': one wide band; 'strappy': toe and ankle straps)."""
    mat = fabrics.leather('sandal', color, 0.5)
    smat = fabrics.leather('sandal-strap', strap_color or color, 0.4)
    out = []
    for side in ('l', 'r'):
        sel, pts, heel, toe = _foot(B, side)
        L = np.linalg.norm(toe - heel)
        sole = T.new_object(f'sandal-sole-{side}', *_sole(pts, B.floor, 0.014, out=0.006), material=mat)
        T._apply_modifiers(sole)
        bv = sole.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.003; bv.segments = 2
        T._apply_modifiers(sole)
        T.set_rest(sole); T.skin(sole, B, h['armature'], smooth=2)
        out.append(sole)
        bands = [(0.5, 0.78)] if style == 'slide' else [(0.72, 0.77), (0.86, 0.9)]
        for k, (a, b) in enumerate(bands):
            rings = T.limb_rings(B, sel, [heel, toe], lambda u, th: 0.004 + 0 * th, start=a * L, end=b * L, n=40, step=0.004, slab=0.008)
            verts, faces = T.tube(rings)
            st = T.new_object(f'sandal-strap-{side}{k}', verts, faces, smat)
            T.cut(st, lambda P: B.floor + 0.012 - P[:, 2], pull=False)
            s = st.modifiers.new('Thickness', 'SOLIDIFY'); s.thickness = 0.003
            T.set_rest(st); T.skin(st, B, h['armature'], smooth=2)
            out.append(st)
        if style != 'slide':
            # Ankle strap.
            ch = [B.j[f'calf_{side}'][0], B.j[f'calf_{side}'][1]]
            Lc = np.linalg.norm(ch[1] - ch[0])
            rings = T.limb_rings(B, B.mask({f'calf_{side}'}), ch, lambda u, th: 0.003 + 0 * th, start=Lc - 0.035, end=Lc - 0.025, n=36, step=0.005)
            st = T.new_object(f'sandal-ankle-{side}', *T.tube(rings), material=smat)
            T.set_rest(st); T.skin(st, B, h['armature'], smooth=2)
            out.append(st)
    return out


# ----------------------------------------------------------------------------- headwear and accessories


def fila(h, B, height=0.085, tilt=-7.0, repeats=4):
    """A Yoruba fila worn as a straight-sided patterned cap, tilted slightly back; UV-mapped woven band."""
    c, zmin, zmax, _ = looks.head_frame(h)
    head = B.co[B.bone == 'head']
    zb = zmax - 0.07
    q = head[np.abs(head[:, 2] - zb) < 0.01][:, :2]
    hl = T.hull2d(q); cc = hl.mean(0)
    n = 64
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    r0 = T.radial(hl, cc, th) + 0.007
    rings = []
    for k, z in enumerate(np.linspace(zb, zb + height, 9)):
        s = 1.0 - 0.04 * (k / 8)
        rings.append(np.column_stack([cc[0] + r0 * s * np.cos(th), cc[1] + r0 * s * np.sin(th), np.full(n, z)]))
    top = np.column_stack([cc[0] + r0 * 0.9 * np.cos(th), cc[1] + r0 * 0.9 * np.sin(th), np.full(n, zb + height + 0.008)])
    rings.append(top)
    verts, faces = T.tube(rings)
    ob = T.new_object('fila', verts, faces)
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            if vi >= len(rings) * n:
                uv.data[li].uv = (0.5, 0.95)
                continue
            ring, j = divmod(vi, n)
            u = j / n * repeats
            if poly.vertices[:].count(vi) and j == 0 and any(x % n == n - 1 for x in poly.vertices if x < len(rings) * n):
                u = repeats
            uv.data[li].uv = (u, min(1.0, ring / 8))
    band = fabrics.strip('fila-band', fabrics.fila_tile(), '#1b2350', roughness=0.7)
    topm = fabrics.cloth('fila-top', '#1b2350', 0.85)
    me.materials.append(band); me.materials.append(topm)
    for poly in me.polygons:
        poly.use_smooth = True
        if all(v >= (len(rings) - 1) * n for v in poly.vertices):
            poly.material_index = 1
    pivot = Vector((cc[0], cc[1], zb))
    rot = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(tilt), 4, 'X') @ Matrix.Translation(-pivot)
    for v in me.vertices:
        v.co = rot @ v.co
    sub = ob.modifiers.new('Sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    s = ob.modifiers.new('Thickness', 'SOLIDIFY'); s.thickness = 0.003
    return rigid(ob, h, 'head')


def earrings(h, targets_dir, radius=0.009, color='#d9a441'):
    """Gold hoops at the ear lobes, rigid on the head."""
    out = []
    for side in ('l', 'r'):
        idx, d = mhbody.read_target(os.path.join(targets_dir, f'ears/{side}-ear-lobe-incr.target'))
        lobe = idx[np.argmax(np.linalg.norm(d, axis=1))]
        p = h['body'].data.vertices[h['remap'][int(lobe)]].co
        bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.0013, location=(p[0], p[1], p[2] - radius + 0.002), rotation=(0, math.pi / 2, 0))
        ring = bpy.context.active_object
        ring.data.materials.append(looks.flat_material('gold', color, 0.25, metallic=1.0))
        out.append(rigid(ring, h, 'head'))
    return out


def necklace(h, B, drop=0.035, color='#d9a441'):
    """A fine gold chain around the base of the neck with a small pendant."""
    z = B.neck + 0.005
    q = B.co[B.mask({'neck_01', 'head'}) & (np.abs(B.co[:, 2] - z) < 0.01)][:, :2]
    hl = T.hull2d(q); c = hl.mean(0)
    th = np.linspace(0, 2 * math.pi, 64, endpoint=False)
    r = T.radial(hl, c, th) + 0.004
    front = np.clip(-np.sin(th), 0, 1) ** 2  # -Y is the front
    path = np.column_stack([c[0] + r * np.cos(th), c[1] + r * np.sin(th), z - drop * front])
    mat = looks.flat_material('gold', color, 0.25, metallic=1.0)
    curve = bpy.data.curves.new('necklace', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = 0.0012
    sp = curve.splines.new('POLY'); sp.points.add(len(path) - 1)
    for p, co in zip(sp.points, path):
        p.co = (*co, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new('necklace', curve); bpy.context.scene.collection.objects.link(ob)
    curve.materials.append(mat)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    ob = bpy.data.objects.new('necklace', me); bpy.context.scene.collection.objects.link(ob)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.006, location=tuple(path[np.argmax(front)] + np.array([0, -0.002, -0.006])))
    pend = bpy.context.active_object; pend.data.materials.append(mat)
    T.skin(ob, B, h['armature'], smooth=0)
    return [ob, rigid(pend, h, 'spine_03')]


def watch(h, B, side='l', strap='#1a1a1a', face='#d9a441'):
    """A wristwatch: strap ring and a gold case, rigid on the forearm."""
    a, b = B.j[f'lowerarm_{side}']
    ax = (b - a) / np.linalg.norm(b - a)
    p = b - ax * 0.03
    near = B.co[(B.bone == f'lowerarm_{side}') & (np.abs((B.co - p) @ ax) < 0.008)]
    r = np.linalg.norm((near - p) - np.outer((near - p) @ ax, ax), axis=1).max() + 0.002
    rot = Vector((0, 0, 1)).rotation_difference(Vector(ax)).to_euler()
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=0.018, vertices=40, location=tuple(p), rotation=rot)
    band = bpy.context.active_object; band.name = 'watch-strap'
    sm = band.modifiers.new('Thickness', 'SOLIDIFY'); sm.thickness = 0.003
    band.data.materials.append(fabrics.leather('watch-strap', strap))
    out_dir = np.cross(ax, [0, 1, 0]); out_dir /= np.linalg.norm(out_dir)
    if side == 'l':
        out_dir = -out_dir
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.008, vertices=32, location=tuple(p + out_dir * (r + 0.004)),
                                        rotation=Vector((0, 0, 1)).rotation_difference(Vector(out_dir)).to_euler())
    case = bpy.context.active_object; case.name = 'watch-case'
    case.data.materials.append(looks.flat_material('gold', face, 0.2, metallic=1.0))
    return [rigid(band, h, f'lowerarm_{side}'), rigid(case, h, f'lowerarm_{side}')]


def backpack(h, B, jersey, color='#1c1d21', trim='#2c2e33'):
    """A backpack on the upper back with padded straps over the shoulders, resting on the shirt."""
    torso = B.co[B.mask({'spine_02', 'spine_03'})]
    back_y = torso[:, 1].max()
    cz = B.chest - 0.06
    mat = fabrics.cloth('backpack', color, 0.7, sheen=0.2, weave='plain', weave_scale=500)
    body = rounded_box('backpack', (0, back_y + 0.075, cz), (0.30, 0.12, 0.40), mat, bevel=0.04)
    pocket = rounded_box('backpack-pocket', (0, back_y + 0.14, cz - 0.08), (0.22, 0.04, 0.17), fabrics.cloth('backpack-trim', trim, 0.7), bevel=0.015)
    out = [rigid(body, h, 'spine_03'), rigid(pocket, h, 'spine_03')]
    smat = fabrics.cloth('backpack-strap', '#141518', 0.75)
    axis_y = (torso[:, 1].min() + back_y) / 2
    for sgn in (1, -1):
        x = 0.085 * sgn
        top = B.co[(np.abs(B.co[:, 0] - x) < 0.012) & B.mask({'clavicle_l', 'clavicle_r', 'spine_03', 'neck_01'})]
        ztop = top[:, 2].max()
        # From the top of the pack, over the shoulder and down the chest into the armpit (hidden by the arm).
        ctrl = [(0.1 * sgn, back_y + 0.02, cz + 0.17), (x, back_y - 0.02, ztop - 0.005), (x * 1.05, axis_y - 0.02, ztop + 0.005),
                (x * 1.15, torso[:, 1].min() + 0.01, ztop - 0.07), (x * 1.45, torso[:, 1].min() + 0.025, B.chest - 0.06)]
        path = catmull(ctrl, per=10)
        st = T.ribbon(f'backpack-strap-{sgn}', jersey, path - lateral(path, jersey) * 0.0225, lambda p: lateral(p, jersey), 0.045, smat,
                      outward=0.006, thickness=0.008, closed=False)
        st.location = (0, 0, 0)
        T.skin(st, B, h['armature'], smooth=4)
        out.append(st)
    return out


def handbag(h, B, side='l', color='#16161a', size=(0.25, 0.09, 0.19), strap='handle'):
    """A structured handbag held at the side: modelled in the relaxed pose, then carried by the forearm."""
    arm = h['armature']
    looks.reset_pose(arm); looks.relaxed(arm)
    bpy.context.view_layer.update()
    hand = arm.matrix_world @ arm.pose.bones[f'hand_{side}'].tail
    sgn = 1 if side == 'l' else -1
    centre = (hand.x + sgn * 0.035, hand.y + 0.005, hand.z - size[2] / 2 - 0.05)
    mat = fabrics.leather('handbag', color, 0.38)
    bag = rounded_box('handbag', centre, size, mat, bevel=0.02, rot=(0, 0, math.radians(90 * sgn)))
    curve = bpy.data.curves.new('handle', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = 0.006
    sp = curve.splines.new('POLY')
    pts = [(centre[0], centre[1] + 0.06 * k, centre[2] + size[2] / 2 + 0.06 * math.cos(k * math.pi / 2)) for k in np.linspace(-1, 1, 12)]
    sp.points.add(len(pts) - 1)
    for p, co in zip(sp.points, pts):
        p.co = (*co, 1)
    ob = bpy.data.objects.new('handle', curve); bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    handle = bpy.data.objects.new('handbag-handle', me); bpy.context.scene.collection.objects.link(handle)
    handle.data.materials.append(mat)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(centre[0] - sgn * (size[1] / 2 + 0.001), centre[1], centre[2] + size[2] * 0.25))
    clasp = bpy.context.active_object; clasp.scale = (0.004, 0.03, 0.02)
    T._apply_modifiers(clasp)
    bpy.context.view_layer.update()
    for v in clasp.data.vertices:
        v.co = clasp.matrix_world @ v.co
    clasp.matrix_world = Matrix.Identity(4)
    clasp.data.materials.append(looks.flat_material('gold', '#d9a441', 0.25, metallic=1.0))
    out = []
    for ob in (bag, handle, clasp):
        to_rest(ob, arm, f'hand_{side}')
        out.append(rigid(ob, h, f'hand_{side}'))
    looks.reset_pose(arm)
    return out
