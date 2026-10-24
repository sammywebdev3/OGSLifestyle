/**
 * Character lab (prototype): pure helpers for the pre-rendered 3D character sprites.
 * The atlases are made by tools/character-pipeline (sprites.py renders, atlas.py packs): frames named
 * '<direction>-<column>', direction k = camera azimuth k * 45 degrees around the character, columns walk0..7 and
 * idle0..3. Frames are trimmed to their visible pixels; Phaser keeps their full size and anchor.
 */
import type { AvatarSelection } from '@/types/player';

export const LAB_CHARACTERS = ['tunde', 'femi', 'amaka', 'zainab'] as const;
export type LabCharacter = (typeof LAB_CHARACTERS)[number];

/** Frame layout in world pixels (feet at ax, ay). Must match sprites.py / atlas.py. */
export const LAB_FRAME = { w: 84, h: 88, ax: 32, ay: 78 } as const;
export const LAB_WALK = 8;
export const LAB_IDLE = 4;
export const LAB_COLUMNS = LAB_WALK + LAB_IDLE;
const COLUMN_NAMES = [...Array.from({ length: LAB_WALK }, (_, i) => `walk${i}`), ...Array.from({ length: LAB_IDLE }, (_, i) => `idle${i}`)];

/** Atlas qualities: texels per world pixel. 'sd' is for phones with little memory (about 40% of 'hd'). */
export const LAB_QUALITY = { hd: 2, sd: 1.25 } as const;
export type LabQuality = keyof typeof LAB_QUALITY;

export const labTextureKey = (c: LabCharacter) => `lab-char-${c}`;
export const labAtlasUrls = (c: LabCharacter, q: LabQuality) => ({
  image: `/prototype-characters/${c}-${q}.webp`,
  json: `/prototype-characters/${c}-${q}.json`,
});

/** 'sd' atlases on devices reporting 4 GB of memory or less (navigator.deviceMemory), unless overridden. */
export function labQuality(deviceMemory: number | undefined, override?: string | null): LabQuality {
  if (override === 'hd' || override === 'sd') return override;
  return deviceMemory !== undefined && deviceMemory <= 4 ? 'sd' : 'hd';
}

/**
 * The prototype has four characters, so each existing avatar choice maps to the closest one. A full
 * implementation would render every body / skin / headwear / outfit option (the choices stay unchanged).
 */
export function labCharacterFor(avatar: AvatarSelection): LabCharacter {
  const traditional = avatar.outfit === 'adire' || avatar.outfit === 'cream' || avatar.outfit === 'ogun';
  if (avatar.body === 'masc') return traditional || avatar.headwear === 'fila' ? 'femi' : 'tunde';
  return traditional || avatar.headwear === 'gele' || avatar.headwear === 'braids' ? 'amaka' : 'zainab';
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
