"""
The four prototype characters, after the art-direction board, and the parts they are made of. A character
configuration is a body (MakeHuman macro modifiers, African ethnicity, a skin tone and face details such as a beard),
an outfit (outfits.py) and a hairstyle or headwear (HAIRSTYLES). Each part can be combined with the others: outfits
and hair are fitted to whichever body they are built on, and sprites.py can render each part as its own layer.
Everything is built from CC0 data plus this repo's own modelling.
"""
import os

import bmesh

import fabrics
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
        'skin': ('#4f2b1d', '#43211b'), 'outfit': 'tunde', 'hair': 'fade',
    },
    'femi': {
        'label': 'Femi: senator kaftan and trousers with embroidery, fila, leather slides, watch, full beard',
        'body': {'gender': 1.0, 'muscle': 0.55, 'weight': 0.62, 'height': -0.1, 'proportions': 0.6,
                 'extra': [('nose/nose-scale-horiz-incr.target', 0.35), ('chin/chin-prognathism-incr.target', 0.2)]},
        'skin': ('#6b3f2a', '#57302a'), 'outfit': 'femi', 'hair': 'fila', 'beard': True,
    },
    'amaka': {
        'label': 'Amaka: ankara dress with straps, sandals, handbag, necklace, braids in a high bun',
        'body': {'gender': 0.0, 'muscle': 0.45, 'weight': 0.55, 'height': 0.0, 'proportions': 0.8,
                 'extra': [('mouth/mouth-upperlip-volume-incr.target', 0.35), ('nose/nose-flaring-incr.target', 0.2)]},
        'skin': ('#3d2016', '#3a1c18'), 'outfit': 'amaka', 'hair': 'braided_bun',
    },
    'zainab': {
        'label': 'Zainab: white crop tank, wide-leg jeans, trainers, handbag, big afro, gold hoops',
        'body': {'gender': 0.0, 'muscle': 0.5, 'weight': 0.42, 'height': 0.15, 'proportions': 0.9,
                 'extra': [('mouth/mouth-lowerlip-volume-incr.target', 0.3)]},
        'skin': ('#8a5638', '#7a3f35'), 'outfit': 'zainab', 'hair': 'big_afro',
    },
}

# Hairstyles and headwear: each returns the objects it adds (strand hair lives on the body as particle systems).
HAIRSTYLES = {
    'fade': lambda h, B, T: looks.hair_fade(h, T) or [],
    'fila': lambda h, B, T: (looks.hair_fade(h, T) or []) + [kit.fila(h, B)],
    'braided_bun': lambda h, B, T: hair.braided_bun(h, T),
    'big_afro': lambda h, B, T: hair.big_afro(h, T),
}
# Neutral base clothing for the body layer: shorts for every body, plus a sports top for the women. It sits under any
# outfit (the outfit layer is drawn over it), and is what shows wherever an outfit leaves the body uncovered at its
# edges, so a layered character is never drawn nude whatever outfit it wears.
BASE_COLOUR = '#6f6a62'

SCALP_SYSTEMS = ('hair', 'afro-fuzz')   # particle systems that belong to the hair layer
FACE_SYSTEMS = ('brows', 'beard')       # particle systems that belong to the body (identity) layer


def build(name, mh_data, mpfb_data, outfit=None, hairstyle=None):
    """
    Build character `name` (its body and face), wearing `outfit` and `hairstyle` (default: the character's own).
    The returned dict also lists which objects belong to the outfit and hair layers (see sprites.py LAYERS).
    """
    spec = CHARACTERS[name]
    outfit = outfit or spec['outfit']
    hairstyle = hairstyle or spec['hair']
    T = os.path.join(mh_data, 'targets')
    h = mhbody.build_body(spec['body'], mh_data, mpfb_data, name)
    h['targets'] = T
    tailor.set_stance(h)
    B = tailor.Body(h)
    looks.paint_face_masks(h, T)
    tone, lip = spec['skin']
    h['body'].data.materials.append(looks.skin_material(f'{name}-skin', tone, lip, '#100a08'))
    h['eyes'].data.materials.append(looks.eye_material(h['eye_texture']))
    h['lashes'].data.materials.append(looks.flat_material('lashes', '#0b0807', 0.6))
    # Garments are built with the arms raised, then the arms are lowered and that pose becomes the rest pose; the
    # cloth settles there, and collars, cuffs, shoes and accessories are added on the final shape.
    make_garments, make_details = outfits.LOOKS[outfit]
    garments = make_garments(h, B)
    tailor.adopt_relaxed(h, [g.ob for g in garments])
    B = tailor.Body(h)
    for k, g in enumerate(garments):  # inner layers first: each rests on the ones beneath it
        g.settle(h, B, under=[x.ob for x in garments[:k]])
    covers, extras = make_details(h, B, {g.ob.name: g.ob for g in garments})
    clothes = [g.ob for g in garments] + covers
    # Hair is grown from the body after the cloth simulation; the skin under the clothes is masked out last.
    h['hair_objects'] = HAIRSTYLES[hairstyle](h, B, T)
    if spec.get('beard'):
        hair.full_beard(h)
    looks.brows_and_beard(h, T, beard=0.0)
    tailor.hide_under(h, clothes)
    sub = h['body'].modifiers.new('Sub', 'SUBSURF'); sub.levels = 0; sub.render_levels = 1
    h['outfit_objects'] = clothes + extras
    h['config'] = {'body': name, 'outfit': outfit, 'hair': hairstyle}
    return h


def _shell(h, name, keep, cuts, material, offset):
    """A piece of skin-tight clothing: the body faces in `keep`, lifted `offset` off the skin along the normals,
    trimmed by tailor.cut along each of `cuts` (clean hems instead of the mesh's own rows), with the body's weights."""
    body = h['body']
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * offset
    me = body.data.copy()
    me.name = f'{body.name}-{name}'
    bm.to_mesh(me)
    bm.free()
    me.materials.clear()
    me.materials.append(material)
    ob = body.copy()
    ob.data = me
    ob.name = f'{body.name}-{name}'
    for m in list(ob.modifiers):
        if m.type != 'ARMATURE':
            ob.modifiers.remove(m)
    body.users_collection[0].objects.link(ob)
    for f in cuts:
        tailor.cut(ob, f)
    return ob


def base_clothes(h, offset=0.0025):
    """
    The neutral base for the body layer: skin-tight shells cut from the body mesh itself (so they deform exactly
    with the body, with the same weights), lifted `offset` off the skin. Short shorts from just below the waist to
    the top of the thigh, and a sports top over the chest for female bodies. Returns the objects (shown only in the body layer).
    """
    B = tailor.Body(h)
    female = CHARACTERS[h['config']['body']]['body']['gender'] < 0.5
    z = B.co[:, 2]
    material = fabrics.cloth('base', BASE_COLOUR, 0.9, sheen=0.25, weave='knit', weave_scale=1500, bump=0.08)
    # Boy-short length: long shorts showed through Amaka's dress slit while walking (check_layers.py --base).
    top, hem = B.waist - 0.01, B.crotch - 0.05
    shorts = _shell(h, 'base-shorts', B.mask(tailor.TORSO | tailor.LEG) & (z < top + 0.04) & (z > hem - 0.04),
                    [lambda P: P[:, 2] - top, lambda P: hem - P[:, 2]], material, offset)
    out = [shorts]
    if female:
        # Below the lowest neckline of any outfit (Amaka's strapless sweetheart dips to chest + 0.09) so the base
        # never shows above a neckline, still covering the bust.
        armpit = min(B.j['upperarm_l'][0][2], B.j['upperarm_r'][0][2])
        hi, lo = min(armpit - 0.035, B.chest + 0.075), B.chest - 0.085
        out.append(_shell(h, 'base-top', B.mask(tailor.TORSO) & (z < hi + 0.04) & (z > lo - 0.04),
                          [lambda P: P[:, 2] - hi, lambda P: lo - P[:, 2]], material, offset))
    return out
