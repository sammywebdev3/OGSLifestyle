"""Close-up test: one character's head (front, three-quarter, side) with skin, eyes, masks and hair."""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import looks  # noqa: E402
import mhbody  # noqa: E402
import studio  # noqa: E402

MH, MPFB, OUT = os.environ['MH_DATA'], os.environ['MPFB_DATA'], os.environ['OUT_DIR']
T = os.path.join(MH, 'targets')
bpy.ops.wm.read_factory_settings(use_empty=True)
spec = {'gender': 1.0, 'muscle': 0.62, 'weight': 0.5, 'height': 0.0, 'proportions': 0.7,
        'extra': [('nose/nose-flaring-incr.target', 0.4), ('mouth/mouth-lowerlip-volume-incr.target', 0.3)]}
h = mhbody.build_body(spec, MH, MPFB, 'M')
looks.paint_face_masks(h, T, beard=0.0)
h['body'].data.materials.append(looks.skin_material('skin', '#5a3324', '#4a2420', '#120b08'))
h['eyes'].data.materials.append(looks.eye_material(h['eye_texture']))
h['lashes'].data.materials.append(looks.flat_material('lashes', '#0b0807', 0.6))
looks.hair_fade(h, T)
looks.brows_and_beard(h, T, beard=0.0)
sub = h['body'].modifiers.new('Sub', 'SUBSURF')
sub.levels = 1
sub.render_levels = 2
c, zmin, zmax, ymin = looks.head_frame(h)
zs = [v.co.z for v in h['body'].data.vertices]
print('height', round(max(zs) - min(zs), 3), 'head', tuple(round(x, 3) for x in c))
studio.setup_render(48, (700, 700))
studio.studio(c)
cam = studio.camera()
for name, yaw in (('front', 0), ('three', 32), ('side', 90)):
    a = math.radians(yaw)
    studio.look_at(cam, c + Vector((math.sin(a) * 1.2, -math.cos(a) * 1.2, 0.02)), c + Vector((0, 0, -0.01)), lens=85)
    studio.render(os.path.join(OUT, f'head-{name}.png'))
