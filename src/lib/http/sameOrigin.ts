/**
 * CSRF defence for cookie-authenticated, state-changing API routes.
 *
 * 1. Browsers always send `Origin` on cross-site POSTs, so when it is present it
 *    must name this site's host (behind Vercel's proxy, `x-forwarded-host`).
 *    A missing Origin is allowed: that is a same-origin navigation or a
 *    non-browser client, neither of which carries a victim's cookies cross-site.
 * 2. The body must be declared as JSON. Plain HTML forms can only send
 *    urlencoded, multipart or text/plain, so a cross-site form post is refused
 *    even in browsers that omit Origin.
 * Supabase's auth cookies are also SameSite=Lax. This is defence in depth.
 */

export type OriginCheck = { ok: true } | { ok: false; status: 403 | 415; reason: string };

export function checkSameOriginJson(headers: { get(name: string): string | null }): OriginCheck {
  const contentType = (headers.get('content-type') ?? '').toLowerCase();
  if (!/^application\/json\b/.test(contentType)) return { ok: false, status: 415, reason: 'Expected a JSON request.' };

  const origin = headers.get('origin');
  if (origin === null) return { ok: true };
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0]!.trim().toLowerCase();
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return { ok: false, status: 403, reason: 'Cross-site request refused.' };
  }
  return host && originHost === host ? { ok: true } : { ok: false, status: 403, reason: 'Cross-site request refused.' };
}
