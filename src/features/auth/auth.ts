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
