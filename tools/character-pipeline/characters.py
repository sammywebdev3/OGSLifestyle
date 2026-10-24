"""
The four prototype characters. Each entry is a body (MakeHuman macro modifiers, African ethnicity),
a skin tone, a hairstyle and an outfit. Everything is built from CC0 data plus this repo's own
modelling, so any combination can be regenerated.
"""
import os

import bpy

import garments as G
import looks
import mhbody

CHARACTERS = {
    'tunde': {
        'label': 'Tunde: football jersey, jeans, sneakers, low fade',
        'body': {'gender': 1.0, 'muscle': 0.66, 'weight': 0.45, 'height': 0.1, 'proportions': 0.8,
                 'extra': [('nose/nose-flaring-incr.target', 0.4), ('mouth/mouth-lowerlip-volume-incr.target', 0.3)]},
        'skin': ('#4f2b1d', '#43211b'), 'hair': 'fade', 'beard': 0.0,
        'outfit': 'jersey',
    },
    'femi': {
        'label': 'Femi: adire buba and sokoto, fila, sandals, short beard',
        'body': {'gender': 1.0, 'muscle': 0.55, 'weight': 0.62, 'height': -0.1, 'proportions': 0.6,
                 'extra': [('nose/nose-scale-horiz-incr.target', 0.35), ('chin/chin-prognathism-incr.target', 0.2)]},
        'skin': ('#6b3f2a', '#57302a'), 'hair': 'fila', 'beard': 0.8,
        'outfit': 'buba',
    },
    'amaka': {
        'label': 'Amaka: ankara dress, cornrows with a bun, sandals, earrings',
        'body': {'gender': 0.0, 'muscle': 0.45, 'weight': 0.55, 'height': 0.0, 'proportions': 0.8,
                 'extra': [('mouth/mouth-upperlip-volume-incr.target', 0.35), ('nose/nose-flaring-incr.target', 0.2)]},
        'skin': ('#3d2016', '#3a1c18'), 'hair': 'cornrows', 'beard': 0.0,
        'outfit': 'ankara',
    },
    'zainab': {
        'label': 'Zainab: crop top, high-waist jeans, sneakers, afro, earrings',
        'body': {'gender': 0.0, 'muscle': 0.5, 'weight': 0.42, 'height': 0.15, 'proportions': 0.9,
                 'extra': [('mouth/mouth-lowerlip-volume-incr.target', 0.3)]},
        'skin': ('#8a5638', '#7a3f35'), 'hair': 'afro', 'beard': 0.0,
        'outfit': 'casual',
    },
}


def earrings(h, targets_dir, color='#d9a441'):
    """Small gold hoops at the ear lobes, rigid on the head."""
    import numpy as np
    out = []
    for side in ('l', 'r'):
        idx, d = mhbody.read_target(os.path.join(targets_dir, f'ears/{side}-ear-lobe-incr.target'))
        lobe = idx[np.argmax(np.linalg.norm(d, axis=1))]
        p = mhbody.mh_to_blender(h['verts'][lobe])
        bpy.ops.mesh.primitive_torus_add(major_radius=0.008, minor_radius=0.0013, location=(p[0], p[1], p[2] - 0.009), rotation=(1.5708, 0, 0))
        ring = bpy.context.active_object
        ring.data.materials.append(looks.flat_material('gold', color, 0.25, metallic=1.0))
        looks.rigid_on_bone(ring, h, 'head')
        out.append(ring)
    return out


def build(name, mh_data, mpfb_data):
    spec = CHARACTERS[name]
    T = os.path.join(mh_data, 'targets')
    h = mhbody.build_body(spec['body'], mh_data, mpfb_data, name)
    f = G.Fit(h)
    looks.paint_face_masks(h, T)
    tone, lip = spec['skin']
    h['body'].data.materials.append(looks.skin_material(f'{name}-skin', tone, lip, '#100a08'))
    h['eyes'].data.materials.append(looks.eye_material(h['eye_texture']))
    h['lashes'].data.materials.append(looks.flat_material('lashes', '#0b0807', 0.6))
    # Hair (strands are grown from the body, so this comes before the body mask).
    if spec['hair'] == 'fade':
        looks.hair_fade(h, T)
    elif spec['hair'] == 'afro':
        looks.hair_afro(h, T)
    elif spec['hair'] == 'cornrows':
        looks.hair_cornrows_bun(h, T)
    elif spec['hair'] == 'fila':
        looks.hair_fade(h, T)
        looks.fila(h, T, '#4a1019', '#e8c46a')
    looks.brows_and_beard(h, T, beard=spec['beard'])
    clothes = []
    o = spec['outfit']
    if o == 'jersey':
        r = G.top_rule(sleeve=0.42, neck='v')
        clothes.append(G.garment(f, 'jersey', r, looks.fabric_material('jersey', '#08703f', 'jersey', accent='#f4f4ef', accent2='#0a6338', weave=2600),
                  extra=0.006, loose=lambda co: 0.004, folds=0.005, hem_snap=0.05))
        r = G.trouser_rule(0.06)
        clothes.append(G.garment(f, 'jeans', r, looks.fabric_material('jeans', '#1d2c4d', 'denim', weave=2200), extra=0.008,
                  loose=lambda co: 0.012 * max(0.0, min(1.0, (0.0 - co.z) / 0.5)), folds=0.008, top_snap=0.04))
        r = G.shoe_rule()
        clothes.append(G.sneakers(f, looks.flat_material('sneaker', '#f3f1ea', 0.45), looks.flat_material('sole', '#c9442c', 0.6)))
    elif o == 'buba':
        adire = looks.fabric_material('adire', '#1b2a5e', 'adire', accent='#6f86c4', weave=1800)
        r = G.top_rule(full_sleeve=True, hem=lambda f: f.knee + 0.18, neck='crew')
        clothes.append(G.garment(f, 'buba', r, adire, extra=0.016, loose=lambda co: 0.01, folds=0.006, hem_snap=0.04))
        r = G.trouser_rule(0.06, cuff=0.03)
        clothes.append(G.garment(f, 'sokoto', r, adire, extra=0.01, loose=lambda co: 0.004, folds=0.006, top_snap=0.04))
        r = G.shoe_rule(0.0)
        clothes.append(G.body_shell(f, 'sandals', r, looks.flat_material('leather', '#1c1512', 0.5), offset=0.007))
    elif o == 'ankara':
        ank = looks.fabric_material('ankara', '#d4572a', 'ankara', accent='#f2b632', accent2='#1f5e8c', weave=2000)
        r = G.top_rule(sleeve=0.18, hem=lambda f: f.waist - 0.02, neck='scoop')
        clothes.append(G.garment(f, 'bodice', r, ank, extra=0.004))
        skirt = lambda f, i, margin=0.0: f.co[i][2] < f.waist + 0.02 - margin and f.co[i][2] > f.knee - 0.12 + margin  # noqa: E731
        clothes.append(G.garment(f, 'skirt', skirt, ank, extra=0.006, group='helper-skirt', loose=lambda co: max(0.0, (0.1 - co.z) * 0.08)))
        r = G.shoe_rule(0.0)
        clothes.append(G.body_shell(f, 'sandals', r, looks.flat_material('leather', '#6b3a1e', 0.5), offset=0.004))
        earrings(h, T)
    elif o == 'casual':
        r = G.top_rule(sleeve=0.3, hem=lambda f: f.waist + 0.05, neck='crew')
        clothes.append(G.garment(f, 'croptop', r, looks.fabric_material('top', '#f2b632', 'plain', weave=2400), extra=0.006, folds=0.004, hem_snap=0.03))
        r = G.trouser_rule(0.11)
        clothes.append(G.garment(f, 'jeans', r, looks.fabric_material('jeans', '#2f4778', 'denim', weave=2200), extra=0.006,
                  loose=lambda co: 0.014 * max(0.0, min(1.0, (0.0 - co.z) / 0.5)), folds=0.007, top_snap=0.04))
        r = G.shoe_rule()
        clothes.append(G.sneakers(f, looks.flat_material('sneaker', '#ffffff', 0.45), looks.flat_material('sole', '#e9e4d8', 0.6)))
        earrings(h, T)
    G.hide_under(f, clothes)
    sub = h['body'].modifiers.new('Sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    return h
