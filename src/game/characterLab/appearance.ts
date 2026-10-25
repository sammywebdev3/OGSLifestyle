/**
 * Character lab: what a pre-rendered character wears, as a typed { body, outfit, hair } appearance, and how it is
 * drawn from the atlases that exist.
 *
 * The appearance is the customisation model: a body (face, skin tone, build: one of the rendered bodies), an outfit
 * and a hairstyle or headwear. It is derived from today's AvatarSelection (appearanceFor), so every existing avatar
 * choice keeps working and nothing new is stored or sent: local and remote players get their appearance from the
 * same AvatarSelection through the same function, so they are drawn by the same rules.
 *
 * resolveLook turns an appearance into the atlases to draw:
 *   1. the baked atlas when the appearance is exactly one of the four baked characters (one texture, one sprite);
 *   2. otherwise the layers (body, outfit, hair) when that body has that outfit and hairstyle rendered;
 *   3. otherwise the closest look that exists: the body's own layers with substitutes, or the body's baked look.
 * The result says whether it is exact, so missing combinations are visible in tests and reports.
 */
import type { AvatarSelection } from '@/types/player';
import type { LabLook } from './prototype';

export const APPEARANCE_BODIES = ['tunde', 'femi', 'amaka', 'zainab'] as const;
export const APPEARANCE_OUTFITS = ['jersey', 'senator', 'ankara', 'croptank'] as const;
export const APPEARANCE_HAIR = ['fade', 'fila', 'braided_bun', 'big_afro'] as const;
export type AppearanceBody = (typeof APPEARANCE_BODIES)[number];
export type AppearanceOutfit = (typeof APPEARANCE_OUTFITS)[number];
export type AppearanceHair = (typeof APPEARANCE_HAIR)[number];

export interface CharacterAppearance {
  body: AppearanceBody;
  outfit: AppearanceOutfit;
  hair: AppearanceHair;
}

/** Outfit ids in the render pipeline (tools/character-pipeline/outfits.py names outfits after their character). */
const PIPELINE_OUTFIT: Record<AppearanceOutfit, string> = { jersey: 'tunde', senator: 'femi', ankara: 'amaka', croptank: 'zainab' };

/** The four baked characters: their own body, outfit and hair, in one atlas each. */
export const BAKED: Record<AppearanceBody, CharacterAppearance> = {
  tunde: { body: 'tunde', outfit: 'jersey', hair: 'fade' },
  femi: { body: 'femi', outfit: 'senator', hair: 'fila' },
  amaka: { body: 'amaka', outfit: 'ankara', hair: 'braided_bun' },
  zainab: { body: 'zainab', outfit: 'croptank', hair: 'big_afro' },
};

/**
 * Layer atlases rendered per body (public/prototype-characters): outfits and hairstyles are fitted to each body, so
 * a body lists the ones made for it. Bodies without an entry are only available baked.
 */
export const LAYERED: Partial<Record<AppearanceBody, { outfits: readonly AppearanceOutfit[]; hair: readonly AppearanceHair[] }>> = {
  tunde: { outfits: ['jersey', 'senator'], hair: ['fade', 'fila'] },
  amaka: { outfits: ['ankara', 'croptank'], hair: ['braided_bun', 'big_afro'] },
};

export const bodyAtlas = (body: AppearanceBody) => `body-${body}`;
export const outfitAtlas = (outfit: AppearanceOutfit, body: AppearanceBody) => `outfit-${PIPELINE_OUTFIT[outfit]}.${body}`;
export const hairAtlas = (hair: AppearanceHair, body: AppearanceBody) => `hair-${hair}.${body}`;

const TRADITIONAL = new Set<AvatarSelection['outfit']>(['adire', 'cream', 'ogun']);

/**
 * Today's avatar choices -> an appearance. Body type and skin tone pick the body (the rendered bodies carry their
 * own skin tone); the outfit colour picks traditional or casual wear; headwear picks the hairstyle. Every one of the
 * 240 existing combinations maps to an appearance (tested).
 */
export function appearanceFor(avatar: AvatarSelection): CharacterAppearance {
  const traditional = TRADITIONAL.has(avatar.outfit);
  if (avatar.body === 'masc') {
    return {
      body: avatar.skin === 'deep' ? 'tunde' : 'femi',
      outfit: traditional ? 'senator' : 'jersey',
      hair: avatar.headwear === 'fila' ? 'fila' : 'fade',
    };
  }
  return {
    body: avatar.skin === 'deep' || avatar.skin === 'brown' ? 'amaka' : 'zainab',
    outfit: traditional ? 'ankara' : 'croptank',
    hair: avatar.headwear === 'none' || avatar.headwear === 'cap' ? 'big_afro' : 'braided_bun',
  };
}

export interface ResolvedLook {
  look: LabLook;
  /** The appearance actually drawn (differs from the request when a combination has not been rendered). */
  drawn: CharacterAppearance;
  exact: boolean;
  kind: 'baked' | 'layered';
}

const same = (a: CharacterAppearance, b: CharacterAppearance) => a.body === b.body && a.outfit === b.outfit && a.hair === b.hair;

export function resolveLook(want: CharacterAppearance): ResolvedLook {
  const baked = BAKED[want.body];
  if (same(want, baked)) return { look: { atlases: [want.body] }, drawn: baked, exact: true, kind: 'baked' };
  const layers = LAYERED[want.body];
  if (layers) {
    const outfit = layers.outfits.includes(want.outfit) ? want.outfit : baked.outfit;
    const hair = layers.hair.includes(want.hair) ? want.hair : baked.hair;
    const drawn = { body: want.body, outfit, hair };
    if (same(drawn, baked)) return { look: { atlases: [want.body] }, drawn, exact: false, kind: 'baked' };
    return {
      look: { atlases: [bodyAtlas(want.body), outfitAtlas(outfit, want.body), hairAtlas(hair, want.body)] },
      drawn, exact: same(drawn, want), kind: 'layered',
    };
  }
  return { look: { atlases: [want.body] }, drawn: baked, exact: false, kind: 'baked' };
}

/** Every atlas any appearance can resolve to (what public/prototype-characters must contain). */
export function allAppearanceAtlases(): string[] {
  const out = new Set<string>(APPEARANCE_BODIES);
  for (const body of APPEARANCE_BODIES) {
    const layers = LAYERED[body];
    if (!layers) continue;
    out.add(bodyAtlas(body));
    for (const o of layers.outfits) out.add(outfitAtlas(o, body));
    for (const h of layers.hair) out.add(hairAtlas(h, body));
  }
  return [...out].sort();
}
