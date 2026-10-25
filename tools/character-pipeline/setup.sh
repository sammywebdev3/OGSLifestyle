#!/usr/bin/env bash
# Reproducible setup for the character pipeline (see README.md). Creates a Python 3.13 venv with the pinned packages
# and fetches the CC0 MakeHuman and MPFB2 data at pinned commits. Safe to re-run: finished steps are skipped.
#
#   bash tools/character-pipeline/setup.sh [PIPELINE_HOME]     (default: ~/.cache/ogs-character-pipeline)
#   source "$PIPELINE_HOME/env.sh"                              # sets PY, MH_DATA, MPFB_DATA, OUT_DIR
#
# Needs: python3.13 (with venv), git, ~1.6 GB of disk, network access to pypi.org and github.com.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${1:-${PIPELINE_HOME:-$HOME/.cache/ogs-character-pipeline}}"
PYTHON="${PYTHON:-python3.13}"

# CC0 asset repositories, pinned (update deliberately, then re-render and re-check: the bodies depend on them).
MAKEHUMAN_URL=https://github.com/makehumancommunity/makehuman.git
MAKEHUMAN_SHA=a8bc2d54ff0ac92e78ff71431b1023eda42bf482   # 2024-06-26
MPFB2_URL=https://github.com/makehumancommunity/mpfb2.git
MPFB2_SHA=b1a2dc98776da9d1eea751b159d42cf61778fe2e       # 2026-10-20

mkdir -p "$HOME_DIR"
command -v "$PYTHON" >/dev/null || { echo "error: $PYTHON not found (bpy 5.2 needs CPython 3.13)" >&2; exit 1; }

fetch() {  # url sha dir: a shallow checkout of exactly one commit
  local url=$1 sha=$2 dir=$3
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD)" = "$sha" ]; then
    echo "ok: $(basename "$dir") at $sha"; return
  fi
  rm -rf "$dir"; mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$url"
  git -C "$dir" fetch -q --depth 1 origin "$sha"
  git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
  [ "$(git -C "$dir" rev-parse HEAD)" = "$sha" ] || { echo "error: $dir is not at $sha" >&2; exit 1; }
  echo "fetched: $(basename "$dir") at $sha"
}

t0=$(date +%s)
if [ ! -x "$HOME_DIR/venv/bin/python" ]; then
  "$PYTHON" -m venv "$HOME_DIR/venv"
fi
"$HOME_DIR/venv/bin/python" -m pip install -q --disable-pip-version-check -r "$HERE/requirements.txt"
fetch "$MAKEHUMAN_URL" "$MAKEHUMAN_SHA" "$HOME_DIR/makehuman"
fetch "$MPFB2_URL" "$MPFB2_SHA" "$HOME_DIR/mpfb2"

[ -f /usr/share/fonts/opentype/inter/Inter-ExtraBold.otf ] || \
  echo "note: Inter ExtraBold not found (Debian/Ubuntu: apt install fonts-inter); the jersey lettering falls back to Liberation or DejaVu Sans Bold" >&2

cat > "$HOME_DIR/env.sh" <<ENV
export PY="$HOME_DIR/venv/bin/python"
export MH_DATA="$HOME_DIR/makehuman/makehuman/data"
export MPFB_DATA="$HOME_DIR/mpfb2/src/mpfb/data"
export OUT_DIR="\${OUT_DIR:-$HOME_DIR/out}"
ENV
"$HOME_DIR/venv/bin/python" -c "import bpy; print('bpy', bpy.app.version_string)"
echo "setup done in $(( $(date +%s) - t0 )) s; now: source $HOME_DIR/env.sh"
