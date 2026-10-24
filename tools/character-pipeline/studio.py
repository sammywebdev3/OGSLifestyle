"""Render helpers: Cycles settings, studio lighting for close-ups, cameras."""
import bpy
from mathutils import Vector


def setup_render(samples=48, res=(800, 800)):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.color_mode = 'RGBA'
    return sc


def world(color=(0.62, 0.68, 0.8), strength=0.55):
    sc = bpy.context.scene
    w = bpy.data.worlds.new('world')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*color, 1)
    bg.inputs['Strength'].default_value = strength


def light(name, kind, loc, target, energy, size=1.0, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == 'AREA':
        data.size = size
    ob = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def studio(center):
    """Warm key from the front-left, cool fill from the right, rim from behind."""
    c = Vector(center)
    world((0.5, 0.55, 0.62), 0.35)
    light('key', 'AREA', c + Vector((-1.6, -2.2, 1.4)), c, 300, 1.6, (1.0, 0.93, 0.84))
    light('fill', 'AREA', c + Vector((2.0, -1.6, 0.4)), c, 140, 2.0, (0.82, 0.88, 1.0))
    light('rim', 'AREA', c + Vector((0.6, 2.4, 1.6)), c, 220, 1.0, (1.0, 0.96, 0.9))


def camera(name='cam'):
    cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def look_at(cam, loc, target, ortho=None, lens=None):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = ortho
    if lens:
        cam.data.type = 'PERSP'
        cam.data.lens = lens


def render(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
