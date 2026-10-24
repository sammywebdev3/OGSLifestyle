"""
The four prototype characters, after the art-direction board. Each is a body (MakeHuman macro modifiers, African
ethnicity), a skin tone, a hairstyle and an outfit (outfits.py). Everything is built from CC0 data plus this repo's
own modelling, so any combination can be regenerated.
"""
import os



import hair
import kit
import looks
import mhbody
import outfits
import tailor

CHARACTERS = {
    'tunde': {
        'label': 'Tunde: Nigeria jersey, cargo joggers, trainers, backpack, low fade',
        'body': {'gender': 1.0, 'muscle': 0.66, 'weight': 0.45, 'height': 0.1, 'proportions': 0.8,
                 'extra': [('nose/nose-flaring-incr.target', 0.4), ('mouth/mouth-lowerlip-volume-incr.target', 0.3)]},
        'skin': ('#4f2b1d', '#43211b'),
    },
    'femi': {
        'label': 'Femi: senator kaftan and trousers with embroidery, fila, leather slides, watch, full beard',
        'body': {'gender': 1.0, 'muscle': 0.55, 'weight': 0.62, 'height': -0.1, 'proportions': 0.6,
                 'extra': [('nose/nose-scale-horiz-incr.target', 0.35), ('chin/chin-prognathism-incr.target', 0.2)]},
        'skin': ('#6b3f2a', '#57302a'),
    },
    'amaka': {
        'label': 'Amaka: ankara dress with straps, sandals, handbag, necklace, braids in a high bun',
        'body': {'gender': 0.0, 'muscle': 0.45, 'weight': 0.55, 'height': 0.0, 'proportions': 0.8,
                 'extra': [('mouth/mouth-upperlip-volume-incr.target', 0.35), ('nose/nose-flaring-incr.target', 0.2)]},
        'skin': ('#3d2016', '#3a1c18'),
    },
    'zainab': {
        'label': 'Zainab: white crop tank, wide-leg jeans, trainers, handbag, big afro, gold hoops',
        'body': {'gender': 0.0, 'muscle': 0.5, 'weight': 0.42, 'height': 0.15, 'proportions': 0.9,
                 'extra': [('mouth/mouth-lowerlip-volume-incr.target', 0.3)]},
        'skin': ('#8a5638', '#7a3f35'),
    },
}


def build(name, mh_data, mpfb_data):
    spec = CHARACTERS[name]
    T = os.path.join(mh_data, 'targets')
    h = mhbody.build_body(spec['body'], mh_data, mpfb_data, name)
    tailor.set_stance(h)
    B = tailor.Body(h)
    looks.paint_face_masks(h, T)
    tone, lip = spec['skin']
    h['body'].data.materials.append(looks.skin_material(f'{name}-skin', tone, lip, '#100a08'))
    h['eyes'].data.materials.append(looks.eye_material(h['eye_texture']))
    h['lashes'].data.materials.append(looks.flat_material('lashes', '#0b0807', 0.6))
    # Garments are built with the arms raised, then the arms are lowered and that pose becomes the rest pose; the
    # cloth settles there, and collars, cuffs, shoes and accessories are added on the final shape.
    make_garments, make_details = outfits.LOOKS[name]
    garments = make_garments(h, B)
    tailor.adopt_relaxed(h, [g.ob for g in garments])
    B = tailor.Body(h)
    for k, g in enumerate(garments):  # inner layers first: each rests on the ones beneath it
        g.settle(h, B, under=[x.ob for x in garments[:k]])
    covers, _extras = make_details(h, B, {g.ob.name: g.ob for g in garments})
    clothes = [g.ob for g in garments] + covers
    # Hair is grown from the body after the cloth simulation; the skin under the clothes is masked out last.
    if name in ('tunde', 'femi'):
        looks.hair_fade(h, T)
    if name == 'femi':
        hair.full_beard(h)
    if name == 'amaka':
        hair.braided_bun(h, T)
        kit.earrings(h, T, radius=0.009)
    if name == 'zainab':
        hair.big_afro(h, T)
        kit.earrings(h, T, radius=0.016)
    looks.brows_and_beard(h, T, beard=0.0)
    tailor.hide_under(h, clothes)
    sub = h['body'].modifiers.new('Sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    return h
