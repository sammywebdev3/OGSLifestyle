import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSameOriginJson } from './sameOrigin.ts';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });

test('same-origin JSON requests are allowed', () => {
  assert.deepEqual(checkSameOriginJson(h({ 'content-type': 'application/json', origin: 'https://osl.vercel.app', host: 'osl.vercel.app' })), { ok: true });
  assert.deepEqual(checkSameOriginJson(h({ 'content-type': 'application/json; charset=utf-8', origin: 'http://localhost:3000', host: 'localhost:3000' })), { ok: true });
  // behind Vercel's proxy
  assert.deepEqual(checkSameOriginJson(h({ 'content-type': 'application/json', origin: 'https://game.example.ng', host: 'internal', 'x-forwarded-host': 'game.example.ng' })), { ok: true });
  // no Origin header (not a cross-site browser request)
  assert.deepEqual(checkSameOriginJson(h({ 'content-type': 'application/json', host: 'osl.vercel.app' })), { ok: true });
});

test('cross-site origins are refused', () => {
  const r = checkSameOriginJson(h({ 'content-type': 'application/json', origin: 'https://evil.example', host: 'osl.vercel.app' }));
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.status, 403);
  const s = checkSameOriginJson(h({ 'content-type': 'application/json', origin: 'https://osl.vercel.app.evil.example', host: 'osl.vercel.app' }));
  assert.equal(s.ok, false);
  const t = checkSameOriginJson(h({ 'content-type': 'application/json', origin: 'null', host: 'osl.vercel.app' }));
  assert.equal(t.ok, false);
});

test('non-JSON bodies (what an HTML form can send) are refused', () => {
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    const r = checkSameOriginJson(h({ 'content-type': ct, host: 'osl.vercel.app' }));
    assert.equal(r.ok, false, ct); if (!r.ok) assert.equal(r.status, 415);
  }
});
