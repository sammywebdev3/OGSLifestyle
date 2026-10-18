import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getPublicSupabaseEnv } from './env';

/**
 * Server Supabase client acting AS THE SIGNED-IN USER (anon key + session
 * cookies). Use this for player requests so Row Level Security still applies.
 * Returns null when Supabase isn't configured.
 */
export async function getServerSupabase(): Promise<SupabaseClient<Database> | null> {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.publicKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
