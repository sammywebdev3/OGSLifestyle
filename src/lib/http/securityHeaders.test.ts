import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentSecurityPolicy, securityHeaders, supabaseOrigins } from './securityHeaders.ts';

const get = (key: string, url?: string) => securityHeaders(url).find((h) => h.key === key)?.value;

test('the standard protective headers are always sent', () => {
  assert.equal(get('X-Content-Type-Options'), 'nosniff');
  assert.equal(get('X-Frame-Options'), 'DENY');
  assert.equal(get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.match(get('Permissions-Policy')!, /camera=\(\).*microphone=\(\).*geolocation=\(\)/);
  assert.match(get('Strict-Transport-Security')!, /^max-age=\d{8,}; includeSubDomains$/);
});

test('the CSP is report-only for now (it cannot break the game), and never enforced by accident', () => {
  const keys = securityHeaders(undefined).map((h) => h.key);
  assert.ok(keys.includes('Content-Security-Policy-Report-Only'));
  assert.ok(!keys.includes('Content-Security-Policy'));
});

test('the CSP allows only this site plus the configured Supabase project (https + wss)', () => {
  const csp = contentSecurityPolicy('https://abcdefgh.supabase.co');
  assert.match(csp, /connect-src 'self' https:\/\/abcdefgh\.supabase\.co wss:\/\/abcdefgh\.supabase\.co(;|$)/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /\*/, 'no wildcards');
  assert.doesNotMatch(csp, /unsafe-eval/);
});

test('bad or missing Supabase URLs add nothing to connect-src', () => {
  for (const bad of [undefined, '', 'not a url', 'http://evil.example', 'javascript:alert(1)']) {
    assert.deepEqual(supabaseOrigins(bad), [], String(bad));
    assert.match(contentSecurityPolicy(bad), /connect-src 'self';/);
  }
  assert.deepEqual(supabaseOrigins('http://127.0.0.1:54321'), ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321']);
});
