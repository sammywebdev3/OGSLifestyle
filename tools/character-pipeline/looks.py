"""
Appearance for the prototype characters: skin, eyes, face masks, hair and clothing, all modelled and shaded
here (procedural materials, no image textures except MakeHuman's CC0 iris), plus posing helpers.

Clothes and hair are shells built from the body's own surface (or MakeHuman's tights/skirt helper
meshes), pushed outwards, then skinned by copying the nearest body weights, so they deform with the
same skeleton.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Quaternion, Vector

import mhbody

# ----------------------------------------------------------------------------- materials


# Mix nodes (data_type RGBA): inputs[0] = Factor, inputs[6] / [7] = colour A / B, outputs[2] = colour result.
# (inputs['A'] would return the float socket.)


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    return nt, nt.nodes, nt.links


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def skin_material(name, tone, lip, brow):
    """Skin: subsurface scattering, pores, tinted lips and darker brows from vertex-colour masks."""
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    bsdf = n['Principled BSDF']
    masks = n.new('ShaderNodeVertexColor'); masks.layer_name = 'face'
    sep = n.new('ShaderNodeSeparateColor'); l.new(masks.outputs['Color'], sep.inputs['Color'])
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 60; noise.inputs['Detail'].default_value = 6
    var = n.new('ShaderNodeMix'); var.data_type = 'RGBA'; var.blend_type = 'MULTIPLY'
    var.inputs['Factor'].default_value = 0.12
    var.inputs[6].default_value = srgb(tone)
    l.new(noise.outputs['Color'], var.inputs[7])
    lips = n.new('ShaderNodeMix'); lips.data_type = 'RGBA'
    l.new(sep.outputs['Red'], lips.inputs['Factor']); l.new(var.outputs[2], lips.inputs[6]); lips.inputs[7].default_value = srgb(lip)
    brows = n.new('ShaderNodeMix'); brows.data_type = 'RGBA'
    bnoise = n.new('ShaderNodeTexNoise'); bnoise.inputs['Scale'].default_value = 900
    bmul = n.new('ShaderNodeMath'); bmul.operation = 'MULTIPLY'
    l.new(sep.outputs['Green'], bmul.inputs[0]); l.new(bnoise.outputs['Fac'], bmul.inputs[1])
    bclamp = n.new('ShaderNodeMath'); bclamp.operation = 'MULTIPLY'; bclamp.use_clamp = True; bclamp.inputs[1].default_value = 1.8
    l.new(bmul.outputs[0], bclamp.inputs[0])
    l.new(bclamp.outputs[0], brows.inputs['Factor']); l.new(lips.outputs[2], brows.inputs[6]); brows.inputs[7].default_value = srgb(brow)
    # Blue: scalp under the hair (dense hair reads as a dark, finely textured surface between the strands).
    scalp = n.new('ShaderNodeMix'); scalp.data_type = 'RGBA'
    snoise = n.new('ShaderNodeTexNoise'); snoise.inputs['Scale'].default_value = 1600
    smul = n.new('ShaderNodeMath'); smul.operation = 'MULTIPLY'
    l.new(sep.outputs['Blue'], smul.inputs[0])
    sjit = n.new('ShaderNodeMapRange'); sjit.inputs['To Min'].default_value = 0.75; sjit.inputs['To Max'].default_value = 1.2
    l.new(snoise.outputs['Fac'], sjit.inputs['Value']); l.new(sjit.outputs['Result'], smul.inputs[1])
    sclamp = n.new('ShaderNodeMath'); sclamp.operation = 'MULTIPLY'; sclamp.use_clamp = True; sclamp.inputs[1].default_value = 1.0
    l.new(smul.outputs[0], sclamp.inputs[0])
    l.new(sclamp.outputs[0], scalp.inputs['Factor']); l.new(brows.outputs[2], scalp.inputs[6]); scalp.inputs[7].default_value = srgb('#0d0907')
    l.new(scalp.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Subsurface Weight'].default_value = 0.3
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.4, 0.25)
    bsdf.inputs['Subsurface Scale'].default_value = 0.012
    rough = n.new('ShaderNodeMapRange'); rough.inputs['To Min'].default_value = 0.5; rough.inputs['To Max'].default_value = 0.64
    l.new(noise.outputs['Fac'], rough.inputs['Value']); l.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    bsdf.inputs['Specular IOR Level'].default_value = 0.32
    pores = n.new('ShaderNodeTexNoise'); pores.inputs['Scale'].default_value = 1400
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.06; bump.inputs['Distance'].default_value = 0.0008
    l.new(pores.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def eye_material(texture):
    mat = bpy.data.materials.new('eyes')
    nt, n, l = _nodes(mat)
    bsdf = n['Principled BSDF']
    tex = n.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(texture)
    l.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.06
    bsdf.inputs['Coat Weight'].default_value = 1.0
    bsdf.inputs['Coat Roughness'].default_value = 0.02
    return mat


def flat_material(name, color, roughness=0.6, sheen=0.0, metallic=0.0):
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Metallic'].default_value = metallic
    return mat


def hair_material(name, color, coil_scale=180.0, sheen=0.25):
    """Coily hair: dark base, fine noise bump for curls, sheen for the soft fuzzy edge."""
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = coil_scale; noise.inputs['Detail'].default_value = 8; noise.inputs['Roughness'].default_value = 0.7
    col = n.new('ShaderNodeMix'); col.data_type = 'RGBA'
    col.inputs[6].default_value = srgb(color); col.inputs[7].default_value = srgb('#3a2a20')
    l.new(noise.outputs['Fac'], col.inputs['Factor'])
    pow_ = n.new('ShaderNodeMath'); pow_.operation = 'POWER'; pow_.inputs[1].default_value = 3
    l.new(noise.outputs['Fac'], pow_.inputs[0]); l.new(pow_.outputs[0], col.inputs['Factor'])
    l.new(col.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.78
    b.inputs['Specular IOR Level'].default_value = 0.25
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Tint'].default_value = srgb('#4a3428')
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.9
    l.new(noise.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


def cornrow_material(name, color, rows=14):
    """Cornrows: raised braided rows running front to back, each braid with a twisted bump pattern."""
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    coord = n.new('ShaderNodeTexCoord')
    wave = n.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    wave.inputs['Scale'].default_value = rows; wave.inputs['Distortion'].default_value = 0.6
    l.new(coord.outputs['Object'], wave.inputs['Vector'])
    twist = n.new('ShaderNodeTexWave'); twist.wave_type = 'BANDS'; twist.bands_direction = 'DIAGONAL'; twist.inputs['Scale'].default_value = rows * 6
    l.new(coord.outputs['Object'], twist.inputs['Vector'])
    h = n.new('ShaderNodeMath'); h.operation = 'MULTIPLY'
    l.new(wave.outputs['Fac'], h.inputs[0]); l.new(twist.outputs['Fac'], h.inputs[1])
    col = n.new('ShaderNodeMix'); col.data_type = 'RGBA'
    col.inputs[6].default_value = srgb('#1a0f0b'); col.inputs[7].default_value = srgb(color)
    l.new(wave.outputs['Fac'], col.inputs['Factor'])
    l.new(col.outputs[2], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.62
    b.inputs['Specular IOR Level'].default_value = 0.3
    b.inputs['Sheen Weight'].default_value = 0.1
    b.inputs['Sheen Tint'].default_value = srgb('#4a3428')
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 1.0
    l.new(h.outputs[0], bump.inputs['Height']); l.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


# ----------------------------------------------------------------------------- face masks


def target_mask(target_path, remap, n_verts):
    """Per body vertex 0..1: how far this target moves it (normalised): a soft region mask."""
    idx, d = mhbody.read_target(target_path)
    m = np.zeros(n_verts)
    if len(idx) == 0:
        return m
    mag = np.linalg.norm(d, axis=1)
    mag = mag / mag.max()
    for i, v in zip(idx, mag):
        j = remap.get(int(i))
        if j is not None:
            m[j] = max(m[j], v)
    return m


def paint_face_masks(h, targets_dir, beard=0.0):
    """Vertex colours 'face': R = lips, G = brows (+ optional beard shadow)."""
    body = h['body']; remap = h['remap']; nv = len(body.data.vertices)
    t = lambda rel: target_mask(os.path.join(targets_dir, rel), remap, nv)
    lips = np.clip(np.maximum(t('mouth/mouth-upperlip-volume-incr.target'), t('mouth/mouth-lowerlip-volume-incr.target')) * 1.6 - 0.35, 0, 1)
    # The brow target moves a wide area; keep the band just above the eyes, strongest at its centre line.
    eye_top = max(v.co.z for v in h['eyes'].data.vertices)
    z = np.array([v.co.z for v in body.data.vertices])
    x = np.array([v.co.x for v in body.data.vertices])
    ax = np.abs(x)
    arch = eye_top + 0.012 + 0.006 * np.clip(1 - np.abs(ax - 0.035) / 0.03, 0, 1)  # highest above the outer iris
    band = np.clip(1 - np.abs(z - arch) / 0.006, 0, 1) * np.clip((ax - 0.011) / 0.006, 0, 1) * np.clip((0.068 - ax) / 0.012, 0, 1)
    brows = np.clip(t('eyebrows/eyebrows-trans-up.target') * 1.8 - 0.2, 0, 1) * band
    col = body.data.color_attributes.new('face', 'FLOAT_COLOR', 'POINT')
    for i in range(nv):
        col.data[i].color = (float(lips[i]), float(brows[i]), 0.0, 1.0)


def set_scalp_mask(h, values):
    col = h['body'].data.color_attributes['face']
    for i, v in enumerate(values):
        r, g, _, a = col.data[i].color
        col.data[i].color = (r, g, float(v), a)


# ----------------------------------------------------------------------------- shells (hair, clothes)


def _weights_of(ob, names):
    """Sum of vertex weights in the named groups, per vertex."""
    idx = {ob.vertex_groups[n].index for n in names if n in ob.vertex_groups}
    out = np.zeros(len(ob.data.vertices))
    for v in ob.data.vertices:
        out[v.index] = sum(g.weight for g in v.groups if g.group in idx)
    return out


def head_frame(h):
    """Centre of the skull, and landmark heights used for hairlines."""
    body = h['body']
    w = _weights_of(body, ['head'])
    pts = np.array([v.co[:] for v in body.data.vertices])
    head = pts[w > 0.98]
    c = Vector(((head[:, 0].min() + head[:, 0].max()) / 2, (head[:, 1].min() + head[:, 1].max()) / 2, (head[:, 2].min() + head[:, 2].max()) / 2))
    return c, head[:, 2].min(), head[:, 2].max(), head[:, 1].min()


def shell_from_body(h, name, select, offset, material, bone_weights=True, smooth=2, density=None):
    """
    Duplicate the body faces with any vertex passing select(index, co) and push them out along the
    normals by offset(index, co) metres. With density(index, co) in 0..1, the offset is scaled by it and
    it is stored as the colour attribute 'coverage' (materials fade out where it is low: soft edges;
    not 'density', which Cycles reserves for volumes).
    Returns the new object (skinned like the body).
    """
    body = h['body']
    me = body.data
    keep = [p for p in me.polygons if any(select(i, me.vertices[i].co) for i in p.vertices)]
    used = sorted({i for p in keep for i in p.vertices})
    remap = {o: k for k, o in enumerate(used)}
    nm = bpy.data.meshes.new(name)
    dens = [density(i, me.vertices[i].co) if density else 1.0 for i in used]
    verts = [(me.vertices[i].co + me.vertices[i].normal * offset(i, me.vertices[i].co) * max(d, 0.15))[:] for i, d in zip(used, dens)]
    nm.from_pydata(verts, [], [[remap[i] for i in p.vertices] for p in keep])
    if density:
        ca = nm.color_attributes.new('coverage', 'FLOAT_COLOR', 'POINT')
        for k, d in enumerate(dens):
            ca.data[k].color = (d, d, d, 1.0)
    uv = nm.uv_layers.new(name='UVMap'); src = me.uv_layers[0].data; k = 0
    for p in keep:
        for li in p.loop_indices:
            uv.data[k].uv = src[li].uv; k += 1
    for p in nm.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, nm)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(material)
    if smooth:
        sm = ob.modifiers.new('Smooth', 'SMOOTH'); sm.iterations = smooth; sm.factor = 0.5
    if bone_weights:
        for vg in body.vertex_groups:
            ob.vertex_groups.new(name=vg.name)
        for i in used:
            for g in me.vertices[i].groups:
                ob.vertex_groups[body.vertex_groups[g.group].name].add([remap[i]], g.weight, 'REPLACE')
    mhbody.bind(ob, h['armature'])
    ob.modifiers.move(len(ob.modifiers) - 1, 0)  # deform first, then smooth
    return ob


def shell_from_helper(h, group, name, offset, material, keep_face=None, smooth=2):
    """A shell from one of MakeHuman's helper meshes (tights, skirt), skinned with the rig's own weights."""
    base, verts = h['base'], h['verts']
    faces = [f for f in base.faces[group] if keep_face is None or keep_face([verts[i] for i in f[0]])]
    ob, remap = mhbody.make_mesh(name, verts, faces, base.uvs)
    me = ob.data
    me.update()
    for v in me.vertices:
        v.co += v.normal * offset(v.co)
    for bone, pairs in h['weights'].items():
        vg = ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
        for idx, wt in pairs:
            if idx in remap:
                vg.add([remap[idx]], wt, 'REPLACE')
    ob.data.materials.append(material)
    if smooth:
        sm = ob.modifiers.new('Smooth', 'SMOOTH'); sm.iterations = smooth; sm.factor = 0.5
    mhbody.bind(ob, h['armature'])
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    return ob


def rigid_on_bone(ob, h, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    mhbody.bind(ob, h['armature'])


def scalp_density(h, hairline_front, hairline_side, hairline_back, ears, band=0.016):
    """
    Hair density 0..1 over the head: 1 above a hairline that is high at the forehead, lower over the
    ears and low at the nape, fading to 0 across `band` metres below it (a natural, soft hairline).
    Returns (select, density, skull centre).
    """
    c, zmin, zmax, ymin = head_frame(h)
    wh = _weights_of(h['body'], ['head', 'neck_01'])

    def line(co):
        a = abs(math.atan2(co.x - c.x, -(co.y - c.y))) / math.pi  # 0 = front (-Y), 1 = back
        if a < 0.35:
            return hairline_front + (hairline_side - hairline_front) * (a / 0.35) ** 2
        return hairline_side + (hairline_back - hairline_side) * ((a - 0.35) / 0.65)

    def density(i, co):
        if wh[i] < 0.6 or ears[i] > 0.05:
            return 0.0
        t = (co.z - (c.z + line(co))) / band + 1.0
        t = max(0.0, min(1.0, t))
        return t * t * (3 - 2 * t)

    return (lambda i, co: density(i, co) > 0.0), density, c


def with_density_alpha(mat):
    """Fade a material out where the mesh's 'coverage' attribute is low (soft hairlines and edges)."""
    nt = mat.node_tree; n = nt.nodes; l = nt.links
    out = n['Material Output']
    shader = out.inputs['Surface'].links[0].from_socket
    attr = n.new('ShaderNodeAttribute'); attr.attribute_name = 'coverage'
    sep = n.new('ShaderNodeSeparateColor'); l.new(attr.outputs['Color'], sep.inputs['Color'])
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 900
    edge = n.new('ShaderNodeMath'); edge.operation = 'MULTIPLY'
    l.new(sep.outputs['Red'], edge.inputs[0])
    jitter = n.new('ShaderNodeMapRange'); jitter.inputs['To Min'].default_value = 0.55; jitter.inputs['To Max'].default_value = 1.45
    l.new(noise.outputs['Fac'], jitter.inputs['Value']); l.new(jitter.outputs['Result'], edge.inputs[1])
    clamp = n.new('ShaderNodeMath'); clamp.operation = 'MULTIPLY'; clamp.use_clamp = True; clamp.inputs[1].default_value = 1.0
    l.new(edge.outputs[0], clamp.inputs[0])
    mixs = n.new('ShaderNodeMixShader'); tr = n.new('ShaderNodeBsdfTransparent')
    l.new(clamp.outputs[0], mixs.inputs['Fac']); l.new(tr.outputs[0], mixs.inputs[1]); l.new(shader, mixs.inputs[2])
    l.new(mixs.outputs[0], out.inputs['Surface'])
    return mat


def ears_mask(h, targets_dir):
    return target_mask(os.path.join(targets_dir, 'ears/r-ear-scale-incr.target'), h['remap'], len(h['body'].data.vertices)) + \
        target_mask(os.path.join(targets_dir, 'ears/l-ear-scale-incr.target'), h['remap'], len(h['body'].data.vertices))


def hair_bsdf(name, melanin=1.0, redness=0.3, roughness=0.5):
    """Physically based hair (Cycles Principled Hair, melanin model): black-brown with a soft sheen."""
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    for node in list(n):
        if node.type == 'BSDF_PRINCIPLED':
            n.remove(node)
    hb = n.new('ShaderNodeBsdfHairPrincipled')
    hb.parametrization = 'MELANIN'
    hb.inputs['Melanin'].default_value = melanin
    hb.inputs['Melanin Redness'].default_value = redness
    hb.inputs['Roughness'].default_value = roughness
    hb.inputs['Radial Roughness'].default_value = 0.7
    hb.inputs['Coat'].default_value = 0.0
    hb.inputs['Random Roughness'].default_value = 0.2
    l.new(hb.outputs[0], n['Material Output'].inputs['Surface'])
    return mat


def _weight_group(ob, name, weights):
    vg = ob.vertex_groups.get(name) or ob.vertex_groups.new(name=name)
    for i, w in enumerate(weights):
        if w > 1e-4:
            vg.add([i], float(min(1.0, w)), 'REPLACE')
    return vg


def particle_hair(h, name, density, length, count, max_len, material, curl=0.0, curl_freq=60.0, clump=0.0, children=24,
                  root=0.0012, tip=0.0004, rough=0.002, normal=1.0):
    """
    Real hair strands grown from the body (so they move with the skeleton): density and length are
    0..1 per body vertex. curl > 0 makes coily strands (kink CURL), clump gathers them into coils.
    """
    body = h['body']
    nv = len(body.data.vertices)
    dens = [density(i, body.data.vertices[i].co) for i in range(nv)]
    lens = [length(i, body.data.vertices[i].co) * d ** 0.5 for i, d in zip(range(nv), dens)]
    _weight_group(body, f'{name}-density', dens)
    _weight_group(body, f'{name}-length', lens)
    body.data.materials.append(material)
    mod = body.modifiers.new(name, 'PARTICLE_SYSTEM')
    ps = mod.particle_system
    st = ps.settings
    st.name = name
    st.type = 'HAIR'
    # Advanced hair would take the strand length from the emission velocity; simple mode uses hair_length.
    st.use_advanced_hair = False
    st.count = count
    st.hair_length = max_len
    st.emit_from = 'FACE'
    st.use_emit_random = True
    st.material_slot = material.name
    st.child_type = 'INTERPOLATED'
    st.child_percent = 6
    st.rendered_child_count = children
    st.child_length = 1.0
    st.clump_factor = clump
    st.roughness_1 = rough
    st.roughness_1_size = 0.02
    st.root_radius = root
    st.tip_radius = tip
    st.radius_scale = 1.0
    st.use_close_tip = True
    if curl > 0:
        st.kink = 'CURL'
        st.kink_amplitude = curl
        st.kink_frequency = curl_freq
        st.kink_shape = 0.0
    st.display_step = 4
    st.render_step = 5
    ps.vertex_group_density = f'{name}-density'
    ps.vertex_group_length = f'{name}-length'
    return mod


def hair_fade(h, targets_dir, melanin=0.98):
    """A low cut with a skin fade: about 9 mm of tight coils on top, tapering to stubble at the sides."""
    sel, dens, c = scalp_density(h, 0.072, 0.045, -0.02, ears_mask(h, targets_dir), band=0.012)
    _, zmin, zmax, _ = head_frame(h)
    top = lambda i, co: 0.12 + 0.88 * max(0.0, min(1.0, (co.z - c.z - 0.03) / (zmax - c.z - 0.03))) ** 1.4
    body = h['body']
    set_scalp_mask(h, [dens(i, v.co) * (0.55 + 0.45 * top(i, v.co)) for i, v in enumerate(body.data.vertices)])
    particle_hair(h, 'hair', dens, top, 14000, 0.008, hair_bsdf('hair', melanin), curl=0.0012, curl_freq=120, clump=0.45, children=40,
                  root=0.00022, tip=0.0001)
    return None


def hair_afro(h, targets_dir, melanin=0.97, size=0.07):
    """A rounded afro: dense coily strands, longest on the crown so the outline is round."""
    sel, dens, c = scalp_density(h, 0.07, 0.035, -0.035, ears_mask(h, targets_dir), band=0.01)
    _, zmin, zmax, _ = head_frame(h)
    top = lambda i, co: 0.55 + 0.45 * max(0.0, min(1.0, (co.z - c.z) / (zmax - c.z))) ** 0.8
    set_scalp_mask(h, [dens(i, v.co) for i, v in enumerate(h['body'].data.vertices)])
    particle_hair(h, 'hair', dens, top, 16000, size, hair_bsdf('hair', melanin), curl=0.005, curl_freq=90, clump=0.55, children=60,
                  root=0.0003, tip=0.00015, rough=0.004)
    return None


def hair_cornrows_bun(h, targets_dir, color='#1c110c'):
    """Cornrows (braided rows close to the scalp) gathered into a high braided bun."""
    sel, dens, c = scalp_density(h, 0.07, 0.04, -0.03, ears_mask(h, targets_dir), band=0.006)
    _, zmin, zmax, _ = head_frame(h)
    rows = shell_from_body(h, 'hair', sel, lambda i, co: 0.004, with_density_alpha(cornrow_material('cornrows', color)), density=dens)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.052, location=(c.x, c.y + 0.065, zmax - 0.0), segments=32, ring_count=16)
    bun = bpy.context.active_object
    bun.name = 'bun'
    bun.scale = (1.0, 0.95, 0.85)
    bun.data.materials.append(cornrow_material('bun-braid', color, rows=26))
    for p in bun.data.polygons:
        p.use_smooth = True
    rigid_on_bone(bun, h, 'head')
    return [rows, bun]


def brows_and_beard(h, targets_dir, beard=0.0, melanin=0.98):
    """Eyebrow hairs (short, dense, lying close) and an optional short beard, from the face masks."""
    body = h['body']
    col = body.data.color_attributes['face']
    brows = [col.data[i].color[1] for i in range(len(body.data.vertices))]
    particle_hair(h, 'brows', lambda i, co: min(1.0, brows[i] * 0.9), lambda i, co: 1.0, 1500, 0.003, hair_bsdf('brows', melanin),
                  children=8, root=0.00012, tip=0.00006)
    if beard > 0:
        T = targets_dir
        nv = len(body.data.vertices)
        jaw = np.clip(target_mask(os.path.join(T, 'chin/chin-prognathism-incr.target'), h['remap'], nv) * 1.6 - 0.35, 0, 1)
        lips = np.array([col.data[i].color[0] for i in range(nv)])
        particle_hair(h, 'beard', lambda i, co: float(jaw[i] * (1 - lips[i]) * beard), lambda i, co: 1.0, 4000, 0.004,
                      hair_bsdf('beard', melanin), curl=0.0008, curl_freq=120, children=12, root=0.00015, tip=0.00007)


def fila(h, targets_dir, color='#3a4fb0', trim='#f2b632'):
    """A Yoruba fila: a soft cap with its crown folded over to one side."""
    sel, dens, c = scalp_density(h, 0.03, 0.005, -0.02, ears_mask(h, targets_dir), band=0.004)
    _, zmin, zmax, _ = head_frame(h)

    def off(i, co):
        up = max(0.0, (co.z - c.z) / (zmax - c.z))
        return 0.007 + 0.012 * up
    cap = shell_from_body(h, 'fila', lambda i, co: dens(i, co) > 0.5, off, fabric_material('fila', color, pattern='plain'), smooth=6)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.068, location=(c.x + 0.035, c.y + 0.005, zmax - 0.012), segments=32, ring_count=16)
    fold = bpy.context.active_object; fold.name = 'fila-fold'
    fold.scale = (1.05, 1.0, 0.32); fold.rotation_euler = (0, math.radians(-28), 0)
    fold.data.materials.append(cap.data.materials[0])
    for p in fold.data.polygons:
        p.use_smooth = True
    rigid_on_bone(fold, h, 'head')
    return [cap, fold]


# ----------------------------------------------------------------------------- fabrics


def fabric_material(name, color, pattern='plain', accent='#ffffff', accent2='#000000', roughness=0.75, sheen=0.15, weave=1600, trim=None):
    """
    Cloth: woven bump, sheen, and a print. Patterns (in UV space of the garment):
      plain, denim, jersey (side panels + collar trim), ankara (bold wax-print circles and waves),
      adire (indigo tie-dye: blotchy resist circles).
    """
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    uv = n.new('ShaderNodeTexCoord')
    base = srgb(color)
    out_col = None
    if pattern == 'plain':
        rgb = n.new('ShaderNodeRGB'); rgb.outputs[0].default_value = base; out_col = rgb.outputs[0]
    elif pattern == 'denim':
        noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 18; noise.inputs['Detail'].default_value = 4
        l.new(uv.outputs['UV'], noise.inputs['Vector'])
        mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        mix.inputs[6].default_value = base; mix.inputs[7].default_value = srgb('#7f9cc4')
        ramp = n.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = 0.45; ramp.inputs['From Max'].default_value = 0.8
        ramp.inputs['To Max'].default_value = 0.45
        l.new(noise.outputs['Fac'], ramp.inputs['Value']); l.new(ramp.outputs['Result'], mix.inputs['Factor'])
        out_col = mix.outputs[2]
    elif pattern == 'jersey':
        sep = n.new('ShaderNodeSeparateXYZ'); l.new(uv.outputs['Object'], sep.inputs['Vector'])
        absx = n.new('ShaderNodeMath'); absx.operation = 'ABSOLUTE'; l.new(sep.outputs['X'], absx.inputs[0])
        side = n.new('ShaderNodeMath'); side.operation = 'GREATER_THAN'; side.inputs[1].default_value = 9.0  # (no side panels)
        l.new(absx.outputs[0], side.inputs[0])
        chev = n.new('ShaderNodeTexWave'); chev.wave_type = 'BANDS'; chev.inputs['Scale'].default_value = 9; chev.inputs['Distortion'].default_value = 0
        l.new(uv.outputs['Object'], chev.inputs['Vector'])
        chevt = n.new('ShaderNodeMath'); chevt.operation = 'GREATER_THAN'; chevt.inputs[1].default_value = 0.72
        l.new(chev.outputs['Fac'], chevt.inputs[0])
        m1 = n.new('ShaderNodeMix'); m1.data_type = 'RGBA'
        m1.inputs[6].default_value = base; m1.inputs[7].default_value = srgb(accent2)
        l.new(chevt.outputs[0], m1.inputs['Factor'])
        m2 = n.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.inputs[7].default_value = srgb(accent)
        l.new(side.outputs[0], m2.inputs['Factor']); l.new(m1.outputs[2], m2.inputs[6])
        out_col = m2.outputs[2]
        roughness = 0.45; sheen = 0.15
    elif pattern == 'ankara':
        mapping = n.new('ShaderNodeMapping'); mapping.inputs['Scale'].default_value = (9, 9, 9)
        l.new(uv.outputs['UV'], mapping.inputs['Vector'])
        vor = n.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'
        l.new(mapping.outputs['Vector'], vor.inputs['Vector'])
        vor2 = n.new('ShaderNodeTexVoronoi'); l.new(mapping.outputs['Vector'], vor2.inputs['Vector'])
        ring = n.new('ShaderNodeMath'); ring.operation = 'PINGPONG'; ring.inputs[1].default_value = 0.12
        l.new(vor2.outputs['Distance'], ring.inputs[0])
        ringt = n.new('ShaderNodeMath'); ringt.operation = 'GREATER_THAN'; ringt.inputs[1].default_value = 0.08
        l.new(ring.outputs[0], ringt.inputs[0])
        edge = n.new('ShaderNodeMath'); edge.operation = 'LESS_THAN'; edge.inputs[1].default_value = 0.06
        l.new(vor.outputs['Distance'], edge.inputs[0])
        m1 = n.new('ShaderNodeMix'); m1.data_type = 'RGBA'; m1.inputs[6].default_value = base; m1.inputs[7].default_value = srgb(accent)
        l.new(ringt.outputs[0], m1.inputs['Factor'])
        m2 = n.new('ShaderNodeMix'); m2.data_type = 'RGBA'; m2.inputs[7].default_value = srgb(accent2)
        l.new(edge.outputs[0], m2.inputs['Factor']); l.new(m1.outputs[2], m2.inputs[6])
        out_col = m2.outputs[2]
        roughness = 0.6; sheen = 0.2
    elif pattern == 'adire':
        mapping = n.new('ShaderNodeMapping'); mapping.inputs['Scale'].default_value = (16, 16, 16)
        l.new(uv.outputs['UV'], mapping.inputs['Vector'])
        vor = n.new('ShaderNodeTexVoronoi'); l.new(mapping.outputs['Vector'], vor.inputs['Vector'])
        noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 40
        l.new(mapping.outputs['Vector'], noise.inputs['Vector'])
        add = n.new('ShaderNodeMath'); l.new(vor.outputs['Distance'], add.inputs[0])
        sc = n.new('ShaderNodeMath'); sc.operation = 'MULTIPLY'; sc.inputs[1].default_value = 0.18
        l.new(noise.outputs['Fac'], sc.inputs[0]); l.new(sc.outputs[0], add.inputs[1])
        ramp = n.new('ShaderNodeMapRange'); ramp.inputs['From Min'].default_value = 0.30; ramp.inputs['From Max'].default_value = 0.33
        l.new(add.outputs[0], ramp.inputs['Value'])
        m = n.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.inputs[6].default_value = srgb(accent); m.inputs[7].default_value = base
        l.new(ramp.outputs['Result'], m.inputs['Factor'])
        out_col = m.outputs[2]
    if trim:
        tr = n.new('ShaderNodeAttribute'); tr.attribute_name = 'trim'
        tm = n.new('ShaderNodeMix'); tm.data_type = 'RGBA'; tm.inputs[7].default_value = srgb(trim)
        l.new(tr.outputs['Fac'], tm.inputs['Factor']); l.new(out_col, tm.inputs[6])
        out_col = tm.outputs[2]
    l.new(out_col, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Roughness'].default_value = 0.5
    b.inputs['Sheen Tint'].default_value = tuple(min(1.0, x * 3 + 0.15) for x in base[:3]) + (1.0,)
    wv = n.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.inputs['Scale'].default_value = weave
    folds = n.new('ShaderNodeTexNoise'); folds.inputs['Scale'].default_value = 6; folds.inputs['Detail'].default_value = 3
    l.new(uv.outputs['Object'], folds.inputs['Vector'])
    add = n.new('ShaderNodeMath'); l.new(wv.outputs['Fac'], add.inputs[0])
    fs = n.new('ShaderNodeMath'); fs.operation = 'MULTIPLY'; fs.inputs[1].default_value = 6.0
    l.new(folds.outputs['Fac'], fs.inputs[0]); l.new(fs.outputs[0], add.inputs[1])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.002
    l.new(add.outputs[0], bump.inputs['Height']); l.new(bump.outputs['Normal'], b.inputs['Normal'])
    return mat


# ----------------------------------------------------------------------------- posing


def pose_bone_rot(arm, bone, axis, degrees):
    """Rotate a pose bone about an armature-space axis (as the bone sits in rest pose), on top of its current pose."""
    pb = arm.pose.bones[bone]
    rest = arm.data.bones[bone].matrix_local.to_3x3()
    q = Quaternion(Vector(axis).normalized(), math.radians(degrees))
    local = (rest.inverted() @ q.to_matrix() @ rest).to_quaternion()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = local @ pb.rotation_quaternion


def aim(arm, bone, direction, twist=0.0):
    """Rotate a pose bone (about its head) so it points along an armature-space direction."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    m = pb.matrix.copy()
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    if twist:
        q = Quaternion(Vector(direction).normalized(), math.radians(twist)) @ q
    rot = (q.to_matrix() @ m.to_3x3()).to_4x4()
    rot.translation = m.translation
    pb.matrix = rot
    bpy.context.view_layer.update()


def relaxed(arm, female=False):
    """From MakeHuman's A-pose to a natural standing pose: arms hanging by the sides, elbows softly bent."""
    for side, sgn in (('l', 1), ('r', -1)):
        aim(arm, f'upperarm_{side}', (0.16 * sgn, 0.03, -1.0))
        aim(arm, f'lowerarm_{side}', (0.07 * sgn, -0.16, -1.0))
        aim(arm, f'hand_{side}', (0.03 * sgn, -0.08, -1.0))
        # Legs: from the A-pose's wide stance to feet about hip-width apart.
        aim(arm, f'thigh_{side}', (0.035 * sgn, -0.01, -1.0))
        aim(arm, f'calf_{side}', (0.0, 0.03, -1.0))
    pose_bone_rot(arm, 'spine_03', (1, 0, 0), -2)
    pose_bone_rot(arm, 'head', (1, 0, 0), 3)


def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
