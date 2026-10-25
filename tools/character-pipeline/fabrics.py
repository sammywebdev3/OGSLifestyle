"""
Fabrics for the tailored garments: woven and knitted cloth shaders, plus prints drawn here as image textures
(ankara wax print, fila pattern, embroidery, jersey lettering). Everything is mapped from each garment's 'rest'
attribute (rest-pose positions, see tailor.set_rest) so prints stay on the cloth while it moves.

The textures are generated at build time into TEX_DIR (default: a temp folder); nothing is downloaded.
"""
import math
import os
import tempfile

import bpy
from PIL import Image, ImageDraw, ImageFont

from looks import _nodes, srgb

TEX = os.environ.get('TEX_DIR') or os.path.join(tempfile.gettempdir(), 'ogs-textures')
FONT = next((p for p in ('/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf',
                         '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
                         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') if os.path.exists(p)), None)


def _hex(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _path(name):
    os.makedirs(TEX, exist_ok=True)
    return os.path.join(TEX, name)


# ----------------------------------------------------------------------------- generated textures


def ankara_tile(name='ankara.png', size=1024, colors=('#e8622a', '#f5b52e', '#2a5bd7', '#6b3fa0', '#1d2340', '#fbe7c6')):
    """A seamless wax-print tile: concentric medallions, eight-petal flowers and dots, outlined in navy."""
    path = _path(name)
    if os.path.exists(path):
        return path
    bg, yellow, blue, purple, navy, cream = (_hex(c) for c in colors)
    im = Image.new('RGB', (size, size), bg)
    d = ImageDraw.Draw(im)
    s = size

    def wrap(fn, x, y):
        for dx in (-s, 0, s):
            for dy in (-s, 0, s):
                fn(x + dx, y + dy)

    def medallion(x, y):
        rings = [(0.2, navy), (0.19, blue), (0.155, navy), (0.145, yellow), (0.11, navy), (0.1, purple), (0.065, navy), (0.055, cream), (0.025, navy)]
        for r, c in rings:
            R = r * s
            d.ellipse([x - R, y - R, x + R, y + R], fill=c)

    def flower(x, y):
        for k in range(8):
            a = k * math.pi / 4
            px, py = x + math.cos(a) * 0.075 * s, y + math.sin(a) * 0.075 * s
            R = 0.05 * s
            d.ellipse([px - R, py - R, px + R, py + R], fill=navy)
            d.ellipse([px - R * 0.8, py - R * 0.8, px + R * 0.8, py + R * 0.8], fill=yellow)
        R = 0.045 * s
        d.ellipse([x - R, y - R, x + R, y + R], fill=navy)
        d.ellipse([x - R * 0.75, y - R * 0.75, x + R * 0.75, y + R * 0.75], fill=purple)

    def dot(x, y):
        R = 0.012 * s
        d.ellipse([x - R, y - R, x + R, y + R], fill=cream)

    for (x, y) in ((0.25, 0.25), (0.75, 0.75)):
        wrap(medallion, x * s, y * s)
    for (x, y) in ((0.75, 0.25), (0.25, 0.75)):
        wrap(flower, x * s, y * s)
    for (x, y) in ((0.5, 0.5), (0.0, 0.5), (0.5, 0.0), (0.0, 0.0)):
        for k in range(6):
            a = k * math.pi / 3
            wrap(dot, (x + 0.06 * math.cos(a)) * s, (y + 0.06 * math.sin(a)) * s)
    im.save(path)
    return path


def fila_tile(name='fila.png', w=512, h=256, base='#1b2350', colors=('#c8233b', '#f4efe6', '#d9a441')):
    """A woven fila band: zigzags, diamonds and gold stripes, repeating around the cap."""
    path = _path(name)
    if os.path.exists(path):
        return path
    red, white, gold = (_hex(c) for c in colors)
    im = Image.new('RGB', (w, h), _hex(base))
    d = ImageDraw.Draw(im)
    for y0, col in ((18, gold), (h - 26, gold)):
        d.rectangle([0, y0, w, y0 + 8], fill=col)
    step = 32
    for x in range(-step, w + step, step):
        d.line([(x, 60), (x + step / 2, 40), (x + step, 60)], fill=red, width=7)
        cx, cy = x + step / 2, 128
        d.polygon([(cx, cy - 34), (cx + 16, cy), (cx, cy + 34), (cx - 16, cy)], fill=white)
        d.polygon([(cx, cy - 18), (cx + 8, cy), (cx, cy + 18), (cx - 8, cy)], fill=red)
        d.line([(x, 200), (x + step / 2, 220), (x + step, 200)], fill=red, width=7)
    im.save(path)
    return path


def embroidery_strip(name='embroidery.png', w=512, h=64, thread='#e2bf63', base=None):
    """Gold embroidery for necklines and plackets: a border line, linked diamonds and stitch texture."""
    path = _path(name)
    if os.path.exists(path):
        return path
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0) if base is None else _hex(base) + (255,))
    d = ImageDraw.Draw(im)
    c = _hex(thread) + (255,)
    d.line([(0, 6), (w, 6)], fill=c, width=4)
    d.line([(0, h - 7), (w, h - 7)], fill=c, width=4)
    for x in range(0, w, 32):
        cx, cy = x + 16, h / 2
        d.polygon([(cx, cy - 16), (cx + 12, cy), (cx, cy + 16), (cx - 12, cy)], outline=c, width=3)
        d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=c)
        d.line([(x, cy), (cx - 12, cy)], fill=c, width=2)
    for x in range(0, w, 3):  # satin-stitch grain
        d.line([(x, 2), (x + 2, 10)], fill=c, width=1)
    im.save(path)
    return path


def jersey_print(name, lines, w=512, h=512, color='#ffffff', arch=None):
    """Transparent decal with lettering: lines = [(text, size_px, y_px)]; arch bends the first line."""
    path = _path(name)
    if os.path.exists(path):
        return path
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = _hex(color) + (255,)
    for k, (text, size, y) in enumerate(lines):
        font = ImageFont.truetype(FONT, size) if FONT else ImageFont.load_default()
        if arch and k == 0:
            widths = [d.textlength(ch, font=font) for ch in text]
            total = sum(widths)
            R = arch
            a = -total / R / 2
            for ch, cw in zip(text, widths):
                a += cw / R / 2
                cx, cy = w / 2 + R * math.sin(a), y + R * (1 - math.cos(a))
                glyph = Image.new('RGBA', (size * 2, size * 2), (0, 0, 0, 0))
                ImageDraw.Draw(glyph).text((size, size), ch, font=font, fill=col, anchor='mm')
                glyph = glyph.rotate(-math.degrees(a), resample=Image.BICUBIC)
                im.alpha_composite(glyph, (int(cx - size), int(cy - size)))
                a += cw / R / 2
        else:
            d.text((w / 2, y), text, font=font, fill=col, anchor='mm')
    im.save(path)
    return path


def _stitched(d, pts, stitch, edge, closed=False, width=3):
    """A seam: a darker fold line with a row of contrast stitches beside it."""
    seq = pts + ([pts[0]] if closed else [])
    d.line(seq, fill=edge, width=width + 2)
    for a, b in zip(seq[:-1], seq[1:]):
        L = math.dist(a, b)
        for k in range(int(L // 9)):
            t0, t1 = k * 9 / L, min(1, (k * 9 + 5) / L)
            off = 6
            nx, ny = (b[1] - a[1]) / L * off, -(b[0] - a[0]) / L * off
            d.line([(a[0] + (b[0] - a[0]) * t0 + nx, a[1] + (b[1] - a[1]) * t0 + ny),
                    (a[0] + (b[0] - a[0]) * t1 + nx, a[1] + (b[1] - a[1]) * t1 + ny)], fill=stitch, width=2)


def jeans_front(name='jeans-front.png', w=512, h=256, stitch='#d29a3c', edge='#1d2f57'):
    """Front of jeans (decal over x -0.18..0.18 m, a 0.15 m band below the waist): curved pocket openings, the fly,
    rivets and a copper button."""
    path = _path(name)
    if os.path.exists(path):
        return path
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    st, ed = _hex(stitch) + (255,), _hex(edge) + (230,)
    for sgn in (-1, 1):
        cx = w / 2 + sgn * 150
        arc = [(cx - sgn * 60 + sgn * 60 * (1 - math.cos(t)), 30 + 90 * math.sin(t)) for t in [i * math.pi / 2 / 10 for i in range(11)]]
        _stitched(d, arc, st, ed)
        r = 5
        d.ellipse([arc[0][0] - r, arc[0][1] - r + 6, arc[0][0] + r, arc[0][1] + r + 6], fill=_hex('#b07a3a') + (255,))
    _stitched(d, [(w / 2 + 6, 40), (w / 2 + 6, 170), (w / 2 + 34, 200), (w / 2 + 34, 40)], st, ed)
    d.ellipse([w / 2 - 12, 10, w / 2 + 12, 34], fill=_hex('#b9864a') + (255,), outline=_hex('#7a5528') + (255,), width=3)
    im.save(path)
    return path


def jeans_back(name='jeans-back.png', w=512, h=256, stitch='#d29a3c', edge='#1d2f57'):
    """Back of jeans (decal over x -0.18..0.18 m around the seat): the yoke and two patch pockets."""
    path = _path(name)
    if os.path.exists(path):
        return path
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    st, ed = _hex(stitch) + (255,), _hex(edge) + (230,)
    _stitched(d, [(0, 30), (w / 2, 70), (w, 30)], st, ed)
    for sgn in (-1, 1):
        cx = w / 2 + sgn * 120
        pocket = [(cx - 70, 80), (cx + 70, 80), (cx + 62, 200), (cx, 236), (cx - 62, 200)]
        _stitched(d, pocket, st, ed, closed=True)
        _stitched(d, [(cx - 40, 140), (cx, 160), (cx + 40, 140)], st, ed)
    _stitched(d, [(w / 2, 70), (w / 2, h)], st, ed)
    im.save(path)
    return path


def knee_seams(name='knee-seams.png', w=512, h=128, stitch='#5a5d62', edge='#26282c'):
    """Front of cargo trousers around the knees: articulated knee panels (two stitched seams on each leg)."""
    path = _path(name)
    if os.path.exists(path):
        return path
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for sgn in (-1, 1):
        cx = w / 2 + sgn * 128
        for y in (30, 98):
            _stitched(d, [(cx - 70, y), (cx, y + 10), (cx + 70, y)], _hex(stitch) + (255,), _hex(edge) + (220,))
    im.save(path)
    return path


# ----------------------------------------------------------------------------- shader building blocks


def _rest(n):
    a = n.new('ShaderNodeAttribute'); a.attribute_type = 'GEOMETRY'; a.attribute_name = 'rest'
    return a.outputs['Vector']


def _image(n, path, extension='REPEAT'):
    t = n.new('ShaderNodeTexImage')
    t.image = bpy.data.images.get(os.path.basename(path)) or bpy.data.images.load(path)
    t.extension = extension
    return t


def _mix(n, l, fac, a, b):
    m = n.new('ShaderNodeMix'); m.data_type = 'RGBA'
    for sock, val in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(val, (float, int)):
            sock.default_value = val
        elif isinstance(val, tuple):
            sock.default_value = val
        else:
            l.new(val, sock)
    return m.outputs[2]


def _math(n, l, op, a, b=None, clamp=False):
    m = n.new('ShaderNodeMath'); m.operation = op; m.use_clamp = clamp
    for sock, val in ((m.inputs[0], a), (m.inputs[1], b)):
        if val is None:
            continue
        if isinstance(val, (float, int)):
            sock.default_value = val
        else:
            l.new(val, sock)
    return m.outputs[0]


def _weave(n, l, rest, kind, scale):
    """Height for the cloth surface: twill (diagonal), knit (fine ribs) or plain weave."""
    w = n.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'
    w.bands_direction = 'DIAGONAL' if kind == 'twill' else ('Z' if kind == 'knit' else 'X')
    w.inputs['Scale'].default_value = scale
    w.inputs['Distortion'].default_value = 0.4
    l.new(rest, w.inputs['Vector'])
    return w.outputs['Fac']


def cloth(name, color, roughness=0.8, sheen=0.35, weave='plain', weave_scale=700, bump=0.12, print_fn=None):
    """
    A fabric: base colour (or a print), velvet-like sheen at grazing angles (cotton and wool), a woven or knitted
    surface. print_fn(nodes, links, rest, base_socket_or_colour) -> colour socket adds prints and decals.
    """
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    rest = _rest(n)
    col = srgb(color)
    out = print_fn(n, l, rest, col) if print_fn else None
    if out is None:
        b.inputs['Base Color'].default_value = col
    else:
        l.new(out, b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Sheen Weight'].default_value = sheen
    b.inputs['Sheen Roughness'].default_value = 0.45
    b.inputs['Sheen Tint'].default_value = tuple(min(1.0, x * 2.2 + 0.08) for x in col[:3]) + (1.0,)
    b.inputs['Specular IOR Level'].default_value = 0.3
    bp = n.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.001
    l.new(_weave(n, l, rest, weave, weave_scale), bp.inputs['Height'])
    l.new(bp.outputs['Normal'], b.inputs['Normal'])
    return mat


def boxed(path, tile_m):
    """print_fn: an image tiled over the garment by box projection (all-over prints such as ankara)."""
    def fn(n, l, rest, base):
        mp = n.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / tile_m,) * 3
        l.new(rest, mp.inputs['Vector'])
        t = _image(n, path)
        t.projection = 'BOX'; t.projection_blend = 0.3
        l.new(mp.outputs['Vector'], t.inputs['Vector'])
        return t.outputs['Color']
    return fn


def decals(*items, under=None):
    """
    print_fn: transparent images projected flat onto the front or back (jersey lettering).
    items: (path, side 'front'|'back', x_centre, z_centre, width, height, y_split).
    """
    def fn(n, l, rest, base):
        col = under(n, l, rest, base) if under else None
        cur = col if col is not None else base
        sep = n.new('ShaderNodeSeparateXYZ'); l.new(rest, sep.inputs['Vector'])
        for path, side, xc, zc, w, h, ysplit in items:
            sgn = 1 if side == 'front' else -1
            u = _math(n, l, 'ADD', _math(n, l, 'MULTIPLY', _math(n, l, 'SUBTRACT', sep.outputs['X'], xc), sgn / w), 0.5)
            v = _math(n, l, 'ADD', _math(n, l, 'MULTIPLY', _math(n, l, 'SUBTRACT', sep.outputs['Z'], zc), 1 / h), 0.5)
            cb = n.new('ShaderNodeCombineXYZ'); l.new(u, cb.inputs['X']); l.new(v, cb.inputs['Y'])
            t = _image(n, path, 'CLIP'); l.new(cb.outputs['Vector'], t.inputs['Vector'])
            facing = _math(n, l, 'LESS_THAN' if side == 'front' else 'GREATER_THAN', sep.outputs['Y'], ysplit)
            a = _math(n, l, 'MULTIPLY', t.outputs['Alpha'], facing)
            cur = _mix(n, l, a, cur, t.outputs['Color'])
        return cur
    return fn


def tonal(dark, scale=14.0, mix=0.35):
    """print_fn: a subtle tonal geometric pattern (sports jerseys)."""
    def fn(n, l, rest, base):
        w = n.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = 'DIAGONAL'
        w.inputs['Scale'].default_value = scale; w.inputs['Distortion'].default_value = 0.0
        l.new(rest, w.inputs['Vector'])
        stripe = _math(n, l, 'GREATER_THAN', w.outputs['Fac'], 0.6)
        return _mix(n, l, _math(n, l, 'MULTIPLY', stripe, mix), base, srgb(dark))
    return fn


def stripes(dark, scale=80.0, axis='Y', mix=0.6):
    """print_fn: even bands across one axis (laces, ribbing)."""
    def fn(n, l, rest, base):
        w = n.new('ShaderNodeTexWave'); w.wave_type = 'BANDS'; w.bands_direction = axis
        w.inputs['Scale'].default_value = scale; w.inputs['Distortion'].default_value = 0.0
        l.new(rest, w.inputs['Vector'])
        band = _math(n, l, 'GREATER_THAN', w.outputs['Fac'], 0.55)
        return _mix(n, l, _math(n, l, 'MULTIPLY', band, mix), base, srgb(dark))
    return fn


def denim(wash='#4a6ea8', fade='#9db7da', scale=5.0):
    """print_fn: denim: indigo with lighter, mottled wear along the front of the thighs and knees."""
    def fn(n, l, rest, base):
        noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = scale; noise.inputs['Detail'].default_value = 6
        l.new(rest, noise.inputs['Vector'])
        sep = n.new('ShaderNodeSeparateXYZ'); l.new(rest, sep.inputs['Vector'])
        front = _math(n, l, 'MULTIPLY', _math(n, l, 'LESS_THAN', sep.outputs['Y'], -0.0), 0.5)
        f = _math(n, l, 'MULTIPLY', noise.outputs['Fac'], front)
        f = _math(n, l, 'POWER', f, 1.5)
        c = _mix(n, l, f, srgb(wash), srgb(fade))
        streak = n.new('ShaderNodeTexNoise'); streak.inputs['Scale'].default_value = 900; l.new(rest, streak.inputs['Vector'])
        return _mix(n, l, _math(n, l, 'MULTIPLY', streak.outputs['Fac'], 0.08), c, srgb('#dfe6f0'))
    return fn


def strip(name, path, base, roughness=0.6, metallic=0.0, repeat_m=0.05):
    """For ribbons with UVs (u along the band in metres / repeat, v across): embroidery, ribbing, waistbands."""
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    b.inputs['Roughness'].default_value = roughness
    if path:
        uv = n.new('ShaderNodeUVMap')
        t = _image(n, path); l.new(uv.outputs['UV'], t.inputs['Vector'])
        l.new(_mix(n, l, t.outputs['Alpha'], srgb(base), t.outputs['Color']), b.inputs['Base Color'])
        mt = _math(n, l, 'MULTIPLY', t.outputs['Alpha'], metallic)
        l.new(mt, b.inputs['Metallic'])
    else:
        b.inputs['Base Color'].default_value = srgb(base)
    b.inputs['Sheen Weight'].default_value = 0.3
    return mat


def leather(name, color, roughness=0.45):
    mat = bpy.data.materials.new(name)
    nt, n, l = _nodes(mat)
    b = n['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(color)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Coat Weight'].default_value = 0.2
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 400
    bp = n.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.08
    l.new(noise.outputs['Fac'], bp.inputs['Height']); l.new(bp.outputs['Normal'], b.inputs['Normal'])
    return mat
