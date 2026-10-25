"""
Check a character's frames for jumps (reads the <tag>-anchors.json written by sprites.py; positions in world pixels).

  pivot     where the point between the feet lands in each direction (should be the anchor pixel exactly)
  head      scale consistency: the height of the top of the head, averaged over opposite directions (k and k+4).
            A head that sits a little forward of the feet is seen with parallax from the 8 sides, so single
            directions differ by design; opposite pairs cancel that, and must agree if the scale is the same.
  turn      how far the pelvis moves on screen when the character turns to a neighbouring direction at the same
            moment of the walk or idle cycle (what a player would see as a jump when changing direction)

Usage: python3 check_anchors.py <anchors.json> [...]     Prints a summary per file; exit code 1 if a check fails.
"""
import json
import math
import sys

LIMITS = {'pivot': 0.05, 'head': 1.0, 'turn': 3.0}  # world pixels


def check(path):
    d = json.load(open(path))
    ax, ay = d['frame']['ax'], d['frame']['ay']
    A = {int(k): v for k, v in d['anchors'].items()}
    pivot = max(math.dist(v['pivot'], (ax, ay)) for v in A.values())
    pairs = [(A[k]['frames']['idle0']['headTop'][1] + A[k + 4]['frames']['idle0']['headTop'][1]) / 2
             for k in range(4) if k in A and k + 4 in A and 'idle0' in A[k]['frames'] and 'idle0' in A[k + 4]['frames']]
    head = max(pairs) - min(pairs) if pairs else float('nan')
    turn = 0.0
    for k in sorted(A):
        n = (k + 1) % 8
        if n not in A:
            continue
        for label, f in A[k]['frames'].items():
            g = A[n]['frames'].get(label)
            if g:
                turn = max(turn, math.dist(f['pelvis'], g['pelvis']))
    res = {'pivot': pivot, 'head': head, 'turn': turn}
    ok = all(res[k] <= LIMITS[k] for k in res if not math.isnan(res[k]))
    print(f"{path.split('/')[-1]}: pivot error {pivot:.3f} px, scale (head height, opposite pairs) spread {head:.2f} px, "
          f"largest pelvis shift on a turn {turn:.2f} px -> {'OK' if ok else 'CHECK'}")
    return ok


if __name__ == '__main__':
    results = [check(p) for p in sys.argv[1:]]
    sys.exit(0 if all(results) else 1)
