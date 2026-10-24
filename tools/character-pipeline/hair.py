"""
Hairstyles and facial hair beyond the basic fade (looks.hair_fade):
  full_beard  - a short, dense beard with a moustache and a clean cheek line
  braided_bun - braids running from the hairline up over the scalp into a coiled high bun
  big_afro    - a full, rounded afro: a soft volume of coils with fuzzy strands at its surface
"""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import looks


def _smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def full_beard(h, density=1.0, melanin=0.98):
    """Beard and moustache placed from the mouth (lip mask) and jaw: dense on the chin, tapering up the cheeks."""
    body = h['body']
    me = body.data
    nv = len(me.vertices)
    col = me.color_attributes['face']
    lips = np.array([col.data[i].color[0] for i in range(nv)])
    co = np.array([v.co[:] for v in me.vertices])
    head_w = looks._weights_of(body, ['head'])
    c, zmin, zmax, ymin = looks.head_frame(h)
    m = lips > 0.4
    mouth = co[m].mean(0)
    x, y, z = co[:, 0] - mouth[0], co[:, 1], co[:, 2]
    ax = np.abs(x)
    front = _smooth((c.y + 0.02 - y) / 0.03)
    chin_line = z > mouth[2] - 0.075 - 0.02 * _smooth(ax / 0.05)
    cheek = mouth[2] + 0.018 + 0.55 * np.clip(ax - 0.03, 0, None)
    beard = _smooth((cheek - z) / 0.008) * chin_line * front * _smooth((0.085 - ax) / 0.01)
    mous = _smooth((z - (mouth[2] + 0.004)) / 0.004) * _smooth((mouth[2] + 0.024 - z) / 0.005) * _smooth((0.034 - ax) / 0.006) * front
    d = np.clip(np.maximum(beard, mous) * (1 - _smooth((lips - 0.15) / 0.2)) * (head_w > 0.4), 0, 1) * density
    looks.particle_hair(h, 'beard', lambda i, co_: float(d[i]), lambda i, co_: 0.7 + 0.3 * float(d[i]), 9000, 0.006,
                        looks.hair_bsdf('beard', melanin), curl=0.0009, curl_freq=140, clump=0.3, children=14, root=0.00016, tip=0.00007)
    return d


def _scalp_point(tree, c, direction, lift):
    hit = tree.ray_cast(c + direction * 0.25, -direction, 0.3)
    if hit[0] is None:
        return None
    return np.array(hit[0][:]) + direction * lift


def braided_bun(h, targets_dir, n_braids=40, color='#1c110c'):
    """Braids from the hairline up over the scalp into a high bun made of coiled braid."""
    body = h['body']
    sel, dens, c = looks.scalp_density(h, 0.088, 0.045, -0.03, looks.ears_mask(h, targets_dir), band=0.006)
    looks.set_scalp_mask(h, [dens(i, v.co) for i, v in enumerate(body.data.vertices)])
    _, zmin, zmax, _ = looks.head_frame(h)
    # Cornrow base between the braids (the scalp is never bare between them).
    base = looks.shell_from_body(h, 'cornrows', sel, lambda i, co: 0.002, looks.with_density_alpha(looks.cornrow_material('cornrows', color, rows=24)),
                                 density=dens)
    me = body.data
    tree = BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])
    bun = Vector((c.x, c.y + 0.035, zmax + 0.035))
    mat = looks.cornrow_material('braid', color, rows=60)
    curves = bpy.data.curves.new('braids', 'CURVE')
    curves.dimensions = '3D'; curves.bevel_depth = 0.0055; curves.bevel_resolution = 2
    pts_hair = np.array([v.co[:] for i, v in enumerate(me.vertices) if dens(i, v.co) > 0.4 and dens(i, v.co) < 0.9])
    for k in range(n_braids):
        a = 2 * math.pi * k / n_braids
        d2 = np.array([math.sin(a), -math.cos(a)])
        rel = pts_hair[:, :2] - np.array([c.x, c.y])
        score = rel @ d2 / np.maximum(np.linalg.norm(rel, axis=1), 1e-6)
        start = pts_hair[np.argmax(score - 0.001 * pts_hair[:, 2])]
        s_dir = Vector(start) - c; s_dir.normalize()
        e_dir = bun - c; e_dir.normalize()
        sp = curves.splines.new('POLY')
        path = []
        for t in np.linspace(0, 1, 18):
            dvec = s_dir.slerp(e_dir, float(t * 0.92))
            p = _scalp_point(tree, c, dvec, 0.0045)
            if p is not None:
                path.append(p)
        sp.points.add(len(path) - 1)
        for p, co in zip(sp.points, path):
            p.co = (*co, 1)
    # The bun: a braid coiled from its base to its top.
    sp = curves.splines.new('POLY')
    coil = []
    for t in np.linspace(0, 1, 160):
        ang = t * 2 * math.pi * 4.5
        r = 0.053 * (1 - 0.6 * t) + 0.004
        coil.append((bun.x + r * math.cos(ang), bun.y + r * math.sin(ang), bun.z - 0.028 + 0.058 * t))
    sp.points.add(len(coil) - 1)
    for p, co in zip(sp.points, coil):
        p.co = (*co, 1)
    ob = bpy.data.objects.new('braids', curves)
    bpy.context.scene.collection.objects.link(ob)
    mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    ob = bpy.data.objects.new('braids', mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.048, location=(bun.x, bun.y, bun.z), segments=24, ring_count=12)
    core = bpy.context.active_object; core.scale = (1, 1, 0.75); core.data.materials.append(mat)
    looks.rigid_on_bone(ob, h, 'head')
    looks.rigid_on_bone(core, h, 'head')
    return [base, ob, core]


def big_afro(h, targets_dir, size=0.075, melanin=0.97):
    """A full, round afro: a soft volume shaded as tight coils, with fuzzy strands breaking its outline."""
    body = h['body']
    sel, dens, c = looks.scalp_density(h, 0.068, 0.03, -0.04, looks.ears_mask(h, targets_dir), band=0.012)
    looks.set_scalp_mask(h, [dens(i, v.co) for i, v in enumerate(body.data.vertices)])
    _, zmin, zmax, _ = looks.head_frame(h)

    def lift(i, co):
        up = max(0.0, min(1.0, (co.z - c.z + 0.03) / (zmax - c.z + 0.03)))
        return size * (0.55 + 0.45 * up ** 0.7)
    shell = looks.shell_from_body(h, 'afro', lambda i, co: dens(i, co) > 0.05, lift,
                                  looks.with_density_alpha(looks.hair_material('afro', '#120c09', coil_scale=260, sheen=0.35)),
                                  smooth=8, density=dens)
    looks.particle_hair(h, 'afro-fuzz', dens, lambda i, co: lift(i, co) / (size * 1.15), 9000, size * 1.15,
                        looks.hair_bsdf('afro-fuzz', melanin), curl=0.005, curl_freq=90, clump=0.5, children=30,
                        root=0.00028, tip=0.00014, rough=0.004)
    return [shell]
