import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BODY_BYTES, isRequestId, newRequestId, parseBuyRequest, validateBuyBody } from './request.ts';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const SAME = h({ 'content-type': 'application/json', origin: 'https://ogslifestyle.vercel.app', host: 'ogslifestyle.vercel.app' });
const ID = '0b6d1d8e-4a8f-4c3e-9f1a-2b3c4d5e6f70';

test('a well-formed same-origin request is accepted', () => {
  assert.deepEqual(parseBuyRequest(SAME, JSON.stringify({ plotKey: 'kuto-07', requestId: ID })), { ok: true, value: { plotKey: 'kuto-07', requestId: ID } });
});

test('cross-site requests and non-JSON bodies are refused before anything else', () => {
  const evil = parseBuyRequest(h({ 'content-type': 'application/json', origin: 'https://evil.example', host: 'ogslifestyle.vercel.app' }), JSON.stringify({ plotKey: 'kuto-07', requestId: ID }));
  assert.deepEqual(evil, { ok: false, status: 403, error: 'Cross-site request refused.' });
  const nullOrigin = parseBuyRequest(h({ 'content-type': 'application/json', origin: 'null', host: 'ogslifestyle.vercel.app' }), '{}');
  assert.equal(nullOrigin.ok, false); if (!nullOrigin.ok) assert.equal(nullOrigin.status, 403);
  for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', '']) {
    const r = parseBuyRequest(h({ 'content-type': ct, host: 'ogslifestyle.vercel.app' }), JSON.stringify({ plotKey: 'kuto-07', requestId: ID }));
    assert.equal(r.ok, false, ct); if (!r.ok) assert.equal(r.status, 415);
  }
});

test('malformed bodies are refused', () => {
  for (const body of ['', 'not json', '{', 'null', '[]', '"kuto-07"', '42', JSON.stringify([{ plotKey: 'kuto-07', requestId: ID }])]) {
    const r = parseBuyRequest(SAME, body);
    assert.equal(r.ok, false, body); if (!r.ok) assert.equal(r.status, 400, body);
  }
  const big = parseBuyRequest(SAME, JSON.stringify({ plotKey: 'kuto-07', requestId: ID, pad: 'x'.repeat(MAX_BODY_BYTES) }));
  assert.equal(big.ok, false); if (!big.ok) assert.equal(big.status, 413);
});

test('invalid plot keys and request ids are refused', () => {
  for (const plotKey of [undefined, null, '', 'KUTO-07', 'kuto-7', "kuto-07' or '1'='1", 'kuto-07\u0000', 7, ['kuto-07'], { key: 'kuto-07' }]) {
    const r = validateBuyBody({ plotKey, requestId: ID });
    assert.equal(r.ok, false, String(plotKey));
  }
  for (const requestId of [undefined, null, '', 'abc', '0B6D1D8E-4A8F-4C3E-9F1A-2B3C4D5E6F70', '00000000-0000-0000-0000-000000000000', `${ID} `, 1]) {
    const r = validateBuyBody({ plotKey: 'kuto-07', requestId });
    assert.equal(r.ok, false, String(requestId));
  }
});

test('the client cannot inject a price, cash, buyer, owner or anything else: extra fields are refused', () => {
  for (const extra of [{ price: 1 }, { cash: 999999999 }, { playerId: ID }, { player_id: ID }, { owner_player_id: ID }, { userId: ID }, { amount: 0 }, { tier: 'basic' }, { p_plot_key: 'kuto-01' }, { __proto__x: 1 }]) {
    const r = validateBuyBody({ plotKey: 'kuto-07', requestId: ID, ...extra });
    assert.deepEqual(r, { ok: false, status: 400, error: 'Only plotKey and requestId may be sent.' }, JSON.stringify(extra));
  }
  // A JSON "__proto__" key does not smuggle fields past the check either.
  const r = parseBuyRequest(SAME, `{"plotKey":"kuto-07","requestId":"${ID}","__proto__":{"price":1}}`);
  assert.equal(r.ok, false);
});

test('request ids are random v4 UUIDs', () => {
  const a = newRequestId(); const b = newRequestId();
  assert.ok(isRequestId(a) && isRequestId(b) && a !== b);
});
