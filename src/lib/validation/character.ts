/**
 * Character input validation. Used by the client for instant feedback AND by the
 * server before anything is written. The database enforces the same rules again.
 * (No imports, so it can be unit-tested with Node directly.)
 */

export const NAME_MIN = 3;
export const NAME_MAX = 20;
const NAME_PATTERN = /^[\p{L}][\p{L}' .-]*$/u;

const BODY = ['masc', 'femme'] as const;
const SKIN = ['deep', 'brown', 'warm', 'light'] as const;
const HEADWEAR = ['none', 'fila', 'gele', 'cap', 'braids'] as const;
const OUTFIT = ['ogun', 'adire', 'laterite', 'palm', 'cream', 'ink'] as const;

export interface ValidAvatar {
  body: (typeof BODY)[number];
  skin: (typeof SKIN)[number];
  headwear: (typeof HEADWEAR)[number];
  outfit: (typeof OUTFIT)[number];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function normaliseName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

export function validateCharacterName(raw: unknown): ValidationResult<string> {
  const name = normaliseName(raw);
  const errors: string[] = [];
  if (name.length < NAME_MIN) errors.push(`Name must be at least ${NAME_MIN} characters.`);
  if (name.length > NAME_MAX) errors.push(`Name must be at most ${NAME_MAX} characters.`);
  if (name && !NAME_PATTERN.test(name)) errors.push('Name can only use letters, spaces, apostrophes, dots and hyphens.');
  return errors.length ? { ok: false, errors } : { ok: true, value: name };
}

function oneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

export function validateAvatar(raw: unknown): ValidationResult<ValidAvatar> {
  const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const errors: string[] = [];
  if (!oneOf(BODY, a.body)) errors.push('Choose a body type.');
  if (!oneOf(SKIN, a.skin)) errors.push('Choose a skin tone.');
  if (!oneOf(HEADWEAR, a.headwear)) errors.push('Choose a hairstyle or headwear.');
  if (!oneOf(OUTFIT, a.outfit)) errors.push('Choose an outfit colour.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { body: a.body, skin: a.skin, headwear: a.headwear, outfit: a.outfit } as ValidAvatar };
}

/** Validates a whole create-character request body. Unknown fields (e.g. "cash") are ignored. */
export function validateCreateCharacter(raw: unknown): ValidationResult<{ characterName: string; avatar: ValidAvatar }> {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = validateCharacterName(body.characterName);
  const avatar = validateAvatar(body.avatar);
  const errors = [...(name.ok ? [] : name.errors), ...(avatar.ok ? [] : avatar.errors)];
  if (!name.ok || !avatar.ok) return { ok: false, errors };
  return { ok: true, value: { characterName: name.value, avatar: avatar.value } };
}
