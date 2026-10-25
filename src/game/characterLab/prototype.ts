/**
 * Character lab (prototype): pure helpers for the pre-rendered 3D character sprites.
 * The atlases are made by tools/character-pipeline (sprites.py renders, atlas.py packs): frames named
 * '<direction>-<column>', direction k = camera azimuth k * 45 degrees around the character, columns walk0..7 and
 * idle0..3. Frames are trimmed to their visible pixels; Phaser keeps their full size and anchor.
 */
/** Frame layout in world pixels (feet at ax, ay). Must match sprites.py / atlas.py. */
export const LAB_FRAME = { w: 84, h: 88, ax: 32, ay: 78 } as const;
export const LAB_WALK = 8;
export const LAB_IDLE = 4;
export const LAB_COLUMNS = LAB_WALK + LAB_IDLE;
const COLUMN_NAMES = [...Array.from({ length: LAB_WALK }, (_, i) => `walk${i}`), ...Array.from({ length: LAB_IDLE }, (_, i) => `idle${i}`)];

/** Atlas qualities: texels per world pixel. 'sd' is for phones with little memory (about 40% of 'hd'). */
export const LAB_QUALITY = { hd: 2, sd: 1.25 } as const;
export type LabQuality = keyof typeof LAB_QUALITY;

/**
 * A look is the atlases drawn for one character, bottom to top. A baked character is one atlas; a layered one stacks
 * body (skin, face, beard, neutral base clothing), outfit (clothes, shoes, accessories, ground shadow) and hair
 * (hairstyle or headwear). Layers share frame names and anchors, so any outfit or hairstyle rendered on a body can be
 * combined with it without rendering the combination (see tools/character-pipeline/sprites.py LAYERS). Which look a
 * character gets is decided by its appearance (appearance.ts).
 */
export interface LabLook { atlases: readonly string[] }

export const labTextureKey = (atlas: string) => `lab-${atlas}`;
export const labAtlasUrls = (atlas: string, q: LabQuality) => ({
  image: `/prototype-characters/${encodeURIComponent(atlas)}-${q}.webp`,
  json: `/prototype-characters/${encodeURIComponent(atlas)}-${q}.json`,
});

/** 'sd' atlases on devices reporting 4 GB of memory or less (navigator.deviceMemory), unless overridden. */
export function labQuality(deviceMemory: number | undefined, override?: string | null): LabQuality {
  if (override === 'hd' || override === 'sd') return override;
  return deviceMemory !== undefined && deviceMemory <= 4 ? 'sd' : 'hd';
}

/**
 * Facing direction (atlas row 0..7) for a movement on screen (x right, y down, any length).
 * Screen y is the ground squashed by half in 2:1 isometric, so it is doubled to get back the ground angle.
 * Returns null for no movement (keep the current direction).
 */
export function pickDirection(screenDx: number, screenDy: number): number | null {
  if (Math.abs(screenDx) < 1e-6 && Math.abs(screenDy) < 1e-6) return null;
  const a = Math.atan2(-screenDx, 2 * screenDy);
  return (((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8);
}

/** Atlas frame name for a direction and a column (walk i, or LAB_WALK + idle i). */
export const labFrame = (direction: number, column: number) => `${direction}-${COLUMN_NAMES[column]}`;
