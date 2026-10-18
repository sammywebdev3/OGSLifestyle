'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getPublicSupabaseEnv } from './env';

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client (anon key + the user's session). Returns null when
 * Supabase isn't configured. Everything it can read is limited by Row Level
 * Security; it has no write access to game tables at all.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | null {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  browserClient ??= createBrowserClient<Database>(env.url, env.anonKey);
  return browserClient;
}
