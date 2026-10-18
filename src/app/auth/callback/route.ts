import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

/** Email-confirmation / magic-link landing: exchange the code for a session, then continue. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextPath = url.searchParams.get('next');
  // Only allow same-site relative redirects.
  const safeNext = nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/create';
  const db = await getServerSupabase();
  if (db && code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=callback', url.origin));
}
