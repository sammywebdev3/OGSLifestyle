import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getPublicSupabaseEnv } from './env';

/**
 * PRIVILEGED client using the service-role key. It bypasses Row Level Security,
 * so it must only ever run on the server, for trusted jobs that have already
 * checked authorisation themselves (e.g. future payroll or market settlement).
 *
 * `import 'server-only'` makes the build fail if a client component imports this.
 * Phase 1 does not use it: player actions go through `getServerSupabase()` and
 * SECURITY DEFINER database functions instead.
 */
export function getAdminSupabase(): SupabaseClient<Database> | null {
  const env = getPublicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey || serviceKey === 'your-service-role-key') return null;
  return createClient<Database>(env.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
