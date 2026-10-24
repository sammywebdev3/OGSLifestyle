"""Turnaround renders for one character: front, three-quarter, side, back (full body) and a head close-up."""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import characters  # noqa: E402
import looks  # noqa: E402
import studio  # noqa: E402

MH, MPFB, OUT = os.environ['MH_DATA'], os.environ['MPFB_DATA'], os.environ['OUT_DIR']
name = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.environ.get('CHAR', 'tunde')
samples = int(os.environ.get('SAMPLES', '32'))
bpy.ops.wm.read_factory_settings(use_empty=True)
h = characters.build(name, MH, MPFB)
looks.reset_pose(h['armature'])
looks.relaxed(h['armature'], female=characters.CHARACTERS[name]['body']['gender'] < 0.5)
bpy.context.view_layer.update()
zs = [v.co.z for v in h['body'].data.vertices]
top, bottom = max(zs) + 0.12, min(zs) - 0.02
mid = Vector((0, 0, (top + bottom) / 2))
studio.setup_render(samples, (520, 860))
studio.studio(mid + Vector((0, 0, 0.4)))
cam = studio.camera()
for view, yaw in (('front', 0), ('three', 35), ('side', 90), ('back', 180)):
    a = math.radians(yaw)
    studio.look_at(cam, mid + Vector((math.sin(a) * 8, -math.cos(a) * 8, 0)), mid, ortho=(top - bottom) * 1.04)
    studio.render(os.path.join(OUT, f'{name}-{view}.png'))
c, *_ = looks.head_frame(h)
bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 520
a = math.radians(28)
studio.look_at(cam, c + Vector((math.sin(a) * 1.3, -math.cos(a) * 1.3, 0.03)), c + Vector((0, 0, -0.02)), lens=85)
studio.render(os.path.join(OUT, f'{name}-head.png'))
