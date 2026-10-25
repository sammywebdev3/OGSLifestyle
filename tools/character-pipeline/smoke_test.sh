#!/usr/bin/env bash
# Prove a pipeline environment works: render one character's sprites at low quality, check the anchoring, and
# render a front turnaround view. Run after setup.sh:  bash tools/character-pipeline/smoke_test.sh [character]
# Takes about 5-10 min on 4 CPU cores (Amaka, the default, is the quickest character).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${PY:?source env.sh from setup.sh first}" "${MH_DATA:?}" "${MPFB_DATA:?}"
NAME="${1:-amaka}"
export OUT_DIR="${OUT_DIR:-$(mktemp -d)}"
mkdir -p "$OUT_DIR"
cd "$HERE"
t0=$(date +%s)
SAMPLES=4 "$PY" sprites.py -- "$NAME" > "$OUT_DIR/$NAME-sprites.log" 2>&1 || { tail -30 "$OUT_DIR/$NAME-sprites.log"; exit 1; }
n=$(ls "$OUT_DIR/$NAME-frames" | wc -l)
[ "$n" -eq 96 ] || { echo "error: expected 96 frames, got $n" >&2; exit 1; }
"$PY" check_anchors.py "$OUT_DIR/$NAME-anchors.json"
SAMPLES=8 RS=0.5 VIEWS=front "$PY" turnaround.py -- "$NAME" > "$OUT_DIR/$NAME-turnaround.log" 2>&1 || { tail -30 "$OUT_DIR/$NAME-turnaround.log"; exit 1; }
[ -s "$OUT_DIR/$NAME-front.png" ] || { echo "error: no turnaround image" >&2; exit 1; }
"$PY" atlas.py "$OUT_DIR/$NAME-frames" "$NAME" "$OUT_DIR"
echo "smoke test passed in $(( $(date +%s) - t0 )) s: 96 frames, anchors OK, turnaround and atlases in $OUT_DIR"
