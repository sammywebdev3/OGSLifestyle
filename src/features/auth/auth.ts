'use client';

import { getBrowserSupabase } from '@/lib/supabase/client';

export type AuthResult = { ok: true; needsConfirmation: boolean } | { ok: false; error: string };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { ok: false, error: 'Online accounts are not configured yet.' };
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback?next=/create` } });
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsConfirmation: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { ok: false, error: 'Online accounts are not configured yet.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, needsConfirmation: false };
}

/**
 * Ask Supabase to e-mail a password-reset link. The link returns through
 * /auth/callback (PKCE: the one-time code only works in THIS browser) to
 * /reset-password. Supabase answers the same way whether or not the e-mail has
 * an account, so this never reveals who is registered.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { ok: false, error: 'Online accounts are not configured yet.' };
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) return { ok: false, error: 'Too many requests. Please wait a minute and try again.' };
    return { ok: false, error: 'Could not send the reset e-mail. Please try again.' };
  }
  return { ok: true };
}

/** Set a new password for the signed-in user (the reset link signs them in first). */
export async function updatePassword(password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getBrowserSupabase();
  if (!supabase) return { ok: false, error: 'Online accounts are not configured yet.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return { ok: true };
  if (error.code === 'same_password') return { ok: false, error: 'Choose a password different from your old one.' };
  if (error.code === 'weak_password') return { ok: false, error: 'That password is too weak. Use a longer one, with a mix of characters.' };
  if (error.status === 401 || error.code === 'session_not_found' || error.code === 'reauthentication_needed') {
    return { ok: false, error: 'Your reset link has expired. Request a new one.' };
  }
  return { ok: false, error: 'Could not change your password. Please try again.' };
}
