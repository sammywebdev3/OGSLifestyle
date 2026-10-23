/**
 * New-password rules for the reset form. Supabase Auth enforces its own rules
 * again on the server; these give instant, clear feedback.
 * (No imports, so it can be unit-tested with Node directly.)
 */

export const PASSWORD_MIN = 8;
/** Supabase Auth hashes passwords with bcrypt, which only uses the first 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function validateNewPassword(password: unknown, confirm: unknown): PasswordCheck {
  if (typeof password !== 'string' || typeof confirm !== 'string') return { ok: false, error: 'Enter your new password twice.' };
  if (password.length < PASSWORD_MIN) return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return { ok: false, error: 'Password is too long (72 bytes at most).' };
  if (password.trim().length === 0) return { ok: false, error: 'Password cannot be only spaces.' };
  if (password !== confirm) return { ok: false, error: 'The two passwords do not match.' };
  return { ok: true };
}

/** Very loose email shape check (the server is the real judge). */
export function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
