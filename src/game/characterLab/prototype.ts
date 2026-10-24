/**
 * Character lab (prototype): pure helpers for the pre-rendered 3D character sprites.
 * The atlases are made by tools/character-pipeline/sprites.py: one row per facing direction (camera azimuth
 * k * 45 degrees around the character), columns walk0..7 then idle0..3.
 */
import type { AvatarSelection } from '@/types/player';

export const LAB_CHARACTERS = ['tunde', 'femi', 'amaka', 'zainab'] as const;
export type LabCharacter = (typeof LAB_CHARACTERS)[number];

/** Frame layout in world pixels; the atlas holds RES texels per world pixel. Must match sprites.py. */
export const LAB_FRAME = { w: 72, h: 80, ax: 26, ay: 72, res: 2 } as const;
export const LAB_WALK = 8;
export const LAB_IDLE = 4;
export const LAB_COLUMNS = LAB_WALK + LAB_IDLE;

export const labTextureKey = (c: LabCharacter) => `lab-char-${c}`;
export const labAtlasUrl = (c: LabCharacter) => `/prototype-characters/${c}.webp`;

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

/** Atlas frame index for a direction and a column (walk i or LAB_WALK + idle i). */
export const labFrame = (direction: number, column: number) => direction * LAB_COLUMNS + column;
