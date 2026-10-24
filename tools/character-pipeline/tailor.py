"""
Tailored garments: clothing with real shape, built around the body instead of painted onto a skin-tight shell.

A garment is a set of tubes (torso, sleeves, trouser legs, skirts). Each tube's cross-section is the convex hull of
the body's own cross-section plus ease, so the cloth bridges hollows (the spine, under the bust, between the legs)
the way fabric does, and loose garments can hang from the shoulders and chest. The tubes are fused into one surface
by voxel remeshing, openings (hems, necklines, cuffs) are cut along smooth curves, the cloth is draped against the
body by a short cloth simulation (real folds), then skinned by blending the nearest body weights. Ribbons along
the openings make collars, cuffs, waistbands and hems.

Garments are built in the rest pose: MakeHuman's A-pose arms (so sleeves never fuse with the torso) with the legs
brought to hip width (set_stance).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

import looks
import mhbody

TORSO = {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'}
ARM = {'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'}
LEG = {'thigh_l', 'thigh_r', 'calf_l', 'calf_r'}
FOOT = {'foot_l', 'foot_r', 'ball_l', 'ball_r'}


# ----------------------------------------------------------------------------- rest pose and body landmarks


def _apply_modifiers(ob, keep=()):
    """Bake an object's modifier stack into its mesh (without operators, so it works headless)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.data = me
    for m in list(ob.modifiers):
        if m.name not in keep:
            ob.modifiers.remove(m)
    if old.users == 0:
        bpy.data.meshes.remove(old)


def set_stance(h, spread=0.06):
    """MakeHuman's A-pose stands with the feet wide apart: bring the legs to hip width and make that the rest pose."""
    arm, body = h['armature'], h['body']
    looks.reset_pose(arm)
    for side, sgn in (('l', 1), ('r', -1)):
        looks.aim(arm, f'thigh_{side}', (spread * sgn, -0.01, -1.0))
        looks.aim(arm, f'calf_{side}', (0.0, 0.03, -1.0))
    bpy.context.view_layer.update()
    _apply_modifiers(body)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    mhbody.bind(body, arm)
    body.modifiers.move(len(body.modifiers) - 1, 0)


def adopt_relaxed(h, garments):
    """
    Lower the arms into the relaxed standing pose and make it the rest pose of the skeleton, the body and every
    garment (garments are built with the arms raised so sleeves never fuse with the torso). Vertex weights are kept.
    """
    arm = h['armature']
    looks.reset_pose(arm)
    looks.relaxed(arm)
    bpy.context.view_layer.update()
    meshes = [h['body'], h['lashes'], h['eyes']] + list(garments)
    for ob in meshes:
        _apply_modifiers(ob)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    looks.reset_pose(arm)
    for ob in meshes:
        mhbody.bind(ob, arm)
        ob.modifiers.move(len(ob.modifiers) - 1, 0)


class Garment:
    """A garment between build stages: its mesh and how to finish it in the final rest pose."""

    def __init__(self, ob, material, pin, skirt_below=None, thickness=0.003):
        self.ob, self.material, self.pin, self.skirt_below, self.thickness = ob, material, pin, skirt_below, thickness

    def settle(self, h, B, frames=8, under=()):
        """In the final rest pose: let the cloth settle (no creases left from lowering the arms), re-skin, finish."""
        ob = self.ob
        for vg in list(ob.vertex_groups):
            ob.vertex_groups.remove(vg)
        for m in list(ob.modifiers):
            ob.modifiers.remove(m)
        if frames:
            drape(ob, h['body'], self.pin(B), frames=frames, expand=0.0, under=under)
        set_rest(ob)
        skin(ob, B, h['armature'], skirt_below=self.skirt_below(B) if callable(self.skirt_below) else self.skirt_below)
        finish(ob, self.material, self.thickness)
        return ob


class Body:
    """Rest-pose body: vertex positions, each vertex's dominant bone, joints and landmark heights (metres)."""

    def __init__(self, h):
        self.h = h
        body = h['body']
        me = body.data
        self.co = np.array([v.co[:] for v in me.vertices])
        self.no = np.array([v.normal[:] for v in me.vertices])
        bones = {b.name for b in h['armature'].data.bones}
        self.bone_names = sorted(bones)
        col = {b: i for i, b in enumerate(self.bone_names)}
        names = {g.index: g.name for g in body.vertex_groups if g.name in bones}
        self.W = np.zeros((len(me.vertices), len(self.bone_names)))
        for v in me.vertices:
            for g in v.groups:
                if g.group in names:
                    self.W[v.index, col[names[g.group]]] = g.weight
        self.bone = np.array([self.bone_names[i] for i in self.W.argmax(1)], dtype=object)
        self.j = {b.name: (np.array(b.head_local[:]), np.array(b.tail_local[:])) for b in h['armature'].data.bones}
        hd = lambda b: self.j[b][0]  # noqa: E731
        self.neck = hd('neck_01')[2]
        self.chest = hd('spine_03')[2]
        self.waist = hd('spine_01')[2]
        self.hip = hd('pelvis')[2]
        self.knee = hd('calf_l')[2]
        self.ankle = hd('foot_l')[2]
        self.shoulder = hd('upperarm_l')[2]
        self.floor = self.co[:, 2].min()
        pel = self.co[(self.bone == 'pelvis') & (np.abs(self.co[:, 0]) < 0.03)]
        self.crotch = pel[:, 2].min() if len(pel) else self.hip - 0.08
        self.kd = KDTree(len(self.co))
        for i, p in enumerate(self.co):
            self.kd.insert(p, i)
        self.kd.balance()

    def mask(self, bones):
        return np.isin(self.bone, list(bones))

    def chain(self, *bones):
        """Joint points along a chain of bones: head of the first, then each tail."""
        return [self.j[bones[0]][0]] + [self.j[b][1] for b in bones]


# ----------------------------------------------------------------------------- cross-sections


def _cross(a, b):
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


def hull2d(p):
    """Convex hull of 2D points (monotone chain), counter-clockwise."""
    p = np.unique(np.round(p, 5), axis=0)
    if len(p) < 3:
        return p
    p = p[np.lexsort((p[:, 1], p[:, 0]))]

    def half(pts):
        out = []
        for q in pts:
            while len(out) >= 2 and _cross(out[-1] - out[-2], q - out[-2]) <= 0:
                out.pop()
            out.append(q)
        return out
    lo, up = half(p), half(p[::-1])
    return np.array(lo[:-1] + up[:-1])


def radial(hull, c, thetas):
    """Distance from c to a convex polygon's boundary in each direction theta."""
    a = hull - c
    e = np.roll(hull, -1, axis=0) - hull
    d = np.stack([np.cos(thetas), np.sin(thetas)], axis=1)
    den = _cross(d[:, None, :], e[None, :, :])
    with np.errstate(divide='ignore', invalid='ignore'):
        t = _cross(a[None, :, :], e[None, :, :]) / den
        s = _cross(a[None, :, :], d[:, None, :]) / den
    ok = (np.abs(den) > 1e-12) & (s >= -1e-9) & (s <= 1 + 1e-9) & (t > 0)
    return np.where(ok, t, 0).max(axis=1)


def _fill(seq):
    """Replace None entries by the nearest non-None one."""
    idx = [i for i, x in enumerate(seq) if x is not None]
    return [seq[min(idx, key=lambda j: abs(j - i))] if x is None else x for i, x in enumerate(seq)]


def _smooth_rows(a, k=2):
    out = a.copy()
    for i in range(len(a)):
        out[i] = a[max(0, i - k):i + k + 1].mean(axis=0)
    return out


def vertical_rings(B, sel, z_lo, z_hi, ease, n=56, step=0.012, slab=0.012, centre=None, hang=None, flare=None):
    """
    Horizontal rings from z_lo up to z_hi around the selected body points.
    ease(z, theta) -> metres added to the hull; hang (0..1) lets the cloth fall from the widest part above
    (loose shirts, kaftans, dresses) instead of following the waist in; centre fixes the axis (needed with hang).
    """
    pts = B.co[sel]
    zs = np.arange(z_lo, z_hi + 1e-9, step)
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    prof, cen = [], []
    for z in zs:
        q = pts[np.abs(pts[:, 2] - z) < slab][:, :2]
        if len(q) < 8:
            prof.append(None); cen.append(None)
            continue
        c = np.array(centre) if centre is not None else (q.min(0) + q.max(0)) / 2
        prof.append(radial(hull2d(q), c, th)); cen.append(c)
    prof, cen = np.array(_fill(prof)), np.array(_fill(cen))
    if centre is None:
        cen = _smooth_rows(cen, 3)
    prof = _smooth_rows(prof, 1)
    prof += np.array([ease(z, th) for z in zs])
    if hang:
        for i in range(len(zs) - 2, -1, -1):
            prof[i] = np.maximum(prof[i], prof[i + 1] * hang)
    if flare:
        prof += np.array([flare(z) for z in zs])[:, None]
    return [np.column_stack([c[0] + r * np.cos(th), c[1] + r * np.sin(th), np.full(n, z)]) for z, r, c in zip(zs, prof, cen)]


def _project_on_chain(P, chain):
    """For points P (k,3): arc-length position along a polyline and the chain's cumulative lengths."""
    segs = [(chain[i], chain[i + 1]) for i in range(len(chain) - 1)]
    lens = np.array([np.linalg.norm(b - a) for a, b in segs])
    cum = np.concatenate([[0], np.cumsum(lens)])
    best_d = np.full(len(P), np.inf); best_u = np.zeros(len(P))
    for k, (a, b) in enumerate(segs):
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        better = d < best_d
        best_d[better] = d[better]; best_u[better] = cum[k] + t[better] * lens[k]
    return best_u, cum


def _chain_point(chain, cum, u):
    k = int(np.clip(np.searchsorted(cum, u) - 1, 0, len(chain) - 2))
    a, b = chain[k], chain[k + 1]
    return a + (b - a) * (u - cum[k]) / (cum[k + 1] - cum[k])


def limb_rings(B, sel, chain, ease, start=0.0, end=None, n=36, step=0.012, slab=0.012):
    """
    Rings perpendicular to a limb (a chain of joints), from arc length `start` (negative: begin inside the body)
    to `end` (default: the last joint). ease(u, theta) is added to the hull of the limb's cross-section.
    """
    pts = B.co[sel]
    u_pts, cum = _project_on_chain(pts, chain)
    L = cum[-1] if end is None else end
    us = np.arange(start, L + 1e-9, step)
    th = np.linspace(0, 2 * math.pi, n, endpoint=False)
    P = [_chain_point(chain, cum, u) for u in us]
    T = [(_chain_point(chain, cum, u + 0.03) - _chain_point(chain, cum, u - 0.03)) for u in us]
    T = [t / np.linalg.norm(t) for t in T]
    ref = np.cross(T[0], [0, 1, 0]); ref /= np.linalg.norm(ref)
    U, V = [], []
    for t in T:
        ref = ref - (ref @ t) * t; ref /= np.linalg.norm(ref)
        U.append(ref.copy()); V.append(np.cross(t, ref))
    prof, cen = [], []
    for u, p, a, b in zip(us, P, U, V):
        m = np.abs(u_pts - u) < slab
        d = pts[m] - p
        q = np.column_stack([d @ a, d @ b])
        if len(q) < 8:
            prof.append(None); cen.append(None)
            continue
        c = (q.min(0) + q.max(0)) / 2
        prof.append(radial(hull2d(q), c, th)); cen.append(c)
    prof, cen = np.array(_fill(prof)), _smooth_rows(np.array(_fill(cen)), 2)
    prof = _smooth_rows(prof, 1) + np.array([ease(u, th) for u in us])
    rings = []
    for p, a, b, c, r in zip(P, U, V, cen, prof):
        x = c[0] + r * np.cos(th); y = c[1] + r * np.sin(th)
        rings.append(p + np.outer(x, a) + np.outer(y, b))
    return rings


# ----------------------------------------------------------------------------- meshes


def tube(rings):
    """A closed tube (capped at both ends) through the rings: (verts, faces)."""
    n, m = len(rings[0]), len(rings)
    verts = list(np.vstack(rings))
    faces = [[i * n + j, i * n + (j + 1) % n, (i + 1) * n + (j + 1) % n, (i + 1) * n + j] for i in range(m - 1) for j in range(n)]
    c0, c1 = len(verts), len(verts) + 1
    verts += [rings[0].mean(0), rings[-1].mean(0)]
    faces += [[c0, (j + 1) % n, j] for j in range(n)]
    faces += [[c1, (m - 1) * n + j, (m - 1) * n + (j + 1) % n] for j in range(n)]
    return verts, faces


def new_object(name, verts, faces, material=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if material:
        ob.data.materials.append(material)
    return ob


def fuse(name, parts, voxel=0.009, smooth=3):
    """Merge tubes into one clean surface (voxel remesh), lightly smoothed."""
    verts, faces = [], []
    for v, f in parts:
        off = len(verts)
        verts += list(v)
        faces += [[i + off for i in fc] for fc in f]
    ob = new_object(name, verts, faces)
    r = ob.modifiers.new('Remesh', 'REMESH')
    r.mode = 'VOXEL'; r.voxel_size = voxel; r.adaptivity = 0.0
    if smooth:
        s = ob.modifiers.new('Smooth', 'SMOOTH'); s.iterations = smooth; s.factor = 0.5
    _apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def cut(ob, f, pull=True):
    """
    Remove the cloth where f(points) > 0 (f is vectorised over (k, 3) arrays), then pull the new edge exactly onto
    f = 0 and relax it, so hems and necklines are clean curves rather than the voxel staircase.
    """
    bm = bmesh.new(); bm.from_mesh(ob.data)
    cent = np.array([fc.calc_center_median()[:] for fc in bm.faces])
    kill = f(cent) > 0
    bmesh.ops.delete(bm, geom=[fc for fc, k in zip(bm.faces, kill) if k], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.verts.ensure_lookup_table()
    if pull:
        bv = [v for v in bm.verts if v.is_boundary]
        P = np.array([v.co[:] for v in bv])
        if len(P):
            near = f(P) > -0.012
            h = 1e-4
            for _ in range(4):
                fv = f(P)
                g = np.stack([(f(P + h * e) - f(P - h * e)) / (2 * h) for e in np.eye(3)], axis=1)
                step = (fv / np.maximum((g * g).sum(1), 1e-9))[:, None] * g
                ok = near & (np.linalg.norm(step, axis=1) < 0.012)  # skip where f jumps (edges of a cut's region)
                P[ok] -= step[ok]
            idx = {v.index: k for k, v in enumerate(bv)}
            for _ in range(5):
                Q = P.copy()
                for k, v in enumerate(bv):
                    if not near[k]:
                        continue
                    nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                    nb = [idx[o.index] for o in nb if o.index in idx]
                    if len(nb) == 2:
                        Q[k] = 0.5 * P[k] + 0.25 * (P[nb[0]] + P[nb[1]])
                P = Q
            for k, v in enumerate(bv):
                if near[k]:
                    v.co = P[k]
    bm.to_mesh(ob.data); bm.free()
    ob.data.update()


def boundary_loops(ob):
    """The open edges of a garment as ordered point loops."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    edges = [e for e in bm.edges if e.is_boundary]
    adj = {}
    for e in edges:
        a, b = e.verts
        adj.setdefault(a.index, []).append(b.index); adj.setdefault(b.index, []).append(a.index)
    co = {v.index: np.array(v.co[:]) for v in bm.verts}
    bm.free()
    seen, loops = set(), []
    for s in adj:
        if s in seen:
            continue
        loop, prev, cur = [s], None, s
        seen.add(s)
        while True:
            nxt = [x for x in adj[cur] if x != prev and x not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur); loop.append(cur)
        if len(loop) > 8:
            loops.append(np.array([co[i] for i in loop]))
    return loops


def nearest_loop(loops, point):
    return min(loops, key=lambda lp: np.linalg.norm(lp.mean(0) - point))


def surface_tree(ob):
    """BVH of an object's own (rest) mesh: its outward face normals, without the thickness shell."""
    me = ob.data
    return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [p.vertices[:] for p in me.polygons])


def ribbon(name, surface, path, along, width, material, outward=0.0025, thickness=0.003, closed=True, uv_repeat=0.05):
    """
    A band lying on a surface (a garment, or the body for straps) along a path of points: collars, cuffs,
    waistbands, hems, plackets, straps. `along` is the band's direction across its width (a vector, or a function
    of the path points). Both edges are snapped onto the surface and lifted by `outward` along its normal.
    UVs: u runs along the band (one unit per uv_repeat metres), v across it (embroidery and rib textures).
    """
    path = np.asarray(path, float)
    if len(path) > 200:
        path = path[::len(path) // 160]
    if closed:
        path = np.vstack([path, path[:1]])
    d = along(path) if callable(along) else np.tile(np.array(along, float), (len(path), 1))
    tree = surface_tree(surface)
    rows = []
    for row in (path, path + d * width):
        snapped = []
        for p in row:
            loc, nrm, _i, _d = tree.find_nearest(Vector(p))
            snapped.append(p if loc is None else np.array(loc[:]) + np.array(nrm[:]) * outward)
        rows.append(np.array(snapped))
    k = len(path)
    faces = [[i, i + 1, k + i + 1, k + i] for i in range(k - 1)]
    ob = new_object(name, list(rows[0]) + list(rows[1]), faces, material)
    u = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]) / uv_repeat
    uv = ob.data.uv_layers.new(name='UVMap')
    for f, poly in zip(faces, ob.data.polygons):
        for li, vi in zip(poly.loop_indices, f):
            uv.data[li].uv = (u[vi % k], 0.0 if vi < k else 1.0)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    s = ob.modifiers.new('Thickness', 'SOLIDIFY'); s.thickness = thickness; s.offset = 0.0
    set_rest(ob)
    return ob


def opening_normal(loop, inside):
    """Outward normal of an opening (a loop of points): the plane normal pointing away from `inside`."""
    c = loop.mean(0)
    _u, _s, vt = np.linalg.svd(loop - c)
    n = vt[2]
    return n if n @ (c - inside) > 0 else -n


def set_rest(ob):
    """Store rest-pose positions ('rest' attribute): prints and weaves are mapped from it, so they stick to the
    cloth while it deforms."""
    me = ob.data
    if 'rest' in me.attributes:
        me.attributes.remove(me.attributes['rest'])
    a = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
    a.data.foreach_set('vector', np.array([v.co[:] for v in me.vertices]).ravel())


# ----------------------------------------------------------------------------- draping, skinning, finishing


def push_out(ob, surfaces, gap=0.004):
    """Move any cloth vertex that ended up inside (or within `gap` of) the body or a garment beneath back outside."""
    trees = [surface_tree(s) for s in surfaces]
    me = ob.data
    moved = 0
    for v in me.vertices:
        for t in trees:
            loc, nrm, _i, _d = t.find_nearest(v.co, 0.03)  # only surfaces right under this bit of cloth
            if loc is None:
                continue
            depth = (v.co - loc).dot(nrm)
            if depth < gap:
                v.co = loc + nrm * gap
                moved += 1
    me.update()
    return moved


def drape(ob, body, pin, frames=20, expand=0.0, bending=0.3, mass=0.25, under=()):
    """
    A short cloth simulation against the body: gravity settles the cloth and (with expand > 0) slack buckles into
    folds. pin(points) -> 0..1 holds the cloth where it hangs from (shoulders, waistbands). `under`: garments already
    worn beneath it, which it rests on too. Baked into the mesh.
    """
    P = np.array([v.co[:] for v in ob.data.vertices])
    vg = ob.vertex_groups.new(name='pin')
    w = pin(P)
    for i, x in enumerate(w):
        if x > 0:
            vg.add([i], float(min(1, x)), 'REPLACE')
    cols = []
    for other in (body,) + tuple(under):
        cols.append((other, other.modifiers.new('Collision', 'COLLISION')))
        other.collision.thickness_outer = 0.003 if other is body else 0.004
        other.collision.cloth_friction = 8
    cl = ob.modifiers.new('Cloth', 'CLOTH')
    s = cl.settings
    s.quality = 6
    s.mass = mass
    s.tension_stiffness = 12; s.compression_stiffness = 12; s.shear_stiffness = 6
    s.bending_stiffness = bending
    s.air_damping = 2.0
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 2.0
    s.shrink_min = -expand
    cs = cl.collision_settings
    cs.distance_min = 0.004
    cs.use_self_collision = False
    cl.point_cache.frame_start = 1
    cl.point_cache.frame_end = frames
    sc = bpy.context.scene
    for f in range(1, frames + 1):
        sc.frame_set(f)
    _apply_modifiers(ob)
    sc.frame_set(1)
    for other, col in cols:
        other.modifiers.remove(col)
    ob.vertex_groups.remove(ob.vertex_groups['pin'])
    push_out(ob, [body], gap=0.004)
    if under:
        push_out(ob, list(under), gap=0.003)


def _smooth_weights(ob, W, iterations):
    """Average weights over the cloth's own edges: smooth transitions (no boxy shoulders when the arms come down)."""
    if not iterations:
        return W
    me = ob.data
    e = np.array([ed.vertices[:] for ed in me.edges])
    deg = np.bincount(e.ravel(), minlength=len(W)).astype(float)[:, None]
    for _ in range(iterations):
        acc = np.zeros_like(W)
        np.add.at(acc, e[:, 0], W[e[:, 1]]); np.add.at(acc, e[:, 1], W[e[:, 0]])
        W = 0.5 * W + 0.5 * acc / np.maximum(deg, 1)
    return W


def skin(ob, B, arm, k=8, skirt_below=None, smooth=12):
    """
    Bone weights blended from the nearest body vertices. Below `skirt_below` (skirts, dresses, kaftans) the legs'
    weights are replaced by a pelvis/thigh mix, so the hem swings with the stride instead of splitting.
    """
    P = np.array([v.co[:] for v in ob.data.vertices])
    W = np.zeros((len(P), len(B.bone_names)))
    for i, p in enumerate(P):
        hits = B.kd.find_n(p, k)
        ws = np.array([1.0 / (d + 0.004) ** 2 for _c, _j, d in hits])
        js = [j for _c, j, _d in hits]
        W[i] = (ws[:, None] * B.W[js]).sum(0) / ws.sum()
    if skirt_below is not None:
        col = {b: i for i, b in enumerate(B.bone_names)}
        for i, p in enumerate(P):
            t = np.clip((skirt_below - p[2]) / 0.12, 0, 1)
            if t <= 0:
                continue
            s = np.clip(0.5 + p[0] / 0.24, 0, 1)
            target = np.zeros(len(B.bone_names))
            target[col['pelvis']] = 0.5; target[col['thigh_l']] = 0.5 * s; target[col['thigh_r']] = 0.5 * (1 - s)
            W[i] = (1 - t) * W[i] + t * target
    W = _smooth_weights(ob, W, smooth)
    W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
    for j, b in enumerate(B.bone_names):
        idx = np.nonzero(W[:, j] > 1e-3)[0]
        if len(idx):
            vg = ob.vertex_groups.new(name=b)
            for i in idx:
                vg.add([int(i)], float(W[i, j]), 'REPLACE')
    mhbody.bind(ob, arm)
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    # Smooth out skinning collapses around the shoulders and elbows relative to the rest shape (only there:
    # elsewhere it would pull fitted cloth into the body).
    cols = [B.bone_names.index(b) for b in ('clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r')]
    sw = np.clip(W[:, cols].sum(1) * 2, 0, 1)
    if sw.max() > 0.05:
        vg = ob.vertex_groups.new(name='smooth')
        for i in np.nonzero(sw > 0.02)[0]:
            vg.add([int(i)], float(sw[i]), 'REPLACE')
        cs = ob.modifiers.new('Corrective', 'CORRECTIVE_SMOOTH')
        cs.smooth_type = 'LENGTH_WEIGHTED'; cs.iterations = 6; cs.factor = 0.5; cs.rest_source = 'ORCO'
        cs.vertex_group = 'smooth'
        ob.modifiers.move(len(ob.modifiers) - 1, 1)


def finish(ob, material, thickness=0.003, subsurf=1):
    """Material, cloth thickness (shows at hems and cuffs) and a render-time smoothing level."""
    if material:
        ob.data.materials.clear(); ob.data.materials.append(material)
    s = ob.modifiers.new('Thickness', 'SOLIDIFY'); s.thickness = thickness; s.offset = -1.0
    if subsurf:
        sub = ob.modifiers.new('Sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = subsurf


def hide_under(h, clothes, reach=0.15, keep_rings=3):
    """
    Mask out body skin that a garment really covers (so skin never pokes through while moving): a vertex is
    covered when a ray out along its normal hits a garment within `reach`; the covered area is then shrunk by
    `keep_rings` edge rings so the skin just inside every opening stays.
    """
    body = h['body']
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(ob, dg) for ob in clothes]
    n = len(body.data.vertices)
    covered = np.zeros(n, bool)
    for v in body.data.vertices:
        co = body.matrix_world @ v.co
        nrm = (body.matrix_world.to_3x3() @ v.normal).normalized()
        for t in trees:
            if t.ray_cast(co, nrm, reach)[0] is not None:
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
