"""
The four prototype outfits, after the art-direction board:
  Tunde  - Nigeria football jersey, cargo joggers, white trainers, backpack
  Femi   - royal-blue senator kaftan with embroidery, matching trousers, leather slides, watch (the fila is headwear:
           see characters.HAIRSTYLES)
  Amaka  - fitted ankara dress with straps, strappy sandals, handbag, necklace, gold hoops
  Zainab - white crop tank, high-waist wide-leg jeans, white trainers, handbag, big gold hoops

Two stages per look (see characters.build):
  garments(h, B)      - the main garments, built with the arms raised, draped and skinned -> [tailor.Garment]
  details(h, B, g)    - in the final (relaxed) rest pose: collars, cuffs, waistbands, pockets, shoes, accessories
                        -> (objects that cover skin, other extras)
"""
import numpy as np
from mathutils import Vector

import fabrics
import kit
import tailor as T

# ----------------------------------------------------------------------------- shared pieces


def _centre(B, z, bones=T.TORSO):
    q = B.co[B.mask(bones) & (np.abs(B.co[:, 2] - z) < 0.02)]
    return ((q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 1].min() + q[:, 1].max()) / 2)


def _arm_point(B, side, length):
    """A point on the arm axis at `length` (upper arm 0..1, forearm 1..2) and the axis direction there."""
    up, lo = B.j[f'upperarm_{side}'], B.j[f'lowerarm_{side}']
    a, b = (up if length <= 1 else lo)
    t = length if length <= 1 else length - 1
    ax = (b - a) / np.linalg.norm(b - a)
    return a + (b - a) * t, ax


def _sleeves(B, length, ease, start=-0.06):
    """Sleeve tubes for both arms, `length` as in _arm_point (to the wrist: 2)."""
    parts = []
    for side in ('l', 'r'):
        up, lo = f'upperarm_{side}', f'lowerarm_{side}'
        ch = [B.j[up][0], B.j[up][1], B.j[lo][1]]
        lu = np.linalg.norm(ch[1] - ch[0]); ll = np.linalg.norm(ch[2] - ch[1])
        end = lu * min(length, 1) + ll * max(0, length - 1)
        rings = T.limb_rings(B, B.mask({up, lo}), ch, lambda u, th: ease(u / (lu + ll)) + 0 * th, start=start, end=end + 0.03)
        parts.append(T.tube(rings))
    return parts


def _cut_sleeve_ends(ob, B, length):
    for side in ('l', 'r'):
        p, ax = _arm_point(B, side, length)
        T.cut(ob, lambda P, p=p, ax=ax: np.where(np.linalg.norm(P - p, axis=1) < 0.16, (P - p) @ ax, -1))


def _neckline(ob, B, cy, back_rise=0.012, v=None, scoop=None):
    """Cut the neck opening: a ring around the base of the neck, optionally a V or a scoop."""
    zn = B.neck
    T.cut(ob, lambda P: np.where((np.abs(P[:, 0]) < 0.14) & (P[:, 2] > zn - 0.15),
                                 P[:, 2] - (zn + back_rise + 0.16 * np.clip(P[:, 1] - cy, -0.15, 0.0)), -1))
    if v:
        depth, slope = v
        T.cut(ob, lambda P: np.where((P[:, 1] < cy - 0.02) & (np.abs(P[:, 0]) < 0.1) & (P[:, 2] > zn - depth - 0.02),
                                     P[:, 2] - (zn - depth + slope * np.abs(P[:, 0])), -1))
    if scoop:
        depth, width, side = scoop  # side: -1 front, +1 back
        T.cut(ob, lambda P: np.where((side * (P[:, 1] - cy) > 0.0) & (np.abs(P[:, 0]) < width) & (P[:, 2] > zn - depth - 0.03),
                                     P[:, 2] - (zn - depth + depth * (P[:, 0] / width) ** 2), -1))


def _armholes(ob, B, radius):
    for side in ('l', 'r'):
        a, b = B.j[f'upperarm_{side}']
        ax = (b - a) / np.linalg.norm(b - a)

        def f(P, a=a, ax=ax):
            d = P - a
            t = d @ ax
            r = np.linalg.norm(d - np.outer(t, ax), axis=1)
            return np.where((t > -0.06) & (np.abs(P[:, 0]) > 0.08), radius - r, -1)
        T.cut(ob, f)


def _band(ob, B, h, near, along, width, material, **kw):
    loop = T.nearest_loop(T.boundary_loops(ob), np.asarray(near))
    band = T.ribbon(f'{ob.name}-band', ob, loop, along, width, material, **kw)
    T.skin(band, B, h['armature'], smooth=4)
    return band


def _cuffs(ob, B, h, length, width, material, **kw):
    out = []
    for side in ('l', 'r'):
        p, ax = _arm_point(B, side, length)
        out.append(_band(ob, B, h, p, -ax, width, material, **kw))
    return out


def _neck_pin(B):
    return lambda P: np.clip((P[:, 2] - (B.neck - 0.07)) / 0.03, 0, 1) * (np.abs(P[:, 0]) < 0.14)


def _shoulder_pin(B):
    return lambda P: np.clip((P[:, 2] - (B.chest + 0.03)) / 0.05, 0, 1) * (np.abs(P[:, 0]) < 0.24)


def _waist_pin(z0):
    return lambda P: np.clip((P[:, 2] - (z0 - 0.04)) / 0.03, 0, 1)


def trousers(B, h, name, waist, hem, ease_hip, ease_hem, material, expand=0.012):
    """Trousers: a seat from the waist to the crotch plus two legs, joined into one garment."""
    sel = B.mask(T.TORSO | T.LEG)
    # Snug at the waistband, easing out over the hips.
    seat = T.vertical_rings(B, sel, B.crotch - 0.03, waist + 0.03,
                            lambda z, th: 0.005 + (ease_hip - 0.005) * np.clip((waist - z) / 0.1, 0, 1) + 0 * th)
    parts = [T.tube(seat)]
    for side in ('l', 'r'):
        ch = [B.j[f'thigh_{side}'][0], B.j[f'calf_{side}'][0], B.j[f'calf_{side}'][1]]
        L = sum(np.linalg.norm(ch[i + 1] - ch[i]) for i in range(2))

        def ease(u, th, L=L):
            t = np.clip(u / L, 0, 1)
            return ease_hip + (ease_hem - ease_hip) * t ** 1.4 + 0 * th
        parts.append(T.tube(T.limb_rings(B, B.mask({f'thigh_{side}', f'calf_{side}'}), ch, ease, start=-0.07, end=L + 0.06)))
    ob = T.fuse(name, parts)
    T.cut(ob, lambda P: np.where(np.abs(P[:, 0]) < 0.35, P[:, 2] - waist, -1))
    T.cut(ob, lambda P: hem - P[:, 2])
    T.drape(ob, h['body'], _waist_pin(waist), frames=16, expand=expand)
    T.skin(ob, B, h['armature'])
    return T.Garment(ob, material, lambda B2: _waist_pin(waist - (B.waist - B2.waist)))


def trouser_details(ob, B, h, waist, hem, material, cuff=None, waistband=True):
    """Waistband (skipped under a top that covers it: it would show through) and optional ankle cuffs."""
    out = []
    if waistband:
        # The waistband wraps over the cut edge, so no gap shows between the trousers and the body.
        loop = T.nearest_loop(T.boundary_loops(ob), np.array([0, 0, waist]))
        wb = T.ribbon(f'{ob.name}-waistband', ob, loop + np.array([0, 0, 0.006]), (0, 0, -1), 0.044, material, outward=0.0025, thickness=0.005)
        T.skin(wb, B, h['armature'], smooth=4)
        out.append(wb)
    if cuff:
        for side in ('l', 'r'):
            x = B.j[f'calf_{side}'][1][0]
            out.append(_band(ob, B, h, (x, 0, hem), (0, 0, 1), cuff[0], cuff[1], outward=0.002, thickness=0.004))
    return out


# ----------------------------------------------------------------------------- Tunde

def tunde_garments(h, B):
    cy = _centre(B, B.hip)[1]
    cargo = fabrics.cloth('cargo', '#3a3d42', 0.85, sheen=0.3, weave='twill', weave_scale=900, bump=0.15,
                          print_fn=fabrics.decals((fabrics.knee_seams(), 'front', 0.0, B.knee, 0.4, 0.1, cy)))
    pants = trousers(B, h, 'cargo', B.hip + 0.03, B.ankle + 0.015, 0.024, 0.006, cargo, expand=0.02)
    c = _centre(B, B.chest)
    hem = B.hip - 0.06
    torso = T.vertical_rings(B, B.mask(T.TORSO), hem - 0.03, B.neck + 0.05, lambda z, th: 0.016 + 0 * th, centre=c, hang=0.997)
    ob = T.fuse('jersey', [T.tube(torso)] + _sleeves(B, 0.5, lambda t: 0.022 + 0.01 * t))
    T.cut(ob, lambda P: np.where(np.abs(P[:, 0]) < 0.4, hem - P[:, 2], -1))
    _neckline(ob, B, c[1], v=(0.075, 1.1))
    _cut_sleeve_ends(ob, B, 0.5)
    T.drape(ob, h['body'], _shoulder_pin(B), frames=18, expand=0.012, under=[pants.ob])
    T.skin(ob, B, h['armature'])
    front = fabrics.jersey_print('jersey-front.png', [('NIGERIA', 64, 120), ('10', 230, 330)], arch=520)
    back = fabrics.jersey_print('jersey-back.png', [('TUNDE', 70, 110), ('10', 260, 320)])
    jersey = fabrics.cloth('jersey', '#08692f', 0.5, sheen=0.1, weave='knit', weave_scale=1400, bump=0.08,
                           print_fn=fabrics.decals((front, 'front', 0.0, B.chest, 0.26, 0.26, c[1]), (back, 'back', 0.0, B.chest - 0.01, 0.3, 0.3, c[1]),
                                                   under=fabrics.tonal('#055a28', 16, 0.5)))
    return [pants, T.Garment(ob, jersey, _neck_pin)]


def tunde_details(h, B, g):
    jersey, cargo = g['jersey'], g['cargo']
    white = fabrics.cloth('rib-white', '#f2f1ec', 0.7, weave='knit', weave_scale=900, bump=0.3)
    cargo_mat = cargo.data.materials[0]
    out = [_band(jersey, B, h, (0, 0, B.neck), (0, 0, -1), 0.016, white, outward=0.002)]
    out += _cuffs(jersey, B, h, 0.5, 0.018, white, outward=0.002)
    out += trouser_details(cargo, B, h, B.hip + 0.03, B.ankle + 0.015, cargo_mat, cuff=(0.03, cargo_mat), waistband=False)
    tree = T.surface_tree(cargo)
    for side, sgn in (('l', 1), ('r', -1)):
        a, b = B.j[f'thigh_{side}']
        mid = a + (b - a) * 0.58
        loc, _n, _i, _d = tree.ray_cast(Vector(mid), Vector((sgn, 0, 0)))
        if loc is None:
            continue
        p = np.array(loc[:]) + np.array([sgn * 0.006, 0, 0])
        pk = kit.rounded_box(f'cargo-pocket-{side}', p, (0.014, 0.12, 0.15), cargo_mat, bevel=0.006)
        fl = kit.rounded_box(f'cargo-flap-{side}', p + np.array([sgn * 0.008, 0, 0.066]), (0.008, 0.125, 0.035), cargo_mat, bevel=0.004)
        for o in (pk, fl):
            T.set_rest(o); T.skin(o, B, h['armature'], smooth=0); out.append(o)
    out += kit.sneakers(h, B, accent='#08692f')
    return out, kit.backpack(h, B, jersey)


# ----------------------------------------------------------------------------- Femi

def femi_garments(h, B):
    blue = fabrics.cloth('senator', '#1c3592', 0.72, sheen=0.4, weave='twill', weave_scale=1100, bump=0.1)
    pants = trousers(B, h, 'sokoto', B.hip + 0.02, B.ankle - 0.015, 0.016, 0.018, blue, expand=0.0)
    c = _centre(B, B.chest)
    hem = B.knee - 0.07
    torso = T.vertical_rings(B, B.mask(T.TORSO | T.LEG), hem - 0.03, B.neck + 0.05, lambda z, th: 0.024 + 0 * th, centre=c, hang=0.993,
                             flare=lambda z: 0.035 * max(0.0, (B.crotch - z) / (B.crotch - hem)))
    ob = T.fuse('kaftan', [T.tube(torso)] + _sleeves(B, 1.97, lambda t: 0.02 + 0.022 * t))
    T.cut(ob, lambda P: np.where(np.abs(P[:, 0]) < 0.45, hem - P[:, 2], -1))
    _neckline(ob, B, c[1], back_rise=0.016)
    _cut_sleeve_ends(ob, B, 1.97)
    T.drape(ob, h['body'], _shoulder_pin(B), frames=22, expand=0.035, bending=0.15, under=[pants.ob])
    T.skin(ob, B, h['armature'], skirt_below=B.crotch)
    return [pants, T.Garment(ob, blue, _neck_pin, skirt_below=lambda B2: B2.crotch)]


def femi_details(h, B, g):
    kaftan, sokoto = g['kaftan'], g['sokoto']
    c = _centre(B, B.chest)
    emb = fabrics.strip('embroidery', fabrics.embroidery_strip(), '#1c3592', roughness=0.55, metallic=0.6, repeat_m=0.04)
    out = [_band(kaftan, B, h, (0, c[1], B.neck), (0, 0, -1), 0.028, emb, outward=0.0015, uv_repeat=0.04)]
    tree = T.surface_tree(kaftan)
    pts = []
    for z in np.linspace(B.neck - 0.03, B.chest - 0.12, 24):
        loc, _n, _i, _d = tree.ray_cast(Vector((0, c[1] - 0.5, z)), Vector((0, 1, 0)))
        if loc is not None:
            pts.append(np.array(loc[:]))
    if len(pts) > 4:
        pl = T.ribbon('placket', kaftan, np.array(pts) - np.array([0.013, 0, 0]), (1, 0, 0), 0.026, emb, outward=0.0018, closed=False, uv_repeat=0.04)
        T.skin(pl, B, h['armature']); out.append(pl)
    out += _cuffs(kaftan, B, h, 1.97, 0.03, emb, outward=0.0018, uv_repeat=0.04)
    out += trouser_details(sokoto, B, h, B.hip + 0.02, B.ankle - 0.015, sokoto.data.materials[0], waistband=False)
    out += kit.sandals(h, B, '#2a1a10', style='slide')
    return out, kit.watch(h, B, 'l')


# ----------------------------------------------------------------------------- Amaka

def amaka_garments(h, B):
    c = _centre(B, B.chest)
    hem = B.ankle + 0.1
    top = B.chest + 0.12

    def ease(z, th):
        return 0.006 + 0.012 * np.clip((B.hip - z) / 0.25, 0, 1) + 0 * th
    torso = T.vertical_rings(B, B.mask(T.TORSO | T.LEG), hem - 0.03, B.neck + 0.03, ease,
                             flare=lambda z: 0.05 * max(0.0, (B.knee + 0.05 - z) / (B.knee + 0.05 - hem)) ** 1.5)
    ob = T.fuse('dress', [T.tube(torso)])
    T.cut(ob, lambda P: hem - P[:, 2])

    def sweetheart(x):
        return top - 0.03 * np.exp(-(x / 0.018) ** 2) + 0.012 * np.exp(-((np.abs(x) - 0.05) / 0.03) ** 2)
    T.cut(ob, lambda P: P[:, 2] - np.where(P[:, 1] < c[1], sweetheart(P[:, 0]), top - 0.02))

    def bodice(B2):
        return lambda P: np.clip((P[:, 2] - (B2.waist - 0.04)) / 0.06, 0, 1)
    T.drape(ob, h['body'], bodice(B), frames=18, expand=0.012)
    T.skin(ob, B, h['armature'], skirt_below=B.crotch + 0.04)
    ank = fabrics.cloth('ankara', '#e8622a', 0.6, sheen=0.25, weave='plain', weave_scale=900, print_fn=fabrics.boxed(fabrics.ankara_tile(), 0.42))
    return [T.Garment(ob, ank, bodice, skirt_below=lambda B2: B2.crotch + 0.04)]


def amaka_details(h, B, g):
    dress = g['dress']
    c = _centre(B, B.chest)
    smat = fabrics.cloth('ankara-strap', '#1d2340', 0.6)
    out = []
    edge = max(T.boundary_loops(dress), key=lambda lp: lp[:, 2].mean())
    for sgn in (1, -1):
        x = 0.085 * sgn
        f_pt = edge[np.argmin(np.abs(edge[:, 0] - x) + 10 * (edge[:, 1] > c[1]))]
        b_pt = edge[np.argmin(np.abs(edge[:, 0] - x) + 10 * (edge[:, 1] < c[1]))]
        tops = B.co[(np.abs(B.co[:, 0] - x) < 0.01) & B.mask({'clavicle_l', 'clavicle_r', 'spine_03', 'neck_01'})]
        ztop = tops[:, 2].max()
        ctrl = [f_pt, (x, (f_pt[1] + c[1]) / 2, (f_pt[2] + ztop) / 2), (x, c[1] + 0.005, ztop + 0.003), (x, (b_pt[1] + c[1]) / 2, (b_pt[2] + ztop) / 2), b_pt]
        path = kit.catmull(ctrl, per=8) - np.array([0.006, 0, 0])
        st = T.ribbon(f'strap-{sgn}', h['body'], path, (1, 0, 0), 0.012, smat, outward=0.002, closed=False)
        T.skin(st, B, h['armature'], smooth=2); out.append(st)
    out += kit.sandals(h, B, '#c99a5b', style='strappy', strap_color='#d9a441')
    return out, kit.handbag(h, B, 'l', '#16161a') + kit.necklace(h, B) + kit.earrings(h, h['targets'], radius=0.009)


# ----------------------------------------------------------------------------- Zainab

def zainab_garments(h, B):
    c = _centre(B, B.chest)
    hem = B.waist + 0.065  # cropped just above the high waistband
    torso = T.vertical_rings(B, B.mask(T.TORSO), hem - 0.03, B.neck + 0.05, lambda z, th: 0.008 + 0 * th)
    ob = T.fuse('tank', [T.tube(torso)], smooth=8)
    T.cut(ob, lambda P: hem - P[:, 2])
    _neckline(ob, B, c[1], scoop=(0.085, 0.085, -1))
    _neckline(ob, B, c[1], scoop=(0.05, 0.08, 1))
    _armholes(ob, B, 0.085)
    T.drape(ob, h['body'], _shoulder_pin(B), frames=12, expand=0.004)
    T.skin(ob, B, h['armature'])
    white = fabrics.cloth('tank', '#f3f1ec', 0.8, sheen=0.3, weave='knit', weave_scale=1500, bump=0.12)
    cy = _centre(B, B.hip)[1]
    jeans = fabrics.cloth('jeans-light', '#2f5590', 0.85, sheen=0.1, weave='twill', weave_scale=1000, bump=0.25,
                          print_fn=fabrics.decals((fabrics.jeans_front(), 'front', 0.0, B.waist - 0.055, 0.36, 0.18, cy),
                                                  (fabrics.jeans_back(), 'back', 0.0, B.hip - 0.04, 0.36, 0.18, cy),
                                                  under=fabrics.denim('#2c4f88', '#6f90c4', 4.0)))

    def straps(B2):
        return lambda P: np.clip((P[:, 2] - (B2.chest + 0.03)) / 0.05, 0, 1)
    return [trousers(B, h, 'jeans', B.waist + 0.02, B.floor + 0.03, 0.012, 0.055, jeans, expand=0.0),
            T.Garment(ob, white, straps, thickness=0.002)]


def zainab_details(h, B, g):
    out = trouser_details(g['jeans'], B, h, B.waist + 0.02, B.floor + 0.03, g['jeans'].data.materials[0])
    out += kit.sneakers(h, B, accent='#f4f3ef', line='#d6d2c8')
    return out, kit.handbag(h, B, 'l', '#121214', size=(0.22, 0.07, 0.15)) + kit.earrings(h, h['targets'], radius=0.016)


LOOKS = {
    'tunde': (tunde_garments, tunde_details),
    'femi': (femi_garments, femi_details),
    'amaka': (amaka_garments, amaka_details),
    'zainab': (zainab_garments, zainab_details),
}
