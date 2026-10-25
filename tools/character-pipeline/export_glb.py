"""
Export one character as a skinned glTF (GLB) with the authored walk cycle, to measure what genuine real-time 3D
would cost in the browser (see docs/character-prototype.md). Strand hair cannot be exported to glTF, so it is
left out (a real-time version needs hair cards); everything else is the same model as the sprites.
Usage: python export_glb.py -- <name>   (env MH_DATA, MPFB_DATA, OUT_DIR)
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import characters  # noqa: E402
import looks  # noqa: E402
import sprites  # noqa: E402


def main():
    MH, MPFB, OUT = os.environ['MH_DATA'], os.environ['MPFB_DATA'], os.environ['OUT_DIR']
    name = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    h = characters.build(name, MH, MPFB)
    female = characters.CHARACTERS[name]['body']['gender'] < 0.5
    arm = h['armature']
    for ob in list(bpy.data.objects):
        for m in list(ob.modifiers):
            if m.type in ('PARTICLE_SYSTEM', 'SUBSURF'):
                ob.modifiers.remove(m)
    act = bpy.data.actions.new('walk')
    arm.animation_data_create().action = act
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 0, sprites.WALK
    for i in range(sprites.WALK + 1):
        looks.reset_pose(arm)
        looks.relaxed(arm, female)
        sprites.gait(arm, female, (i % sprites.WALK) / sprites.WALK)
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=i)
            pb.keyframe_insert('location', frame=i)
    path = os.path.join(OUT, f'{name}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for ob in bpy.data.objects:
        if ob.type in ('MESH', 'ARMATURE'):
            ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_animations=True, export_skins=True, export_image_format='WEBP')
    tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            me = ob.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ob.evaluated_get(dg).to_mesh_clear()
    print('GLB', path, os.path.getsize(path), 'bytes', tris, 'triangles (no hair)')


if __name__ == '__main__':
    main()
