import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

/** Liveness check. Reports whether online accounts are configured — never any secret values. */
export function GET() {
  return NextResponse.json({ ok: true, onlineAccounts: isSupabaseConfigured() });
}
