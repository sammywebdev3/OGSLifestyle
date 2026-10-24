"""
Garments cut from MakeHuman's CC0 helper meshes ('helper-tights' is a full bodysuit from the feet to the
neck, 'helper-skirt' a tube from the hips to the ankles). Each base-mesh vertex has a dominant bone in
the rig's weights, so a garment is a rule on (bone, position): which helper faces it keeps, and which
body vertices it covers (those are masked out so skin never pokes through while walking).
"""
import bpy
import numpy as np
from mathutils import Vector

import looks
import mhbody

TORSO = {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'}
ARM_UP = {'upperarm_l', 'upperarm_r'}
ARM_LOW = {'lowerarm_l', 'lowerarm_r'}
HAND = {b for side in ('l', 'r') for b in (f'hand_{side}', *(f'{f}_{k:02d}_{side}' for f in ('thumb', 'index', 'middle', 'ring', 'pinky') for k in (1, 2, 3)))}
LEG = {'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}
FOOT = {'foot_l', 'foot_r', 'ball_l', 'ball_r'}


class Fit:
    """Landmarks of one body (rest pose, Blender coordinates) and each base vertex's dominant bone."""

    def __init__(self, h):
        self.h = h
        arm = h['armature'].data.bones
        self.j = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm}
        n = len(h['verts'])
        best = np.zeros(n)
        self.bone = [''] * n
        for bone, pairs in h['weights'].items():
            for idx, w in pairs:
                if w > best[idx]:
                    best[idx] = w
                    self.bone[idx] = bone
        self.co = np.array([mhbody.mh_to_blender(v) for v in h['verts']])
        self.waist = self.j['spine_01'][0].z
        self.hip = self.j['pelvis'][0].z
        self.collar = self.j['clavicle_l'][0].z
        self.knee = self.j['calf_l'][0].z
        self.ankle = self.j['foot_l'][0].z
        self.front_y = self.j['spine_03'][0].y

    def along(self, idx, bone):
        """0..1 position of vertex idx along a bone (0 at its head)."""
        h, t = self.j[bone]
        v = Vector(self.co[idx])
        d = t - h
        return (v - h).dot(d) / d.length_squared


def top_rule(sleeve=0.45, hem=None, neck='crew', full_sleeve=False):
    """Shirts and tunics: torso, plus sleeves to a fraction of the upper arm (or to the wrist)."""
    def rule(f, i, margin=0.0):
        b, z = f.bone[i], f.co[i][2]
        hem_z = (f.hip - 0.07) if hem is None else hem(f)
        if b in TORSO:
            if z < hem_z + margin:
                return False
            if b == 'neck_01' or z > f.collar + 0.025 - margin:
                return False
            if neck == 'v' and abs(f.co[i][0]) < 0.045 - margin and f.co[i][1] < f.front_y - 0.02 and z > f.collar - 0.075:
                return False
            if neck == 'scoop' and abs(f.co[i][0]) < 0.075 - margin and f.co[i][1] < f.front_y and z > f.collar - 0.06:
                return False
            return True
        if b in ARM_UP:
            return full_sleeve or f.along(i, b) < sleeve - margin * 4
        if b in ARM_LOW:
            return full_sleeve and f.along(i, b) < 0.97 - margin * 4
        if b in LEG:
            return z > hem_z + margin  # a straight hem across the top of the thighs
        return False
    return rule


def trouser_rule(waist_offset=0.06, cuff=0.035):
    def rule(f, i, margin=0.0):
        b, z = f.bone[i], f.co[i][2]
        if b in LEG or (b == 'pelvis' and z < f.hip + waist_offset - margin) or (b == 'spine_01' and z < f.hip + waist_offset - margin):
            return z > f.ankle + cuff + margin
        return False
    return rule


def shoe_rule(height=0.05):
    def rule(f, i, margin=0.0):
        b, z = f.bone[i], f.co[i][2]
        return (b in FOOT or (b in {'calf_l', 'calf_r'} and z < f.ankle + height - margin))
    return rule


def faces_where(f, group, rule):
    return [fc for fc in f.h['base'].faces[group] if all(rule(f, i) for i in fc[0])]


def garment(f, name, rule, material, extra=0.004, group='helper-tights', loose=None, smooth=3, trim_rings=0, folds=0.0, hem_snap=0.0, top_snap=0.0):
    """
    A garment from helper faces kept by rule, pushed out by extra metres (+ loose(co) if given).
    trim_rings > 0 stores a 'trim' attribute along the open edges (for contrasting cuffs and collars);
    folds > 0 adds soft fabric folds (displacement).
    """
    faces = faces_where(f, group, rule)
    h = f.h
    ob, remap = mhbody.make_mesh(name, h['verts'], faces, h['base'].uvs)
    ob.data.update()
    for v in ob.data.vertices:
        v.co += v.normal * (extra + (loose(v.co) if loose else 0.0))
    if hem_snap:
        # Even out the stair-stepped lower hem left by whole-face selection.
        import bmesh
        bm = bmesh.new(); bm.from_mesh(ob.data)
        edge = {v.index for e in bm.edges if e.is_boundary for v in e.verts}
        bm.free()
        zs = [ob.data.vertices[i].co.z for i in edge]
        low = [i for i in edge if ob.data.vertices[i].co.z < min(zs) + hem_snap]
        if low:
            z = sum(ob.data.vertices[i].co.z for i in low) / len(low)
            for i in low:
                ob.data.vertices[i].co.z = z
    if top_snap:
        # The same for a waistband (the highest open edge).
        import bmesh
        bm = bmesh.new(); bm.from_mesh(ob.data)
        edge = {v.index for e in bm.edges if e.is_boundary for v in e.verts}
        bm.free()
        zs = [ob.data.vertices[i].co.z for i in edge]
        top = [i for i in edge if ob.data.vertices[i].co.z > max(zs) - top_snap]
        if top:
            z = sum(ob.data.vertices[i].co.z for i in top) / len(top)
            for i in top:
                ob.data.vertices[i].co.z = z
    if trim_rings:
        import bmesh
        bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
        level = {v.index: 0 for e in bm.edges if e.is_boundary for v in e.verts}
        frontier = set(level)
        for r in range(1, trim_rings + 1):
            nxt = set()
            for vi in frontier:
                for e in bm.verts[vi].link_edges:
                    o = e.other_vert(bm.verts[vi]).index
                    if o not in level:
                        level[o] = r; nxt.add(o)
            frontier = nxt
        bm.free()
        ta = ob.data.attributes.new('trim', 'FLOAT', 'POINT')
        for i, r in level.items():
            ta.data[i].value = 1.0 if r < trim_rings else 0.4
    for bone, pairs in h['weights'].items():
        vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
        for idx, wt in pairs:
            if idx in remap:
                vg.add([remap[idx]], wt, 'REPLACE')
    ob.data.materials.append(material)
    sol = ob.modifiers.new('Thickness', 'SOLIDIFY'); sol.thickness = 0.0025; sol.offset = 1.0
    sm = ob.modifiers.new('Smooth', 'SMOOTH'); sm.iterations = smooth; sm.factor = 0.5
    mhbody.bind(ob, h['armature'])
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    sub = ob.modifiers.new('Sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    if folds:
        tex = bpy.data.textures.new(f'{name}-folds', 'CLOUDS'); tex.noise_scale = 0.06; tex.noise_basis = 'ORIGINAL_PERLIN'
        d = ob.modifiers.new('Folds', 'DISPLACE'); d.texture = tex; d.strength = folds; d.mid_level = 0.5; d.texture_coords = 'UV'
    return ob


def body_shell(f, name, rule, material, offset=0.006, smooth=2):
    """A garment from the body surface itself (shoes, sandals), for parts the helpers do not cover."""
    sel = lambda i, co: rule(f, i)  # noqa: E731 (body vertex index == base index)
    return looks.shell_from_body(f.h, name, sel, lambda i, co: offset, material, smooth=smooth)


def sneakers(f, upper, sole, height=0.055):
    """Trainers: a roomy upper over the foot and a flat, thick contrasting sole."""
    ob = body_shell(f, 'sneakers', shoe_rule(height), upper, offset=0.011)
    me = ob.data
    zmin = min(v.co.z for v in me.vertices)
    for v in me.vertices:
        if v.co.z < zmin + 0.022:
            v.co.z = zmin - 0.006  # flatten the bottom into a sole
    me.materials.append(sole)
    for p in me.polygons:
        if all(me.vertices[i].co.z < zmin + 0.004 for i in p.vertices) or sum(me.vertices[i].co.z < zmin for i in p.vertices) >= 2:
            p.material_index = 1
    return ob


def hide_under(f, clothes, reach=0.08, keep_rings=1):
    """
    Mask out body vertices that a garment really covers (so skin never pokes through while moving): a vertex is
    covered when a ray out along its normal hits a garment within `reach`; the covered area is then shrunk by
    `keep_rings` edge rings so the skin just inside every garment edge (neckline, cuffs, hems) stays.
    """
    from mathutils.bvhtree import BVHTree
    body = f.h['body']
    trees = []
    for ob in clothes:
        me = ob.data
        trees.append(BVHTree.FromPolygons([ob.matrix_world @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons]))
    n = len(body.data.vertices)
    covered = np.zeros(n, bool)
    for v in body.data.vertices:
        co = body.matrix_world @ v.co
        nrm = (body.matrix_world.to_3x3() @ v.normal).normalized()
        for t in trees:
            hit = t.ray_cast(co, nrm, reach)
            if hit[0] is not None:
                covered[v.index] = True
                break
    nbr = [[] for _ in range(n)]
    for e in body.data.edges:
        a, b = e.vertices
        nbr[a].append(b); nbr[b].append(a)
    for _ in range(keep_rings):
        covered = covered & np.array([all(covered[j] for j in nbr[i]) for i in range(n)])
    vg = body.vertex_groups.new(name='visible')
    vg.add([i for i in range(n) if not covered[i]], 1.0, 'REPLACE')
    m = body.modifiers.new('Covered', 'MASK'); m.vertex_group = 'visible'
    return int(covered.sum())
