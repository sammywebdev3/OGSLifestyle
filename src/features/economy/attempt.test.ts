import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MoneyAttempt, secondsLeft } from './attempt.ts';

const ids = () => { let n = 0; return () => `id-${++n}`; };

test('a second click while a request is in flight is ignored', () => {
  const a = new MoneyAttempt<'x'>(ids());
  assert.equal(a.start('claim'), 'id-1');
  assert.equal(a.start('claim'), null);
  assert.equal(a.start('buy:zobo:1'), null);
});

test('after a network or server failure, retrying the same action reuses its request id', () => {
  for (const code of ['network', 'server'] as const) {
    const a = new MoneyAttempt<'server'>(ids());
    a.start('buy:zobo:2');
    a.failed(code, 'unknown');
    assert.equal(a.state.kind, 'unknown');
    a.reset(); // closing the panel keeps an uncertain attempt
    assert.equal(a.start('buy:zobo:2'), 'id-1');
  }
});

test('a different action, or a definite answer, gets a new request id', () => {
  const a = new MoneyAttempt<'insufficient-funds'>(ids());
  a.start('buy:zobo:2'); a.failed('network', 'x');
  assert.equal(a.start('buy:zobo:3'), 'id-2');
  a.failed('insufficient-funds', 'no cash');
  assert.deepEqual(a.state, { kind: 'failed', action: 'buy:zobo:3', code: 'insufficient-funds', message: 'no cash' });
  assert.equal(a.start('buy:zobo:3'), 'id-3');
  a.succeeded(false);
  assert.deepEqual(a.state, { kind: 'done', action: 'buy:zobo:3', replayed: false });
  a.reset();
  assert.equal(a.state.kind, 'idle');
});

test('answers that arrive when nothing is pending change nothing', () => {
  const a = new MoneyAttempt<'x'>(ids());
  a.succeeded(true); a.failed('network', 'x');
  assert.equal(a.state.kind, 'idle');
});

test('the shift countdown runs on the server clock, whatever the device clock says', () => {
  const server = '2026-10-23T12:00:00.000Z';
  const ends = '2026-10-23T12:02:00.000Z';
  // Device clock 1 hour wrong: only the time elapsed locally since the read counts.
  const readAt = Date.parse('2026-10-23T13:00:00.000Z');
  assert.equal(secondsLeft(ends, server, readAt, readAt), 120);
  assert.equal(secondsLeft(ends, server, readAt, readAt + 30_500), 90);
  assert.equal(secondsLeft(ends, server, readAt, readAt + 500_000), 0);
  assert.equal(secondsLeft('soon', server, readAt, readAt), 0);
});
