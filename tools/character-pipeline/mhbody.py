"""
Build a rigged human body in Blender from CC0 MakeHuman / MPFB2 data, without the MakeHuman app or the
MPFB add-on: the base mesh, morph targets, eye proxy, game-engine skeleton and skin weights are read
directly from their files.

Coordinates: MakeHuman files use decimetres with Y up; Blender uses metres with Z up and the character
facing -Y (the MPFB convention). mh_to_blender() converts.

Only CC0 assets are read (see README.md). The AGPL MakeHuman walk animations are deliberately not used.
"""
import json
import os
from collections import defaultdict

import bpy
import numpy as np
from mathutils import Vector


def mh_to_blender(v):
    return (v[0] * 0.1, -v[2] * 0.1, v[1] * 0.1)


# ----------------------------------------------------------------------------- base mesh

class BaseMesh:
    """The MakeHuman base mesh (hm08): vertices, UVs and faces, grouped by OBJ group name."""

    def __init__(self, path):
        self.verts = []
        self.uvs = []
        self.faces = defaultdict(list)  # group -> [(vertex indices, uv indices)]
        group = None
        with open(path) as f:
            for line in f:
                if line.startswith('v '):
                    self.verts.append([float(x) for x in line.split()[1:4]])
                elif line.startswith('vt '):
                    self.uvs.append([float(x) for x in line.split()[1:3]])
                elif line.startswith('g '):
                    group = line.split(None, 1)[1].strip()
                elif line.startswith('f '):
                    vs, ts = [], []
                    for tok in line.split()[1:]:
                        p = tok.split('/')
                        vs.append(int(p[0]) - 1)
                        ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                    self.faces[group].append((vs, ts))
        self.verts = np.array(self.verts, dtype=np.float64)
        self.uvs = np.array(self.uvs, dtype=np.float64)

    def group_vertices(self, group):
        return sorted({i for vs, _ in self.faces[group] for i in vs})


def read_target(path):
    """A .target file: lines 'index dx dy dz' (MakeHuman units)."""
    idx, d = [], []
    with open(path) as f:
        for line in f:
            if not line.strip() or line.startswith('#'):
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3)


def target_indices(path):
    return set(read_target(path)[0].tolist())


def _level_weights(value):
    """0..1 slider -> weights of the min / average / max targets (MakeHuman's macro interpolation)."""
    if value < 0.5:
        return {'min': (0.5 - value) / 0.5, 'average': value / 0.5}
    return {'average': (1 - value) / 0.5, 'max': (value - 0.5) / 0.5}


def macro_targets(spec):
    """
    The macro modifiers as (relative path, weight), following MakeHuman's model in simplified form:
    gender (0 female .. 1 male), African ethnicity, young adult, muscle and weight (0..1, 0.5 = average),
    height (-1..1) and proportions (0..1 ideal). spec['extra'] adds face / body detail targets.
    """
    out = []
    g = spec['gender']
    genders = [(n, w) for n, w in (('male', g), ('female', 1 - g)) if w > 1e-6]
    muscle = _level_weights(spec.get('muscle', 0.5))
    weight = _level_weights(spec.get('weight', 0.5))
    for gname, gw in genders:
        out.append((f'macrodetails/african-{gname}-young.target', gw))
        for ml, mw in muscle.items():
            for wl, ww in weight.items():
                w = gw * mw * ww
                if w <= 1e-6:
                    continue
                out.append((f'macrodetails/universal-{gname}-young-{ml}muscle-{wl}weight.target', w))
                p = spec.get('proportions', 0.0)
                if p > 0:
                    out.append((f'macrodetails/proportions/{gname}-young-{ml}muscle-{wl}weight-idealproportions.target', w * p))
        h = spec.get('height', 0.0)
        if abs(h) > 1e-6:
            out.append((f'macrodetails/height/{gname}-young-averagemuscle-averageweight-{"max" if h > 0 else "min"}height.target', gw * abs(h)))
    out.extend(spec.get('extra', []))
    return out


def morphed_vertices(base, targets_dir, targets):
    v = base.verts.copy()
    for rel, w in targets:
        idx, d = read_target(os.path.join(targets_dir, rel))
        v[idx] += d * w
    return v


# ----------------------------------------------------------------------------- proxies (eyes)

def fit_proxy(mhclo_path, verts):
    """Fit a MakeHuman proxy (.mhclo) to morphed base vertices. Returns (obj path, fitted MH-unit vertices)."""
    refs, scales, obj_file, reading = [], {}, None, False
    with open(mhclo_path) as f:
        for line in f:
            p = line.split()
            if not p or p[0].startswith('#'):
                continue
            if p[0] in ('x_scale', 'y_scale', 'z_scale'):
                scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] == 'obj_file':
                obj_file = p[1]
            elif p[0] == 'verts':
                reading = True
            elif reading and len(p) == 9:
                refs.append(([int(x) for x in p[:3]], [float(x) for x in p[3:6]], [float(x) for x in p[6:9]]))
            elif reading and len(p) != 9 and p[0] not in ('verts',):
                reading = False
    axis = {'x': 0, 'y': 1, 'z': 2}
    s = np.ones(3)
    for a, (i, j, dist) in scales.items():
        s[axis[a]] = abs(verts[i][axis[a]] - verts[j][axis[a]]) / dist
    out = np.array([sum(w * verts[i] for i, w in zip(ix, ws)) + np.array(off) * s for ix, ws, off in refs])
    return os.path.join(os.path.dirname(mhclo_path), obj_file), out


def read_obj(path):
    verts, uvs, faces = [], [], []
    with open(path) as f:
        for line in f:
            if line.startswith('v '):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('f '):
                vs, ts = [], []
                for tok in line.split()[1:]:
                    q = tok.split('/')
                    vs.append(int(q[0]) - 1)
                    ts.append(int(q[1]) - 1 if len(q) > 1 and q[1] else -1)
                faces.append((vs, ts))
    return verts, uvs, faces


# ----------------------------------------------------------------------------- Blender objects

def make_mesh(name, verts_mh, faces, uvs=None, smooth=True):
    """faces: [(vertex indices into verts_mh, uv indices)]. Unused vertices are dropped. Returns (object, old->new map)."""
    used = sorted({i for vs, _ in faces for i in vs})
    remap = {old: new for new, old in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([mh_to_blender(verts_mh[i]) for i in used], [], [[remap[i] for i in vs] for vs, _ in faces])
    if uvs is not None and len(uvs):
        layer = me.uv_layers.new(name='UVMap')
        k = 0
        for vs, ts in faces:
            for t in ts:
                layer.data[k].uv = uvs[t] if t >= 0 else (0, 0)
                k += 1
    for p in me.polygons:
        p.use_smooth = smooth
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, remap


def joint_position(base_verts_mh, base, spec):
    """MPFB bone end strategies: CUBE (centre of a joint helper cube), MEAN or VERTEX."""
    if spec['strategy'] == 'CUBE':
        idx = base.group_vertices(spec['cube_name'])
    elif spec['strategy'] == 'MEAN':
        idx = spec['vertex_indices']
    else:
        idx = [spec['vertex_index']]
    return Vector(mh_to_blender(base_verts_mh[idx].mean(axis=0)))


def build_armature(name, rig_json, base, verts_mh):
    rig = json.load(open(rig_json))
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, b in rig.items():
        eb = arm.edit_bones.new(bname)
        eb.head = joint_position(verts_mh, base, b['head'])
        eb.tail = joint_position(verts_mh, base, b['tail'])
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.02))
        eb.roll = b.get('roll', 0.0)
    for bname, b in rig.items():
        if b.get('parent'):
            arm.edit_bones[bname].parent = arm.edit_bones[b['parent']]
            arm.edit_bones[bname].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def add_weights(ob, remap, weights_json):
    w = json.load(open(weights_json))['weights']
    for bone, pairs in w.items():
        vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
        for idx, wt in pairs:
            if idx in remap:
                vg.add([remap[idx]], wt, 'REPLACE')


def bind(ob, arm):
    ob.parent = arm
    m = ob.modifiers.new('Armature', 'ARMATURE')
    m.object = arm
    return m


def build_body(spec, mh_data, mpfb_data, name='Human'):
    """
    Returns a dict with the armature, the body object and the data needed to fit clothes and hair:
    the morphed base vertices (MH units) and the base mesh.
    """
    base = BaseMesh(os.path.join(mh_data, '3dobjs', 'base.obj'))
    verts = morphed_vertices(base, os.path.join(mh_data, 'targets'), macro_targets(spec))
    rigdir = os.path.join(mpfb_data, 'rigs', 'standard')
    arm = build_armature(f'{name}-rig', os.path.join(rigdir, 'rig.game_engine.json'), base, verts)
    body, remap = make_mesh(f'{name}-body', verts, base.faces['body'], base.uvs)
    add_weights(body, remap, os.path.join(rigdir, 'weights.game_engine.json'))
    bind(body, arm)
    # Eyelashes (helper geometry in the base mesh) follow the head.
    lash_faces = [f for g in ('helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2') for f in base.faces[g]]
    lashes, lremap = make_mesh(f'{name}-lashes', verts, lash_faces, base.uvs)
    add_weights(lashes, lremap, os.path.join(rigdir, 'weights.game_engine.json'))
    bind(lashes, arm)
    # Eyes: the high-poly eye proxy fitted to this body, rigidly on the head bone.
    obj_path, fitted = fit_proxy(os.path.join(mh_data, 'eyes', 'high-poly', 'high-poly.mhclo'), verts)
    ev, euv, ef = read_obj(obj_path)
    eyes, _ = make_mesh(f'{name}-eyes', fitted, ef, np.array(euv))
    vg = eyes.vertex_groups.new(name='head')
    vg.add(list(range(len(eyes.data.vertices))), 1.0, 'REPLACE')
    bind(eyes, arm)
    return {'armature': arm, 'body': body, 'lashes': lashes, 'eyes': eyes, 'remap': remap, 'verts': verts, 'base': base,
            'weights': json.load(open(os.path.join(rigdir, 'weights.game_engine.json')))['weights'],
            'eye_texture': os.path.join(mh_data, 'eyes', 'materials', 'brown_eye.png')}
