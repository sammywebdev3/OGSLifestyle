import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getPublicSupabaseEnv } from '@/lib/supabase/env';

/**
 * Keeps the Supabase auth session fresh on every request. Does nothing when
 * Supabase isn't configured (offline guest mode).
 */
export async function middleware(request: NextRequest) {
  const env = getPublicSupabaseEnv();
  if (!env) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Skip static files and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
