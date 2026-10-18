/**
 * Supabase configuration detection. Only PUBLIC values are read here; the secret
 * key is read exclusively in ./admin.ts (server-only).
 *
 * Key names: Supabase now issues a "publishable" key (sb_publishable_…). Older
 * projects show an "anon" key instead. Either works for the browser:
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (preferred)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY         (fallback, backward compatible)
 *
 * Missing values, or the placeholders from .env.example, mean "not configured":
 * the app then runs in offline guest mode instead of failing.
 */

const PLACEHOLDER = /your-project-ref|your-publishable-key|your-anon-public-key|^\s*$/;

export interface PublicSupabaseEnv {
  url: string;
  /** Publishable (or legacy anon) key — safe for the browser; RLS protects data. */
  publicKey: string;
}

const usable = (v: string | undefined): v is string => typeof v === 'string' && !PLACEHOLDER.test(v);

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  // Referenced literally so Next.js inlines them into the client bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const publicKey = usable(publishable) ? publishable : usable(anon) ? anon : null;
  if (!usable(url) || !publicKey) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return null;
  } catch {
    return null;
  }
  return { url, publicKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null;
}
