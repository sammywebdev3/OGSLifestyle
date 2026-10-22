import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getLand } from '@/server/services/landService';
import { ServiceError } from '@/server/services/errors';

export const dynamic = 'force-dynamic';

/** GET /api/land → { plots, mine }: every plot's public facts, and the caller's own plots. */
export async function GET() {
  const db = await getServerSupabase();
  if (!db) return NextResponse.json({ error: 'Online accounts are not configured on this server.', code: 'server' }, { status: 503 });
  try {
    return NextResponse.json(await getLand(db), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Unexpected server error.', code: 'server' }, { status: 500 });
  }
}
