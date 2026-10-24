"""
Isometric sprite sheets for one character: 8 facing directions x (8 walk + 4 idle) frames, rendered with an
orthographic camera at the game's 2:1 isometric elevation (30 degrees), a sun matching the world (shadows fall
to the lower right on screen) and a shadow-catcher ground plane, so the contact shadow is part of the sprite.

The walk and idle cycles are authored here (procedural keyframes on the game_engine rig), not motion capture.

Output: <OUT_DIR>/<name>-atlas.png (rows = directions 0..7, columns = walk0..7, idle0..3) and <name>-atlas.json.
Direction k means the camera sits at azimuth k*45 degrees around the character; on screen the character then
faces (-sin a, cos a / 2) (x right, y down). The game picks the direction from the screen velocity (see
pickDirection in the prototype scene).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import characters  # noqa: E402
import looks  # noqa: E402
import studio  # noqa: E402

# Frame layout in world pixels (the game draws at 1/RES); feet at (AX, AY).
FW, FH, AX, AY = 72, 80, 26, 72
PX_PER_M = 33.0           # ~1.75 m person -> ~56 px tall on screen, same as the painted sprites
ELEV = math.radians(30)   # 2:1 isometric
RES = 2                   # texels per world pixel in the atlas
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
    """The lowest point of the dressed character (soles), from every visible mesh: skin under shoes is masked out."""
    low = math.inf
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob.name != 'Plane':
            ev = ob.evaluated_get(dg)
            low = min([low] + [(ev.matrix_world @ v.co).z for v in ev.data.vertices])
    return low - 0.004


def world_lighting():
    """Warm sun from the upper left of the screen plus a soft sky; matches the painted world."""
    studio.world((0.62, 0.7, 0.85), 0.75)
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4.2
    sun.color = (1.0, 0.92, 0.8)
    sun.angle = math.radians(6)
    ob = bpy.data.objects.new('sun', sun)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.is_shadow_catcher = True
    return ob


def place_view(cam, sun, a, feet_z):
    """Camera at azimuth a (0 = in front of the character) at isometric elevation; the sun keeps its screen angle."""
    right = Vector((math.cos(a), math.sin(a), 0))
    away = Vector((-math.sin(a), math.cos(a), 0))
    target = Vector((0, 0, feet_z))
    cam.location = target - away * 10 * math.cos(ELEV) + Vector((0, 0, 10 * math.sin(ELEV)))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # Shift the view so the feet (world origin) land on the frame's anchor pixel.
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene
    for _ in range(3):
        bpy.context.view_layer.update()
        u, v, _d = world_to_camera_view(sc, cam, Vector((0, 0, feet_z)))
        cam.data.shift_x += (u - AX / FW) * FW / FH
        cam.data.shift_y += (v - (1 - AY / FH))
    # Light travels to screen right and towards the viewer, from about 60 degrees up.
    d = (right * 1.0 - away * 0.55).normalized()
    travel = Vector((d.x * math.cos(math.radians(60)), d.y * math.cos(math.radians(60)), -math.sin(math.radians(60))))
    sun.rotation_euler = travel.to_track_quat('-Z', 'Y').to_euler()


def main():
    MH, MPFB, OUT = os.environ['MH_DATA'], os.environ['MPFB_DATA'], os.environ['OUT_DIR']
    name = sys.argv[sys.argv.index('--') + 1]
    samples = int(os.environ.get('SAMPLES', '16'))
    only = os.environ.get('ONLY')  # e.g. "0:walk0" for a quick test
    bpy.ops.wm.read_factory_settings(use_empty=True)
    h = characters.build(name, MH, MPFB)
    female = characters.CHARACTERS[name]['body']['gender'] < 0.5
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
    sc = studio.setup_render(samples, (FW * RES * SUPER, FH * RES * SUPER))
    sc.render.use_persistent_data = True
    sun = world_lighting()
    cam = studio.camera()
    cam.data.type = 'ORTHO'
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.ortho_scale = FH / PX_PER_M
    # Ground level: the soles in the standing pose (the shadow catcher sits there too).
    looks.reset_pose(arm); looks.relaxed(arm, female)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    feet_z = ground_level(dg)
    bpy.data.objects['Plane'].location.z = feet_z
    print('ground z', round(feet_z, 4))
    tmp = os.path.join(OUT, f'{name}-frames')
    os.makedirs(tmp, exist_ok=True)
    frames = [(f'walk{i}', gait, i / WALK) for i in range(WALK)] + [(f'idle{i}', idle, i / IDLE) for i in range(IDLE)]
    for k in range(8):
        place_view(cam, sun, math.radians(45 * k), feet_z)
        for label, fn, phase in frames:
            if only and only != f'{k}:{label}':
                continue
            looks.reset_pose(arm)
            looks.relaxed(arm, female)
            fn(arm, female, phase)
            bpy.context.view_layer.update()
            studio.render(os.path.join(tmp, f'{k}-{label}.png'))
    meta = {'frame': {'w': FW, 'h': FH, 'ax': AX, 'ay': AY, 'res': RES}, 'walk': WALK, 'idle': IDLE,
            'columns': [f[0] for f in frames], 'directions': 8, 'pxPerMetre': PX_PER_M}
    with open(os.path.join(OUT, f'{name}-atlas.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)


if __name__ == '__main__':
    main()
