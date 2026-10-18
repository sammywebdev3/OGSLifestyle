/**
 * Supabase configuration detection. Only the PUBLIC url and anon key are read
 * here; the service-role key is read exclusively in ./admin.ts (server-only).
 *
 * If the values are missing or still the placeholders from .env.example, the
 * app runs in offline guest mode instead of failing.
 */

const PLACEHOLDER = /your-project-ref|your-anon-public-key|^$/;

export interface PublicSupabaseEnv {
  url: string;
  anonKey: string;
}

export function getPublicSupabaseEnv(): PublicSupabaseEnv | null {
  // Must be referenced literally so Next.js can inline them into the client bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null;
}
