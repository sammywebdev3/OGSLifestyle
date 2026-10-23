import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BODY_BYTES, MAX_QUANTITY, isShopKey, parseJsonRequest, validateAbandonBody, validateClaimBody, validateShopBuyBody, validateStartJobBody } from './request.ts';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
const SAME = h({ 'content-type': 'application/json', origin: 'https://ogslifestyle.vercel.app', host: 'ogslifestyle.vercel.app' });
const ID = '0b6d1d8e-4a8f-4c3e-9f1a-2b3c4d5e6f70';
const status = (r: { ok: boolean; status?: number }) => (r.ok ? 200 : r.status);

test('well-formed same-origin requests are accepted with exactly their fields', () => {
  assert.deepEqual(parseJsonRequest(SAME, JSON.stringify({ jobKey: 'buka-helper' }), validateStartJobBody), { ok: true, value: { jobKey: 'buka-helper' } });
  assert.deepEqual(parseJsonRequest(SAME, JSON.stringify({ requestId: ID }), validateClaimBody), { ok: true, value: { requestId: ID } });
  assert.deepEqual(parseJsonRequest(SAME, '{}', validateAbandonBody), { ok: true, value: {} });
  assert.deepEqual(parseJsonRequest(SAME, JSON.stringify({ itemKey: 'zobo', quantity: 3, requestId: ID }), validateShopBuyBody),
    { ok: true, value: { itemKey: 'zobo', quantity: 3, requestId: ID } });
});

test('cross-site requests and non-JSON bodies are refused before the body is read', () => {
  const evil = h({ 'content-type': 'application/json', origin: 'https://evil.example', host: 'ogslifestyle.vercel.app' });
  const all = (headers: ReturnType<typeof h>) => [
    parseJsonRequest(headers, '{}', validateStartJobBody), parseJsonRequest(headers, '{}', validateClaimBody),
    parseJsonRequest(headers, '{}', validateAbandonBody), parseJsonRequest(headers, '{}', validateShopBuyBody),
  ].map(status);
  assert.deepEqual(all(evil), [403, 403, 403, 403]);
  assert.deepEqual(all(h({ 'content-type': 'text/plain', host: 'ogslifestyle.vercel.app' })), [415, 415, 415, 415]);
  assert.deepEqual(all(h({ 'content-type': 'application/x-www-form-urlencoded', host: 'ogslifestyle.vercel.app' })), [415, 415, 415, 415]);
});

test('malformed and oversized bodies are refused', () => {
  for (const body of ['', 'not json', '{', 'null', '[]', '"buka-helper"', '42']) {
    assert.equal(status(parseJsonRequest(SAME, body, validateStartJobBody)), 400, body);
    assert.equal(status(parseJsonRequest(SAME, body, validateShopBuyBody)), 400, body);
  }
  assert.equal(status(parseJsonRequest(SAME, JSON.stringify({ jobKey: 'buka-helper', pad: 'x'.repeat(MAX_BODY_BYTES) }), validateStartJobBody)), 413);
});

test('client-chosen pay, prices, balances, players or shifts are refused, not ignored', () => {
  for (const extra of [{ pay: 100000 }, { cash: 1e9 }, { playerId: ID }, { userId: ID }, { durationSeconds: 1 }, { shiftId: ID }]) {
    assert.equal(status(validateStartJobBody({ jobKey: 'buka-helper', ...extra })), 400, JSON.stringify(extra));
    assert.equal(status(validateClaimBody({ requestId: ID, ...extra })), 400, JSON.stringify(extra));
    assert.equal(status(validateAbandonBody(extra)), 400, JSON.stringify(extra));
  }
  for (const extra of [{ price: 1 }, { total: 1 }, { cash: 1e9 }, { playerId: ID }, { owned: 999 }]) {
    assert.equal(status(validateShopBuyBody({ itemKey: 'zobo', quantity: 1, requestId: ID, ...extra })), 400, JSON.stringify(extra));
  }
});

test('job and item keys must have the database key shape', () => {
  for (const key of ['', 'A', 'x', 'Buka', '1job', 'buka helper', 'buka_helper', 'a'.repeat(32), "x'; drop table jobs; --", null, 7, ['buka-helper']]) {
    assert.equal(status(validateStartJobBody({ jobKey: key })), 400, String(key));
    assert.equal(status(validateShopBuyBody({ itemKey: key, quantity: 1, requestId: ID })), 400, String(key));
  }
});

test('quantity must be a whole number from 1 to the database limit', () => {
  for (const q of [0, -1, MAX_QUANTITY + 1, 1.5, Number.NaN, Infinity, '2', null, undefined, 1e20]) {
    assert.equal(status(validateShopBuyBody({ itemKey: 'zobo', quantity: q, requestId: ID })), 400, String(q));
  }
  assert.equal(status(validateShopBuyBody({ itemKey: 'zobo', quantity: MAX_QUANTITY, requestId: ID })), 200);
});

test('a request id is required where retries must be safe', () => {
  for (const id of [undefined, '', 'abc', ID.toUpperCase(), '00000000-0000-0000-0000-000000000000', 42]) {
    assert.equal(status(validateClaimBody({ requestId: id })), 400, String(id));
    assert.equal(status(validateShopBuyBody({ itemKey: 'zobo', quantity: 1, requestId: id })), 400, String(id));
  }
});

test('only the two Kuto shops exist', () => {
  assert.equal(isShopKey('buka'), true);
  assert.equal(isShopKey('mama-t-stores'), true);
  for (const s of ['', 'Buka', 'land', null, undefined, 'buka ']) assert.equal(isShopKey(s), false, String(s));
});
