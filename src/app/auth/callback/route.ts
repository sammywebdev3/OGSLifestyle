import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { codeFromSupabaseError } from '@/features/auth/authErrors';

/**
 * Email-confirmation landing (PKCE): exchange `?code=` for a session cookie,
 * then continue. Failures go to /login with a fixed error code.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const toLogin = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, url.origin));

  // Supabase sends errors (e.g. an expired link) as query parameters.
  const supabaseError = codeFromSupabaseError(url.searchParams.get('error_code'), url.searchParams.get('error'));
  if (supabaseError) return toLogin(supabaseError);

  const code = url.searchParams.get('code');
  const nextPath = url.searchParams.get('next');
  // Only same-site relative paths (no "//host" or "/\host" tricks).
  const safeNext = nextPath && /^\/(?![/\\])/.test(nextPath) ? nextPath : '/create';

  const db = await getServerSupabase();
  if (!db || !code) return toLogin('callback');
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return toLogin(error.code === 'otp_expired' || error.code === 'flow_state_expired' ? 'link-expired' : 'callback');
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
