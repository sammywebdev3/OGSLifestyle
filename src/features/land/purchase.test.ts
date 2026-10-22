import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PurchaseAttempt } from './purchase.ts';

const ids = () => { let n = 0; return () => `id-${++n}`; };

test('nothing is "bought" until the server confirms', () => {
  const a = new PurchaseAttempt(ids());
  assert.deepEqual(a.start('kuto-07'), { plotKey: 'kuto-07', requestId: 'id-1' });
  assert.equal(a.state.kind, 'pending');
  a.succeeded(false);
  assert.deepEqual(a.state, { kind: 'done', plotKey: 'kuto-07', replayed: false });
});

test('a second click while a request is in flight sends nothing', () => {
  const a = new PurchaseAttempt(ids());
  a.start('kuto-07');
  assert.equal(a.start('kuto-07'), null);
  assert.equal(a.start('kuto-08'), null);
});

test('after a network failure the retry reuses the same request id (cannot be charged twice)', () => {
  const a = new PurchaseAttempt(ids());
  a.start('kuto-07');
  a.failed('network', 'offline');
  assert.equal(a.state.kind, 'unknown');
  assert.equal(a.start('kuto-07')?.requestId, 'id-1');
  a.failed('server', 'boom');
  assert.equal(a.start('kuto-07')?.requestId, 'id-1');
  a.succeeded(true);
  assert.deepEqual(a.state, { kind: 'done', plotKey: 'kuto-07', replayed: true });
  // Closing the dialog while the outcome is unknown keeps the id for a later retry.
  const b = new PurchaseAttempt(ids());
  b.start('kuto-02'); b.failed('network', 'offline'); b.reset();
  assert.equal(b.start('kuto-02')?.requestId, 'id-1');
});

test('a definite answer ends the attempt; trying again is a new request', () => {
  const a = new PurchaseAttempt(ids());
  a.start('kuto-07');
  a.failed('insufficient-funds', 'not enough');
  assert.deepEqual(a.state, { kind: 'failed', plotKey: 'kuto-07', code: 'insufficient-funds', message: 'not enough' });
  assert.equal(a.start('kuto-07')?.requestId, 'id-2');
  a.failed('sold', 'sold');
  a.reset();
  assert.equal(a.state.kind, 'idle');
  // A different plot never reuses an uncertain id from another plot.
  a.start('kuto-03'); a.failed('network', 'x');
  assert.equal(a.start('kuto-04')?.requestId, 'id-4');
});

test('late answers for a finished attempt are ignored', () => {
  const a = new PurchaseAttempt(ids());
  a.start('kuto-07'); a.succeeded(false);
  a.failed('network', 'late');
  assert.equal(a.state.kind, 'done');
});
