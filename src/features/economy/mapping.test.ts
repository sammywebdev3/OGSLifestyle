import { test } from 'node:test';
import assert from 'node:assert/strict';
import { economyFailure, parseClaimRow, parseShopBuyRow, toJobsSnapshot, toShopSnapshot } from './mapping.ts';

const NOW = '2026-10-23T12:00:00.000Z';
const JOB = { job_key: 'buka-helper', title: 'Help at Iya Basira Buka', description: 'Wash plates.', location_id: 'kuto-street', pay: 1500, duration_seconds: 120 };
const ACTIVE = { shift_id: '6f0d6a3e-9f1a-4c3e-8f1a-2b3c4d5e6f70', job_key: 'buka-helper', pay: 1500, started_at: NOW, ends_at: '2026-10-23T12:02:00.000Z' };

test('the job board is mapped from get_my_jobs', () => {
  const s = toJobsSnapshot({ jobs: [JOB], active: ACTIVE, shifts_today: 3, daily_limit: 20, server_now: NOW }, 51500);
  assert.deepEqual(s, {
    jobs: [{ key: 'buka-helper', title: JOB.title, description: JOB.description, pay: 1500, durationSeconds: 120 }],
    active: { shiftId: ACTIVE.shift_id, jobKey: 'buka-helper', pay: 1500, startedAt: NOW, endsAt: ACTIVE.ends_at },
    shiftsToday: 3, dailyLimit: 20, serverNow: NOW, cash: 51500,
  });
  assert.equal(toJobsSnapshot({ jobs: [], active: null, shifts_today: 0, daily_limit: 20, server_now: NOW })?.active, null);
});

test('bad job rows are dropped; an unreadable answer or shift is refused, not shown as "no shift"', () => {
  const bad = [{ ...JOB, pay: 0 }, { ...JOB, pay: 1e9 }, { ...JOB, pay: '1500' }, { ...JOB, job_key: 'Bad Key' }, { ...JOB, duration_seconds: 1 }, { ...JOB, title: '' }, null];
  assert.equal(toJobsSnapshot({ jobs: [...bad, JOB], active: null, shifts_today: 0, daily_limit: 20, server_now: NOW })?.jobs.length, 1);
  assert.equal(toJobsSnapshot({ jobs: [JOB], active: { ...ACTIVE, ends_at: 'soon' }, shifts_today: 0, daily_limit: 20, server_now: NOW }), null);
  for (const raw of [null, [], 'x', { jobs: 'x', shifts_today: 0, daily_limit: 20, server_now: NOW }, { jobs: [], shifts_today: -1, daily_limit: 20, server_now: NOW }, { jobs: [], shifts_today: 0, daily_limit: 20 }]) {
    assert.equal(toJobsSnapshot(raw), null, JSON.stringify(raw));
  }
  for (const cash of [-1, 1.5, '100', null, undefined]) {
    assert.equal(toJobsSnapshot({ jobs: [], active: null, shifts_today: 0, daily_limit: 20, server_now: NOW }, cash)?.cash, null);
  }
});

test('shop items are mapped; unknown items and bad prices are not offered', () => {
  const s = toShopSnapshot('buka', [
    { item_key: 'zobo', name: 'Cold zobo', price: 400, max_per_purchase: 10 },
    { item_key: 'mystery-box', name: 'Mystery', price: 400, max_per_purchase: 10 },
    { item_key: 'puff-puff', name: 'Puff-puff', price: 0, max_per_purchase: 10 },
    { item_key: 'bread', name: 'Bread', price: 800, max_per_purchase: 50 },
  ], 1000);
  assert.deepEqual(s, { shop: 'buka', items: [{ key: 'zobo', name: 'Cold zobo', price: 400, maxPerPurchase: 10 }], cash: 1000 });
  assert.equal(toShopSnapshot('buka', null), null);
  assert.equal(toShopSnapshot('buka', { item_key: 'zobo' }), null);
});

test('claim and purchase answers are checked field by field', () => {
  const claim = { transaction_id: 't1', shift_id: 's1', job_key: 'buka-helper', pay: 1500, cash: 51500, replayed: false };
  assert.deepEqual(parseClaimRow(claim), claim);
  for (const bad of [{ ...claim, pay: 50 }, { ...claim, cash: -1 }, { ...claim, replayed: 'no' }, { ...claim, transaction_id: 5 }, null, []]) assert.equal(parseClaimRow(bad), null);
  const buy = { transaction_id: 't2', item_key: 'zobo', quantity: 2, total: 800, cash: 49200, owned: 2, replayed: true };
  assert.deepEqual(parseShopBuyRow(buy), buy);
  for (const bad of [{ ...buy, item_key: 'mystery' }, { ...buy, quantity: 0 }, { ...buy, owned: 1000 }, { ...buy, total: 5 }, { ...buy, cash: 1.5 }]) assert.equal(parseShopBuyRow(bad), null);
});

test('database errors map to statuses, codes and player messages', () => {
  assert.deepEqual(economyFailure('OG402', 'buy'), { status: 402, code: 'insufficient-funds', message: 'You do not have enough cash for that.' });
  assert.equal(economyFailure('OG409', 'buy').code, 'bag-full');
  assert.equal(economyFailure('OG409', 'start').code, 'busy');
  assert.equal(economyFailure('OG425', 'claim').code, 'not-finished');
  assert.deepEqual(economyFailure('OG429', 'start'), { status: 429, code: 'daily-limit', message: 'You have worked enough shifts for today. Rest and come back later.' });
  assert.equal(economyFailure('OG404', 'claim').message, 'You have no shift to claim.');
  assert.equal(economyFailure('OG404', 'abandon').message, 'You have no shift to stop.');
  assert.equal(economyFailure('OG422', 'claim').code, 'request-reused');
  assert.equal(economyFailure('28000', 'read-jobs').code, 'no-character');
  assert.equal(economyFailure('28000', 'start').code, 'signed-out');
  assert.equal(economyFailure('PGRST202', 'read-shop').status, 503);
  assert.equal(economyFailure('42883', 'buy').code, 'unavailable');
  for (const code of [undefined, '23505', 'XX000', '']) assert.equal(economyFailure(code, 'buy').status, 500);
  // No database detail ever reaches the player.
  assert.equal(economyFailure('23505', 'claim').message, 'Could not complete that. Please try again.');
});
