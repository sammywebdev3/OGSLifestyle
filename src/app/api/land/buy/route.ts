import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { buyPlot } from '@/server/services/landService';
import { ServiceError } from '@/server/services/errors';
import { MAX_BODY_BYTES, parseBuyRequest } from '@/features/land/request';

export const dynamic = 'force-dynamic';

/**
 * POST /api/land/buy { plotKey, requestId } → { plotKey, price, cash, transactionId, replayed, land }.
 * Same-origin JSON only; any field other than plotKey and requestId is refused.
 * The price, buyer and balance are decided by the database, never by this body.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request too large.', code: 'invalid' }, { status: 413 });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request.', code: 'invalid' }, { status: 400 });
  }
  const parsed = parseBuyRequest(request.headers, text);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: 'invalid' }, { status: parsed.status });
  const db = await getServerSupabase();
  if (!db) return NextResponse.json({ error: 'Online accounts are not configured on this server.', code: 'server' }, { status: 503 });
  try {
    return NextResponse.json(await buyPlot(db, parsed.value), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'Unexpected server error.', code: 'server' }, { status: 500 });
  }
}
