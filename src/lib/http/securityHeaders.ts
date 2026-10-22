/**
 * HTTP security headers for every response (wired up in next.config.ts).
 * No imports, so it can be unit-tested with Node directly.
 *
 * The Content-Security-Policy ships in REPORT-ONLY mode first: browsers log
 * violations to the console but block nothing. It is enforced only after the
 * game (Phaser, Supabase Auth/REST/Realtime) has been checked against it.
 */

export interface Header { key: string; value: string }

/** The Supabase origins the browser talks to (REST/Auth over https, Realtime over wss). */
export function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const u = new URL(supabaseUrl);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return [];
    const ws = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return [u.origin, `${ws}//${u.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy(supabaseUrl: string | undefined): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js inlines small bootstrap scripts; Tailwind/React set inline styles.
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...supabaseOrigins(supabaseUrl)],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
}

export function securityHeaders(supabaseUrl: string | undefined): Header[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy(supabaseUrl) },
  ];
}
