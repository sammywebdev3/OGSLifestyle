# Character pipeline

Builds the game's characters in headless Blender and renders them as pre-rendered isometric sprites. It produces:

- 8 directions × (8 walk + 4 idle) frames;
- as one baked image, or as body / outfit / hair layers;
- packed into HD and low-memory (SD) WebP atlases for `public/prototype-characters/`.

Everything runs from the command line. No Blender UI is needed.

## Setup (reproducible)

```sh
bash tools/character-pipeline/setup.sh                 # default home: ~/.cache/ogs-character-pipeline
source ~/.cache/ogs-character-pipeline/env.sh          # sets PY, MH_DATA, MPFB_DATA, OUT_DIR
bash tools/character-pipeline/smoke_test.sh            # proves the environment works (see below)
```

`setup.sh` does three things, and is safe to re-run (finished steps are skipped):

1. Creates a Python **3.13** venv and installs `requirements.txt`. Every package is pinned, including `bpy==5.2.3` (Blender 5.2 LTS as a Python module).
2. Fetches the **CC0** MakeHuman and MPFB2 data at the commits pinned in the script:
   - `makehumancommunity/makehuman` at `a8bc2d54ff0ac92e78ff71431b1023eda42bf482` (2024-06-26): base mesh, targets, skin and eye data;
   - `makehumancommunity/mpfb2` at `b1a2dc98776da9d1eea751b159d42cf61778fe2e` (2026-10-20): the `game_engine` rig and its weights.
3. Writes `env.sh`.

### Requirements

| | |
| --- | --- |
| Python | CPython **3.13** with `venv`. `bpy` wheels exist only for the Python version Blender pins. |
| Tools | `git`, network access to pypi.org and github.com (during setup only) |
| Fonts | Optional: `fonts-inter` (Debian/Ubuntu) for the jersey lettering. Without it the lettering falls back to Liberation or DejaVu Sans Bold, which changes how the jersey looks. |
| Disk | Venv 1.1 GB, MakeHuman data 158 MB, MPFB2 108 MB: **≈ 1.4 GB**. Plus about 2–15 MB of frames per character render and about 0.5 MB per atlas. |
| Setup time | **71 s** measured on a 4-core cloud container with a fast network. Mostly the 400 MB `bpy` download. |
| CPU | Cycles renders on the CPU (OIDN denoising). No GPU is needed. 4 cores is the minimum that's practical. |

### Smoke test (what "the environment works" means)

`smoke_test.sh [character]` (default `amaka`):

1. renders the character's 96 sprite frames at 4 samples;
2. runs `check_anchors.py` (feet on the anchor pixel in every direction, constant scale, no jump on a turn);
3. renders a front turnaround view;
4. packs the HD and SD atlases.

It exits non-zero on any failure.

Verified on 2026-10-25 in a brand-new environment:

| Step | Result |
| --- | --- |
| `setup.sh` into an empty folder | 71 s |
| `smoke_test.sh amaka` | **passed in 294 s** |
| Anchors | pivot error 0.000 px, scale spread 0.00 px, largest turn shift 1.04 px |
| Anchors vs the committed milestone-1 render | identical (0.000 px) |
| Silhouette vs the committed milestone-1 render | 98.5% match. The rest is render noise from 4 samples vs 16. |

## Rendering

```sh
cd tools/character-pipeline
SAMPLES=32 $PY turnaround.py -- femi                          # front / three-quarter / side / back / head
SAMPLES=16 $PY sprites.py -- femi                             # 96 frames + femi-anchors.json in $OUT_DIR
LAYERS=body,outfit,hair SAMPLES=16 $PY sprites.py -- tunde    # layered: body-tunde, outfit-tunde.tunde, hair-fade.tunde
LAYERS=outfit $PY sprites.py -- tunde femi fade               # Femi's outfit fitted to Tunde's body
$PY check_anchors.py $OUT_DIR/*-anchors.json                  # must print OK for every file
# layered vs baked, frame by frame, all 8 directions: gaps, clipping, seams (heatmap of the worst frames)
$PY check_layers.py --baked $OUT_DIR/tunde-frames \
    --layers $OUT_DIR/body-tunde-frames $OUT_DIR/outfit-tunde.tunde-frames $OUT_DIR/hair-fade.tunde-frames \
    --anchors $OUT_DIR/tunde-anchors.json --json tunde-layers.json --heatmap tunde-layers.png
$PY atlas.py $OUT_DIR/femi-frames femi ../../public/prototype-characters
```

Times on 4 CPU cores:

| Job | Time |
| --- | --- |
| Building one character, including the cloth simulation | 1–3 min |
| Full sprite set | 4–19 min per character |
| A set of three layers | about 26 min |

## Layers and the base body

`LAYERS=body` renders:

- the whole skin, unmasked, so an outfit that shows more skin never opens a hole;
- the face hair;
- neutral **base clothing** (`characters.base_clothes`): grey knit shorts, plus a sports top for female bodies.

The base clothing is cut from the body mesh itself, so it deforms with exactly the same weights. Its top edge stays
below the lowest neckline of any outfit, and it is drawn only in the body layer. Outfit and hair layers are drawn
over it.

`check_layers.py` composites the layers and compares them with a baked render of the same configuration. For
every frame and region (head and neck, shoulders and arms, waist and hands, legs, feet) it flags:

- **holes:** the baked render is opaque and the stack transparent;
- **extra coverage:** the stack sticks out (clipping);
- **colour seams:** the colours differ a lot.

A frame fails when a flagged blob is larger than the limit. Skin that the *baked* render had masked away (a dress
slit opening while walking) is reported separately. In that case the stack is right and the baked frame has the gap.

## Updating a pinned dependency

1. Change the pin, either in `requirements.txt` or the `*_SHA` lines in `setup.sh`.
2. Run `setup.sh` into a new folder, then `smoke_test.sh`.
3. Re-render one character and compare its anchors and frames with the committed atlases.
4. Commit the pin change together with any re-rendered atlases.

## Licences

| Part | Licence |
| --- | --- |
| Blender (`bpy`) | GPL. It is a build tool only; nothing from it ships in the game. |
| MakeHuman assets and MPFB2 rig data | CC0 |
| MakeHuman motion files (AGPL) | **not used** |
| Garments, hair, fabrics, animation and these scripts | this repository's own work |
