"""
Pack the frames rendered by sprites.py into game atlases: every frame is graded (to sit in the bright painted
world), its shadow feathered before the frame edge, then trimmed to its visible pixels and packed tightly. Phaser
keeps each frame's original size and anchor (TexturePacker-style JSON with spriteSourceSize), so trimming changes
memory, not placement.

Two qualities: 'hd' (2 texels per world pixel) and 'sd' (1.25 texels per world pixel, for low-memory phones).
Usage: python3 atlas.py <frames dir> <name> <out dir>   (needs Pillow + numpy)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageEnhance

FW, FH = 84, 88  # frame size in world pixels (must match sprites.py and src/game/characterLab/prototype.ts)
COLUMNS = [f'walk{i}' for i in range(8)] + [f'idle{i}' for i in range(4)]
QUALITIES = {'hd': 2.0, 'sd': 1.25}
GRADE = {'brightness': 1.14, 'color': 1.18, 'contrast': 1.06}
MAX_W = 2048


def grade(im):
    rgb, alpha = im.convert('RGB'), im.getchannel('A')
    rgb = ImageEnhance.Brightness(rgb).enhance(GRADE['brightness'])
    rgb = ImageEnhance.Color(rgb).enhance(GRADE['color'])
    rgb = ImageEnhance.Contrast(rgb).enhance(GRADE['contrast'])
    out = rgb.convert('RGBA'); out.putalpha(alpha)
    return out


def feather(im, right=0.3, bottom=0.1):
    """Fade the long sun shadow out before the frame's right and bottom edges (fractions of the frame), so it never
    ends in a hard line. The character itself never comes that close to those edges."""
    w, h = im.size
    fx = np.clip((w - 1 - np.arange(w)) / (right * w), 0, 1)
    fy = np.clip((h - 1 - np.arange(h)) / (bottom * h), 0, 1)
    alpha = np.asarray(im.getchannel('A'), dtype=np.float32) * fy[:, None] * fx[None, :]
    out = im.copy()
    out.putalpha(Image.fromarray(alpha.round().astype(np.uint8)))
    return out


def trim(im, pad=1):
    a = np.asarray(im.getchannel('A'))
    ys, xs = np.nonzero(a > 3)
    if not len(xs):
        return im.crop((0, 0, 1, 1)), (0, 0)
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(im.width, int(xs.max()) + 1 + pad), min(im.height, int(ys.max()) + 1 + pad)
    return im.crop((x0, y0, x1, y1)), (x0, y0)


def pack(sizes, max_w=MAX_W, gap=2):
    """Shelf packing, tallest first: returns positions and the atlas size."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    pos = [None] * len(sizes)
    x = y = shelf = 0
    width = 0
    for i in order:
        w, h = sizes[i]
        if x + w > max_w:
            x, y, shelf = 0, y + shelf + gap, 0
        pos[i] = (x, y)
        x += w + gap
        shelf = max(shelf, h)
        width = max(width, x)
    return pos, (width, y + shelf)


def build(frames_dir, name, out_dir, quality):
    res = QUALITIES[quality]
    fw, fh = round(FW * res), round(FH * res)
    names, crops, offsets = [], [], []
    for k in range(8):
        for label in COLUMNS:
            im = Image.open(os.path.join(frames_dir, f'{k}-{label}.png')).convert('RGBA')
            im = feather(grade(im.resize((fw, fh), Image.LANCZOS)))
            c, off = trim(im)
            names.append(f'{k}-{label}'); crops.append(c); offsets.append(off)
    pos, (W, H) = pack([c.size for c in crops])
    atlas = Image.new('RGBA', (W, H))
    frames = {}
    for nm, c, off, p in zip(names, crops, offsets, pos):
        atlas.paste(c, p)
        frames[nm] = {'frame': {'x': p[0], 'y': p[1], 'w': c.width, 'h': c.height}, 'rotated': False, 'trimmed': True,
                      'spriteSourceSize': {'x': off[0], 'y': off[1], 'w': c.width, 'h': c.height}, 'sourceSize': {'w': fw, 'h': fh}}
    os.makedirs(out_dir, exist_ok=True)
    img = f'{name}-{quality}.webp'
    atlas.save(os.path.join(out_dir, img), 'WEBP', quality=88, method=6, alpha_quality=90)
    meta = {'image': img, 'size': {'w': W, 'h': H}, 'scale': '1', 'texelsPerPixel': res,
            'gpuBytes': W * H * 4, 'fileBytes': os.path.getsize(os.path.join(out_dir, img))}
    with open(os.path.join(out_dir, f'{name}-{quality}.json'), 'w') as fh_:
        json.dump({'frames': frames, 'meta': meta}, fh_, separators=(',', ':'))
    return meta


def main():
    frames, name, out = sys.argv[1:4]
    for q in QUALITIES:
        m = build(frames, name, out, q)
        print(f"{name} {q}: {m['size']['w']}x{m['size']['h']}, {m['fileBytes'] / 1024:.0f} KB file, {m['gpuBytes'] / 1048576:.1f} MB GPU")


if __name__ == '__main__':
    main()
