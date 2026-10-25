"""
Isometric sprite frames for one character configuration: 8 facing directions x (8 walk + 4 idle) frames, rendered
with an orthographic camera at the game's 2:1 isometric elevation (30 degrees), a sun matching the world (shadows
fall to the lower right on screen) plus a soft rim light, and a shadow-catcher ground plane (the contact shadow is
part of the frame).

Every direction orbits the same point: the middle of the feet in the standing pose. That point lands on the frame's
anchor pixel in every direction, so turning never makes the character jump; <tag>-anchors.json records where the
feet, the pelvis and the top of the head land in each direction and frame (checked by tools/check_anchors.py).

The walk and idle cycles are authored here (procedural keyframes on the game_engine rig), not motion capture.

Usage:  python sprites.py -- <body> [outfit] [hair]          (env MH_DATA, MPFB_DATA, OUT_DIR, SAMPLES, ONLY, LAYERS)
LAYERS: 'full' (default: the whole character in one image) or any of body,outfit,hair (and 'base': only the neutral
base clothing of the body layer, for check_layers.py --base). Layers are rendered with the
other parts as holdouts, so the game can stack body + outfit + hair (in that order) and get the same picture, and
mix any outfit or hairstyle with any body of the same build without rendering every combination.

Output frames: <OUT_DIR>/<tag>-frames/<direction>-<column>.png, with tag:
  full: <body> (own outfit and hair) or <body>+<outfit>+<hair>; layers: body-<body>, outfit-<outfit>.<body>,
  hair-<hair>.<body>. Direction k: the camera sits at azimuth k*45 degrees; on screen the character faces
  (-sin a, cos a / 2) (x right, y down).
"""
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import characters  # noqa: E402
import looks  # noqa: E402
import studio  # noqa: E402

# Frame layout in world pixels (the game draws at 1/RES); feet at (AX, AY).
FW, FH, AX, AY = 84, 88, 32, 78
PX_PER_M = 33.0           # ~1.75 m person -> ~56 px tall on screen, same as the painted sprites
ELEV = math.radians(30)   # 2:1 isometric
RES = 2                   # texels per world pixel in the final HD atlas
SUPER = 2                 # render at RES*SUPER and downscale (cleaner hair and edges)
WALK, IDLE = 8, 4


def gait(arm, female, phase):
    """Walk pose at phase 0..1 on top of the relaxed pose. Left foot passes under the body at phase 0."""
    s, c = math.sin(2 * math.pi * phase), math.cos(2 * math.pi * phase)
    rot = looks.pose_bone_rot
    for side, sgn in (('l', 1), ('r', -1)):
        ls, lc = sgn * s, sgn * c
        swing = max(0.0, lc)  # this leg is swinging forward
        rot(arm, f'thigh_{side}', (1, 0, 0), -19 * ls)                       # + is backwards
        knee = 5 + 38 * swing ** 2 + 6 * max(0.0, -ls)                     # flexed in swing, a little at push-off
        rot(arm, f'calf_{side}', (1, 0, 0), knee)
        rot(arm, f'foot_{side}', (1, 0, 0), 19 * ls - knee * 0.6 - 8 * max(0.0, ls) ** 2)
        rot(arm, f'upperarm_{side}', (1, 0, 0), 16 * ls + 2)                 # arms swing against the legs
        rot(arm, f'lowerarm_{side}', (1, 0, 0), -14 - 12 * max(0.0, -ls))
    rot(arm, 'pelvis', (0, 0, 1), 5 * s)
    rot(arm, 'spine_02', (0, 0, 1), -4 * s)
    rot(arm, 'spine_03', (0, 0, 1), -3 * s)
    rot(arm, 'pelvis', (0, 1, 0), (2.5 if female else 1.5) * c)             # hip drop
    rot(arm, 'spine_01', (1, 0, 0), 3)                                       # slight forward lean
    rot(arm, 'head', (1, 0, 0), -3)
    arm.pose.bones['pelvis'].location = (0, 0, 0)
    bob = 0.02 * (math.cos(4 * math.pi * phase) - 1)                       # highest at mid-stance
    pelvis_rest = arm.data.bones['pelvis'].matrix_local.to_3x3()
    arm.pose.bones['pelvis'].location = pelvis_rest.inverted() @ Vector((0, 0, bob))


def idle(arm, female, phase):
    """Breathing and a slow weight shift."""
    s = math.sin(2 * math.pi * phase)
    rot = looks.pose_bone_rot
    rot(arm, 'spine_02', (1, 0, 0), -1.2 * s)
    rot(arm, 'spine_03', (1, 0, 0), -1.0 * s)
    rot(arm, 'clavicle_l', (0, 1, 0), 1.2 * s)
    rot(arm, 'clavicle_r', (0, 1, 0), -1.2 * s)
    rot(arm, 'pelvis', (0, 1, 0), 1.5 * math.cos(2 * math.pi * phase))
    rot(arm, 'head', (0, 0, 1), 3 * math.sin(2 * math.pi * phase + 1))


def ground_level(dg):
    """The lowest point of the dressed character (soles), from every rendered mesh."""
    low = math.inf
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name != 'Plane' and not ob.hide_render:
            ev = ob.evaluated_get(dg)
            low = min([low] + [(ev.matrix_world @ v.co).z for v in ev.data.vertices])
    return low - 0.004


def feet_centre(arm):
    """Middle of the feet (ankles and balls of both feet) in the current pose, projected to the ground."""
    pts = [arm.matrix_world @ arm.pose.bones[b].head for b in ('foot_l', 'ball_l', 'foot_r', 'ball_r')]
    c = sum(pts, Vector()) / len(pts)
    return Vector((c.x, c.y, 0))


def world_lighting():
    """Warm sun from the upper left of the screen, a cool rim from behind (separates the figure from the street at
    small sizes), and a soft sky; matches the painted world."""
    studio.world((0.62, 0.7, 0.85), 0.75)
    lights = []
    for name, energy, color, angle in (('sun', 4.2, (1.0, 0.92, 0.8), 6), ('rim', 1.8, (0.8, 0.88, 1.0), 20)):
        light = bpy.data.lights.new(name, 'SUN')
        light.energy = energy
        light.color = color
        light.angle = math.radians(angle)
        if name == 'rim':
            light.use_shadow = False  # one shadow only: the sun's
        ob = bpy.data.objects.new(name, light)
        bpy.context.scene.collection.objects.link(ob)
        lights.append(ob)
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    bpy.context.active_object.is_shadow_catcher = True
    return lights


def _aim(ob, travel):
    ob.rotation_euler = travel.normalized().to_track_quat('-Z', 'Y').to_euler()


def place_view(cam, lights, a, pivot):
    """Camera at azimuth a (0 = in front of the character) around the pivot; lights keep their screen angles."""
    sun, rim = lights
    right = Vector((math.cos(a), math.sin(a), 0))
    away = Vector((-math.sin(a), math.cos(a), 0))
    cam.location = pivot - away * 10 * math.cos(ELEV) + Vector((0, 0, 10 * math.sin(ELEV)))
    cam.rotation_euler = (pivot - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # Shift the view so the pivot (between the feet) lands exactly on the frame's anchor pixel.
    cam.data.shift_x = cam.data.shift_y = 0.0
    for _ in range(3):
        bpy.context.view_layer.update()
        u, v, _d = world_to_camera_view(bpy.context.scene, cam, pivot)
        cam.data.shift_x += (u - AX / FW) * FW / FH
        cam.data.shift_y += (v - (1 - AY / FH))
    # Sun: travels to screen right and towards the viewer, from about 60 degrees up.
    d = (right - away * 0.55).normalized()
    up = math.radians(60)
    _aim(sun, Vector((d.x * math.cos(up), d.y * math.cos(up), -math.sin(up))))
    # Rim: from behind the character towards the viewer, 30 degrees up, slightly from the right.
    r = (-away + right * 0.3).normalized()
    up = math.radians(30)
    _aim(rim, Vector((r.x * math.cos(up), r.y * math.cos(up), -math.sin(up))))


def project(cam, p):
    """World point -> frame position in world pixels (x right, y down from the top-left)."""
    u, v, _d = world_to_camera_view(bpy.context.scene, cam, p)
    return [round(u * FW, 3), round((1 - v) * FH, 3)]


# ----------------------------------------------------------------------------- layers


def setup_layer(h, layer):
    """Show, hide or hold out objects for one render pass: 'full', 'body', 'outfit' or 'hair'."""
    body = h['body']
    outfit, hair_obs, base = h['outfit_objects'], h['hair_objects'], h.get('base_objects', [])
    holdout = h.get('holdout')
    if holdout is None and layer != 'full':
        holdout = body.copy()                         # shares the mesh; no hair systems; the clothes mask stays
        bpy.context.scene.collection.objects.link(holdout)
        for m in list(holdout.modifiers):
            if m.type == 'PARTICLE_SYSTEM':
                holdout.modifiers.remove(m)
        holdout.name = f'{body.name}-holdout'
        h['holdout'] = holdout
    plane = bpy.data.objects['Plane']

    def show(obs, on=True, hold=False):
        for ob in obs:
            ob.hide_render = not on
            ob.is_holdout = hold
    systems = {m.name: m for m in body.modifiers if m.type == 'PARTICLE_SYSTEM'}
    mask = body.modifiers.get('Covered')
    show(base, layer == 'body')
    if layer == 'full':
        show([body, h['eyes'], h['lashes'], plane] + outfit + hair_obs)
        if holdout is not None:
            show([holdout], False)
        body.show_instancer_for_render = True
        for m in systems.values():
            m.show_render = True
        if mask:
            mask.show_render = True
        return
    show([holdout], layer in ('outfit', 'hair', 'base'), hold=True)
    hold_mask = holdout.modifiers.get('Covered')
    if hold_mask:
        hold_mask.show_render = layer != 'base'  # the base is drawn over the whole (unmasked) skin, as in 'body'
    if layer == 'body':
        # The whole skin (also under the clothes: no holes whatever the outfit exposes), the neutral base clothing
        # and the face hair (brows, beard): the character's identity.
        show([body, h['eyes'], h['lashes']])
        show(outfit + hair_obs + [plane], False)
        if mask:
            mask.show_render = False
        body.show_instancer_for_render = True
        for name, m in systems.items():
            m.show_render = name in characters.FACE_SYSTEMS
    elif layer == 'base':
        # Validation only (check_layers.py --base): where the neutral base clothing of the body layer shows.
        show(base)
        show([body, h['eyes'], h['lashes'], plane] + outfit + hair_obs, False)
        body.show_instancer_for_render = False
        for m in systems.values():
            m.show_render = False
    elif layer == 'outfit':
        # Clothes, shoes and accessories, cut where the body is in front of them; the ground shadow lives here.
        show(outfit + [plane])
        show([body, h['eyes'], h['lashes']] + hair_obs, False)
    elif layer == 'hair':
        # Scalp hair and headwear, cut where the head is in front of them. The body only emits the strands.
        show(hair_obs + [body])
        show(outfit + [h['eyes'], h['lashes'], plane], False)
        body.show_instancer_for_render = False  # strands only, not the skin they grow from
        for name, m in systems.items():
            m.show_render = name in characters.SCALP_SYSTEMS


def layer_tag(layer, config, default):
    body, outfit, hair = config['body'], config['outfit'], config['hair']
    if layer == 'full':
        return body if default else f'{body}+{outfit}+{hair}'
    return {'body': f'body-{body}', 'outfit': f'outfit-{outfit}.{body}', 'hair': f'hair-{hair}.{body}', 'base': f'base-{body}'}[layer]


def main():
    MH, MPFB, OUT = os.environ['MH_DATA'], os.environ['MPFB_DATA'], os.environ['OUT_DIR']
    args = sys.argv[sys.argv.index('--') + 1:]
    name, outfit, hairstyle = (args + [None, None])[:3]
    samples = int(os.environ.get('SAMPLES', '16'))
    only = os.environ.get('ONLY')  # e.g. "0:walk0" for a quick test
    layers = os.environ.get('LAYERS', 'full').split(',')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    h = characters.build(name, MH, MPFB, outfit=outfit, hairstyle=hairstyle)
    spec = characters.CHARACTERS[name]
    default = (outfit in (None, spec['outfit'])) and (hairstyle in (None, spec['hair']))
    female = spec['body']['gender'] < 0.5
    arm = h['armature']
    # At sprite size (a character is ~110 texels tall) subdivision and most child hairs are invisible but cost
    # most of each frame's scene rebuild, so they are cut down here (the turnarounds keep them).
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'SUBSURF':
                m.render_levels = 0
            if m.type == 'PARTICLE_SYSTEM':
                st = m.particle_system.settings
                st.rendered_child_count = max(2, st.rendered_child_count // 3)
                st.root_radius *= 1.5
    if 'body' in layers or 'base' in layers:
        h['base_objects'] = characters.base_clothes(h)
    sc = studio.setup_render(samples, (FW * RES * SUPER, FH * RES * SUPER))
    sc.render.use_persistent_data = True
    lights = world_lighting()
    cam = studio.camera()
    cam.data.type = 'ORTHO'
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.ortho_scale = FH / PX_PER_M
    # Ground level and pivot from the standing pose (the shadow catcher sits on the ground).
    looks.reset_pose(arm); looks.relaxed(arm, female)
    bpy.context.view_layer.update()
    feet_z = ground_level(bpy.context.evaluated_depsgraph_get())
    bpy.data.objects['Plane'].location.z = feet_z
    pivot = feet_centre(arm) + Vector((0, 0, feet_z))
    print('ground z', round(feet_z, 4), 'pivot', tuple(round(x, 4) for x in pivot))
    frames = [(f'walk{i}', gait, i / WALK) for i in range(WALK)] + [(f'idle{i}', idle, i / IDLE) for i in range(IDLE)]
    head = arm.pose.bones['head']
    anchors = {}  # the same for every layer (same skeleton, same cameras): measured while rendering the first
    for layer in layers:
        setup_layer(h, layer)
        tag = layer_tag(layer, h['config'], default)
        tmp = os.path.join(OUT, f'{tag}-frames')
        os.makedirs(tmp, exist_ok=True)
        for k in range(8):
            place_view(cam, lights, math.radians(45 * k), pivot)
            rows = anchors.setdefault(k, {'pivot': project(cam, pivot), 'frames': {}})['frames']
            for label, fn, phase in frames:
                if only and only != f'{k}:{label}':
                    continue
                looks.reset_pose(arm)
                looks.relaxed(arm, female)
                fn(arm, female, phase)
                bpy.context.view_layer.update()
                rows[label] = {'feet': project(cam, feet_centre(arm) + Vector((0, 0, feet_z))),
                               'pelvis': project(cam, arm.matrix_world @ arm.pose.bones['pelvis'].head),
                               'headTop': project(cam, arm.matrix_world @ head.tail)}
                studio.render(os.path.join(tmp, f'{k}-{label}.png'))
        meta = {'frame': {'w': FW, 'h': FH, 'ax': AX, 'ay': AY, 'res': RES}, 'walk': WALK, 'idle': IDLE,
                'columns': [f[0] for f in frames], 'directions': 8, 'pxPerMetre': PX_PER_M, 'layer': layer,
                'config': h['config'], 'anchors': anchors}
        with open(os.path.join(OUT, f'{tag}-anchors.json'), 'w') as fh:
            json.dump(meta, fh, indent=1)
        print('layer', layer, '->', tag)


if __name__ == '__main__':
    main()
