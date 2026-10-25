"""
Check that stacked layers (body -> outfit -> hair) draw the same character as the baked render, frame by frame, in
every direction: no transparency gaps, no extra coverage from clipping layers, no seams.

For every frame (96: 8 directions x 8 walk + 4 idle) the layers are composited and compared with the baked frame:

  hole     baked is opaque but the stack is (nearly) transparent: a gap the background would show through
  extra    the stack is opaque where the baked render is transparent: a layer sticks out (clipping)
  colour   both opaque but the colour differs a lot: a seam, the wrong layer in front, base clothing showing
  base     the neutral base clothing of the body layer shows in the stack (it must stay under the outfit).
           Needs --base: frames of the 'base' validation pass (sprites.py LAYERS=base).
  skin     (reported, not a failure) the stack shows body-layer skin where the baked render shows background or
           the inside of a garment. The baked render hides skin that its outfit covers (tailor.hide_under) and
           over-hides it where a garment opens while walking (a dress slit, a tank's armhole): the baked frame has
           the gap and the stack is right. Only pixels drawn by the body layer alone count (the first --layers
           directory must be the body); without --base, base clothing would also be counted here.

Single stray pixels at anti-aliased edges are normal (the layers are rendered separately), so a frame only fails when
flagged pixels form a connected blob larger than the limit. Flagged pixels are also counted per body region (by
height between the top of the head and the feet, from <tag>-anchors.json) and per direction, so a problem can be
traced to the neck, shoulders, arms, waist, hands, legs or feet.

Usage:
  python3 check_layers.py --baked DIR --layers DIR [DIR ...] [--anchors FILE] [--name NAME] [--json OUT] [--heatmap OUT]
Exit code 1 if any frame fails. Needs numpy and Pillow.
"""
import argparse
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

OPAQUE, CLEAR = 0.6, 0.25        # alpha thresholds
COLOUR = 48                      # max channel difference (0-255) that counts as a different colour
LIMITS = {'hole': 12, 'extra': 12, 'colour': 40, 'base': 12}   # largest allowed connected blob, in frame pixels (4 per world px)
REGIONS = [('head/neck', 0.0, 0.2), ('shoulders/arms', 0.2, 0.45), ('waist/hands', 0.45, 0.6),
           ('legs', 0.6, 0.93), ('feet', 0.93, 1.1)]
DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']


def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0


def stack(paths):
    """The composite, and where only the first layer (the body) is visible."""
    out, rest = None, None
    for i, p in enumerate(paths):
        im = Image.open(p).convert('RGBA')
        out = im if out is None else Image.alpha_composite(out, im)
        if i:
            rest = im if rest is None else Image.alpha_composite(rest, im)
    comp = np.asarray(out).astype(np.float32) / 255.0
    first = np.asarray(Image.open(paths[0]).convert('RGBA'))[..., 3] / 255.0
    others = np.asarray(rest)[..., 3] / 255.0 if rest is not None else np.zeros_like(first)
    return comp, (first > OPAQUE) & (others < CLEAR)


def largest_blob(mask):
    """Size of the largest 8-connected component of a boolean image."""
    seen = np.zeros_like(mask, dtype=bool)
    best = 0
    H, W = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        n = 0
        q = deque([(y, x)])
        seen[y, x] = True
        while q:
            cy, cx = q.popleft()
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
        best = max(best, n)
    return best


def flags(baked, comp, body_only, base_vis):
    ab, ac = baked[..., 3], comp[..., 3]
    hole = (ab > OPAQUE) & (ac < CLEAR)
    extra = (ac > OPAQUE) & (ab < CLEAR)
    both = (ab > OPAQUE) & (ac > OPAQUE)
    diff = np.abs(baked[..., :3] - comp[..., :3]).max(axis=2) * 255
    colour = both & (diff > COLOUR)
    base = body_only & base_vis
    skin = (extra | colour) & body_only & ~base_vis
    differs = extra | colour
    return {'hole': hole, 'extra': extra & ~body_only, 'colour': colour & ~body_only, 'base': base & differs, 'skin': skin}


def regions(mask, head_y, feet_y):
    ys = np.nonzero(mask)[0]
    out = {}
    span = max(feet_y - head_y, 1.0)
    for name, a, b in REGIONS:
        out[name] = int(((ys >= head_y + a * span) & (ys < head_y + b * span)).sum())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--baked', required=True)
    ap.add_argument('--layers', nargs='+', required=True)
    ap.add_argument('--anchors')
    ap.add_argument('--base', help="frames of the 'base' validation pass for this body")
    ap.add_argument('--name', default=None)
    ap.add_argument('--json')
    ap.add_argument('--heatmap')
    a = ap.parse_args()
    name = a.name or ' + '.join(os.path.basename(d.rstrip('/')).removesuffix('-frames') for d in a.layers)
    anchors = json.load(open(a.anchors)) if a.anchors else None
    files = sorted(f for f in os.listdir(a.baked) if f.endswith('.png'))
    per_frame, worst = [], []
    KINDS = list(LIMITS) + ['skin']
    totals = {k: {r[0]: 0 for r in REGIONS} for k in KINDS}
    by_dir = {k: [0] * 8 for k in KINDS}
    failed = 0
    for f in files:
        baked = load(os.path.join(a.baked, f))
        comp, body_only = stack([os.path.join(d, f) for d in a.layers])
        scale = baked.shape[1] / 84.0
        k, label = f[:-4].split('-', 1)
        if anchors:
            fr = anchors['anchors'][k]['frames'][label]
            head_y, feet_y = fr['headTop'][1] * scale, fr['feet'][1] * scale
        else:
            ys = np.nonzero(baked[..., 3] > OPAQUE)[0]
            head_y, feet_y = float(ys.min()), float(ys.max())
        if a.base:
            base_vis = np.asarray(Image.open(os.path.join(a.base, f)).convert('RGBA'))[..., 3] / 255.0 > CLEAR
        else:
            base_vis = np.zeros(body_only.shape, bool)
        fl = flags(baked, comp, body_only, base_vis)
        blobs = {key: largest_blob(m) for key, m in fl.items() if key in LIMITS}
        skin_px = int(fl['skin'].sum())
        bad = [key for key in LIMITS if blobs[key] > LIMITS[key]]
        failed += bool(bad)
        for key, m in fl.items():
            for r, n in regions(m, head_y, feet_y).items():
                totals[key][r] += n
            by_dir[key][int(k)] += int(m.sum())
        either = (baked[..., 3] > OPAQUE) | (comp[..., 3] > OPAQUE)
        mean = float(np.abs(baked - comp)[either].mean() * 255) if either.any() else 0.0
        per_frame.append({'frame': f[:-4], 'meanDiff': round(mean, 2), 'blobs': blobs, 'bakedMaskedSkinPx': skin_px, 'fail': bad})
        worst.append((sum(blobs.values()), f, baked, comp, fl))
    worst.sort(key=lambda w: -w[0])
    summary = {
        'name': name, 'frames': len(files), 'failedFrames': failed, 'limits': LIMITS,
        'meanDiff': round(float(np.mean([p['meanDiff'] for p in per_frame])), 2),
        'largestBlob': {key: max(p['blobs'][key] for p in per_frame) for key in LIMITS},
        'bakedMaskedSkinPx': sum(p['bakedMaskedSkinPx'] for p in per_frame),
        'pixelsByRegion': totals, 'pixelsByDirection': {key: dict(zip(DIRS, v)) for key, v in by_dir.items()},
        'worstFrames': [w[1][:-4] for w in worst[:4]],
    }
    if a.json:
        with open(a.json, 'w') as fh:
            json.dump({'summary': summary, 'frames': per_frame}, fh, indent=1)
    if a.heatmap:
        tiles = []
        for _, f, baked, comp, fl in worst[:4]:
            row = []
            for im in (baked, comp):
                bg = np.ones_like(im[..., :3]) * np.array([214, 196, 160]) / 255
                row.append(im[..., :3] * im[..., 3:] + bg * (1 - im[..., 3:]))
            heat = row[1] * 0.35 + 0.65
            heat[fl['hole']] = [1, 0, 0]
            heat[fl['extra']] = [0, 0.4, 1]
            heat[fl['colour']] = [1, 0.75, 0]
            heat[fl['skin']] = [0.2, 0.75, 0.3]
            heat[fl['base']] = [0.8, 0, 0.8]
            row.append(heat)
            tiles.append(np.concatenate(row, axis=1))
        Image.fromarray((np.concatenate(tiles, axis=0) * 255).clip(0, 255).astype(np.uint8)).save(a.heatmap)
    lb = summary['largestBlob']
    print(f"{name}: {len(files)} frames, mean diff {summary['meanDiff']}/255, largest blob hole {lb['hole']} / "
          f"extra {lb['extra']} / colour {lb['colour']} / base {lb['base']} px; skin the baked render hid: {summary['bakedMaskedSkinPx']} px "
          f"-> {'OK' if not failed else f'{failed} frames FAIL'}")
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
