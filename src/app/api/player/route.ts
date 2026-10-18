import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createMyCharacter, getMyPlayer } from '@/server/services/playerService';
import { ServiceError } from '@/server/services/errors';

export const dynamic = 'force-dynamic';

function fail(e: unknown) {
  if (e instanceof ServiceError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
}

const notConfigured = () => NextResponse.json({ error: 'Online accounts are not configured on this server.' }, { status: 503 });

/** GET /api/player → { player, inventory } for the signed-in user, or { player: null }. */
export async function GET() {
  const db = await getServerSupabase();
  if (!db) return notConfigured();
  try {
    const snap = await getMyPlayer(db);
    return NextResponse.json(snap ?? { player: null, inventory: null });
  } catch (e) {
    return fail(e);
  }
}

/** POST /api/player { characterName, avatar } → creates the character. Any "cash" field is ignored. */
export async function POST(request: Request) {
  const db = await getServerSupabase();
  if (!db) return notConfigured();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await createMyCharacter(db, body), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
