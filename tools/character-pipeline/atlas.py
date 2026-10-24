"""
Pack the frames rendered by sprites.py into the game atlas (WebP) and a contact sheet for review.
Usage: python3 atlas.py <frames dir> <name> <out dir>   (needs Pillow)
"""
import json
import os
import sys

import numpy as np

from PIL import Image, ImageEnhance

FW, FH, RES = 72, 80, 2
# A light grade so the characters sit in the bright, saturated painted world (applied to colour, not alpha).
GRADE = {'brightness': 1.14, 'color': 1.18, 'contrast': 1.06}


def grade(im):
    rgb, alpha = im.convert('RGB'), im.getchannel('A')
    rgb = ImageEnhance.Brightness(rgb).enhance(GRADE['brightness'])
    rgb = ImageEnhance.Color(rgb).enhance(GRADE['color'])
    rgb = ImageEnhance.Contrast(rgb).enhance(GRADE['contrast'])
    out = rgb.convert('RGBA'); out.putalpha(alpha)
    return out
COLUMNS = [f'walk{i}' for i in range(8)] + [f'idle{i}' for i in range(4)]


def feather(im, right=22, bottom=8):
    """Fade the long sun shadow out before the frame's right and bottom edges, so it never ends in a hard line.
    The character itself never comes that close to those edges (feet at AX=26 of 72, AY=72 of 80 world px)."""
    w, h = im.size
    fx = np.clip((w - 1 - np.arange(w)) / right, 0, 1)
    fy = np.clip((h - 1 - np.arange(h)) / bottom, 0, 1)
    alpha = np.asarray(im.getchannel('A'), dtype=np.float32) * fy[:, None] * fx[None, :]
    out = im.copy()
    out.putalpha(Image.fromarray(alpha.round().astype(np.uint8)))
    return out


def main():
    frames, name, out = sys.argv[1:4]
    w, h = FW * RES, FH * RES
    atlas = Image.new('RGBA', (w * len(COLUMNS), h * 8))
    for k in range(8):
        for c, label in enumerate(COLUMNS):
            im = grade(Image.open(os.path.join(frames, f'{k}-{label}.png')).convert('RGBA'))
            atlas.paste(feather(im.resize((w, h), Image.LANCZOS)), (c * w, k * h))
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, f'{name}.webp')
    atlas.save(path, 'WEBP', quality=88, method=6, alpha_quality=90)
    with open(os.path.join(out, f'{name}.json'), 'w') as fh:
        json.dump({'frame': {'w': FW, 'h': FH, 'res': RES}, 'columns': COLUMNS, 'rows': 'direction 0..7 (camera azimuth k*45 deg)',
                   'bytes': os.path.getsize(path)}, fh, indent=1)
    print(path, atlas.size, os.path.getsize(path), 'bytes')


if __name__ == '__main__':
    main()
