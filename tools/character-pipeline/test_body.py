"""Smoke test: build one body and render it from the front and three-quarter view (no clothes yet)."""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import mhbody  # noqa: E402

MH = os.environ['MH_DATA']
MPFB = os.environ['MPFB_DATA']
OUT = os.environ['OUT_DIR']

bpy.ops.wm.read_factory_settings(use_empty=True)
spec = {'gender': 1.0, 'muscle': 0.6, 'weight': 0.45, 'height': 0.3, 'proportions': 0.8}
h = mhbody.build_body(spec, MH, MPFB, 'M')
mat = bpy.data.materials.new('skin')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.13, 0.065, 0.04, 1)
bsdf.inputs['Roughness'].default_value = 0.45
h['body'].data.materials.append(mat)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.6, 0.65, 0.75, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(-40))

top = max(v.co.z for v in h['body'].data.vertices); bottom = min(v.co.z for v in h['body'].data.vertices)
print('height m', round(top - bottom, 3))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = (top - bottom) * 1.1
sc.render.resolution_x = 600; sc.render.resolution_y = 900
mid = (top + bottom) / 2
for name, yaw in (('front', 0), ('threequarter', 35)):
    a = math.radians(yaw)
    cam.location = (math.sin(a) * 6, -math.cos(a) * 6, mid)
    cam.rotation_euler = (math.radians(90), 0, a)
    sc.render.filepath = os.path.join(OUT, f'body-{name}.png')
    bpy.ops.render.render(write_still=True)
# Bone summary for posing.
arm = h['armature']
for b in ('upperarm_l', 'lowerarm_l', 'thigh_l', 'calf_l', 'foot_l', 'spine_03', 'head'):
    bb = arm.data.bones[b]
    print(b, tuple(round(x, 3) for x in bb.head_local), tuple(round(x, 3) for x in (bb.tail_local - bb.head_local).normalized()))
