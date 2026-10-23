import 'server-only';
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { ServiceError } from '@/server/services/errors';
import { MAX_BODY_BYTES, parseJsonRequest } from '@/features/economy/request';
import type { Parsed } from '@/features/land/request';

type Db = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

const NO_STORE = { 'cache-control': 'no-store' };

/** Runs `work` with the request's own Supabase client and turns its result or error into a JSON answer. */
export async function respond<T>(work: (db: Db) => Promise<T>): Promise<NextResponse> {
  const db = await getServerSupabase();
  if (!db) return NextResponse.json({ error: 'Online accounts are not configured on this server.', code: 'server' }, { status: 503 });
  try {
    return NextResponse.json(await work(db), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ServiceError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: NO_STORE });
    console.error(e);
    return NextResponse.json({ error: 'Unexpected server error.', code: 'server' }, { status: 500 });
  }
}

/** A state-changing POST: same-origin JSON within the size limit, checked by `validate`, then `work`. */
export async function respondToPost<T, R>(request: Request, validate: (body: unknown) => Parsed<T>, work: (db: Db, value: T) => Promise<R>): Promise<NextResponse> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request too large.', code: 'invalid' }, { status: 413 });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid request.', code: 'invalid' }, { status: 400 });
  }
  const parsed = parseJsonRequest(request.headers, text, validate);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: 'invalid' }, { status: parsed.status });
  return respond((db) => work(db, parsed.value));
}
