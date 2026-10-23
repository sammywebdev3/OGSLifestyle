// API integration tests for the Phase 3.4A routes (GET /api/jobs, POST /api/jobs/start|claim|abandon,
// GET /api/shop, POST /api/shop/buy), over HTTP, against the real production build of the app and a
// DISPOSABLE local Supabase-like stack. Run with `npm run test:api` (scripts/test-api.sh), never
// against a real project. The players here are made by this file; no other test's data is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServerClient } from '@supabase/ssr';

const { APP_URL, SUPABASE_URL, ANON_KEY } = process.env;
assert.ok(APP_URL && SUPABASE_URL && ANON_KEY, 'run through scripts/test-api.sh');
assert.match(SUPABASE_URL, /^http:\/\/127\.0\.0\.1:/, 'tests only ever talk to a local stack');

const newId = () => crypto.randomUUID();
/** One SQL value from the disposable database (PG* env vars come from test-api.sh). */
const sql = (q) => execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const cashOf = (userId) => Number(sql(`select cash from public.players where user_id = '${userId}'`));
const payoutsOf = (userId) => Number(sql(`select count(*) from public.economy_transactions t join public.players p on p.id = t.player_id where p.user_id = '${userId}' and t.kind = 'job_payout'`));
const ownedOf = (userId, item) => Number(sql(`select coalesce(sum(x.quantity), 0) from public.inventory_items x join public.inventories i on i.id = x.inventory_id join public.players p on p.id = i.player_id where p.user_id = '${userId}' and x.item_key = '${item}'`));
/** Test-only: end the user's shift now (as postgres, on the disposable database), instead of waiting minutes. */
const finishShift = (userId) => sql(`begin; alter table public.job_shifts disable trigger job_shifts_guard; update public.job_shifts s set started_at = now() - interval '1 hour', ends_at = now() - interval '1 second' from public.players p where p.id = s.player_id and p.user_id = '${userId}' and s.status = 'working'; alter table public.job_shifts enable trigger job_shifts_guard; commit;`);

/** Sign up (auto-confirmed locally) and sign in, keeping the session cookies the way the app's server client sets them. */
async function account(email) {
  const jar = new Map();
  const auth = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value, options } of list) { if (!value || options?.maxAge === 0) jar.delete(name); else jar.set(name, value); } },
    },
  });
  const { data, error } = await auth.auth.signUp({ email, password: 'local-test-password-1' });
  assert.equal(error, null, `sign-up ${email}: ${error?.message}`);
  if (!data.session) {
    const r = await auth.auth.signInWithPassword({ email, password: 'local-test-password-1' });
    assert.equal(r.error, null, `sign-in ${email}: ${r.error?.message}`);
  }
  return { userId: data.user.id, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; ') };
}

/** Call the app. JSON POSTs get a same-origin Origin header unless told otherwise. */
async function api(path, { method = 'GET', who, body, headers = {}, raw } = {}) {
  const h = { ...(who ? { cookie: who.cookie } : {}), ...headers };
  if (method === 'POST' && !('content-type' in h)) h['content-type'] = 'application/json';
  if (method === 'POST' && !('origin' in h)) h.origin = APP_URL;
  const init = { method, headers: h, redirect: 'manual' };
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${APP_URL}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const start = (who, jobKey, extra = {}) => api('/api/jobs/start', { method: 'POST', who, body: { jobKey, ...extra } });
const claim = (who, requestId = newId(), extra = {}) => api('/api/jobs/claim', { method: 'POST', who, body: { requestId, ...extra } });
const abandon = (who) => api('/api/jobs/abandon', { method: 'POST', who, body: {} });
const buy = (who, itemKey, quantity, requestId = newId(), extra = {}) => api('/api/shop/buy', { method: 'POST', who, body: { itemKey, quantity, requestId, ...extra } });

const W = {}; const S = {}; const N = {};

test('jobs and shops: unauthenticated requests are refused and change nothing', async () => {
  const before = sql('select count(*) from public.job_shifts') + '/' + sql('select count(*) from public.economy_transactions');
  for (const r of [await api('/api/jobs'), await api('/api/shop?shop=buka'), await start(null, 'buka-helper'), await claim(null), await abandon(null), await buy(null, 'zobo', 1)]) {
    assert.equal(r.status, 401, r.text); assert.equal(r.json.code, 'signed-out');
  }
  assert.equal(sql('select count(*) from public.job_shifts') + '/' + sql('select count(*) from public.economy_transactions'), before);
});

test('jobs and shops set-up: a worker and a shopper with characters, and an account without one', async () => {
  Object.assign(W, await account('worker@jobs.test'));
  Object.assign(S, await account('shopper@jobs.test'));
  Object.assign(N, await account('nochar@jobs.test'));
  for (const [p, name] of [[W, 'Wale Worker'], [S, 'Sade Shopper']]) {
    const r = await api('/api/player', { method: 'POST', who: p, body: { characterName: name, avatar: { body: 'masc', skin: 'deep', headwear: 'cap', outfit: 'palm' } } });
    assert.equal(r.status, 201, r.text);
  }
  const jobs = await api('/api/jobs', { who: N });
  assert.equal(jobs.status, 403); assert.equal(jobs.json.code, 'no-character');
  const shop = await api('/api/shop?shop=buka', { who: N });
  assert.equal(shop.status, 403); assert.equal(shop.json.code, 'no-character');
  const s = await start(N, 'buka-helper');
  assert.equal(s.status, 403); assert.equal(s.json.code, 'no-character');
});

test('the job board comes from the database', async () => {
  const r = await api('/api/jobs', { who: W });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.deepEqual(r.json.jobs.map((j) => [j.key, j.pay, j.durationSeconds]), [['buka-helper', 1500, 120], ['pos-attendant', 4000, 300], ['okada-rider', 9000, 600]]);
  assert.equal(r.json.active, null); assert.equal(r.json.shiftsToday, 0); assert.equal(r.json.dailyLimit, 20);
  assert.equal(r.json.cash, 50000);
  assert.ok(!Number.isNaN(Date.parse(r.json.serverNow)));
});

test('job requests are refused before the database when malformed, cross-site or carrying extra fields', async () => {
  for (const extra of [{ pay: 100000 }, { durationSeconds: 1 }, { playerId: S.userId }, { cash: 1e9 }]) {
    const r = await start(W, 'buka-helper', extra);
    assert.equal(r.status, 400, JSON.stringify(extra)); assert.equal(r.json.code, 'invalid');
  }
  assert.equal((await start(W, 'Buka Helper')).status, 400);
  assert.equal((await api('/api/jobs/start', { method: 'POST', who: W, raw: '{"jobKey":' })).status, 400);
  assert.equal((await api('/api/jobs/start', { method: 'POST', who: W, body: { jobKey: 'buka-helper' }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await api('/api/jobs/start', { method: 'POST', who: W, body: { jobKey: 'buka-helper' }, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await api('/api/jobs/abandon', { method: 'POST', who: W, body: { shiftId: newId() } })).status, 400);
  assert.equal((await api('/api/jobs/start', { method: 'POST', who: W, raw: JSON.stringify({ jobKey: 'buka-helper', pad: 'x'.repeat(2000) }) })).status, 413);
  const unknown = await start(W, 'free-money');
  assert.equal(unknown.status, 404); assert.equal(unknown.json.code, 'not-found');
  assert.equal(sql(`select count(*) from public.job_shifts s join public.players p on p.id = s.player_id where p.user_id = '${W.userId}'`), '0');
});

test('a shift: one at a time, no pay before it ends, paid exactly once at the database rate', async () => {
  const s = await start(W, 'buka-helper');
  assert.equal(s.status, 200, s.text);
  assert.equal(s.json.active.jobKey, 'buka-helper'); assert.equal(s.json.active.pay, 1500); assert.equal(s.json.shiftsToday, 1);
  const again = await start(W, 'okada-rider');
  assert.equal(again.status, 409); assert.equal(again.json.code, 'busy');
  const early = await claim(W);
  assert.equal(early.status, 409); assert.equal(early.json.code, 'not-finished');
  assert.equal(cashOf(W.userId), 50000);

  finishShift(W.userId);
  const id = newId();
  const paid = await claim(W, id);
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.json.pay, 1500); assert.equal(paid.json.cash, 51500); assert.equal(paid.json.replayed, false);
  assert.equal(paid.json.jobs.active, null);
  const retry = await claim(W, id);
  assert.equal(retry.status, 200); assert.equal(retry.json.replayed, true); assert.equal(retry.json.cash, 51500);
  const other = await claim(W);
  assert.equal(other.status, 404); assert.equal(other.json.code, 'not-found');
  assert.equal(cashOf(W.userId), 51500); assert.equal(payoutsOf(W.userId), 1);
  // A claim may not name a shift, a player or an amount.
  for (const extra of [{ shiftId: newId() }, { pay: 9000 }, { playerId: S.userId }]) assert.equal((await claim(W, newId(), extra)).status, 400);
});

test('eight simultaneous claims of one finished shift (different request ids) pay once', async () => {
  assert.equal((await start(W, 'pos-attendant')).status, 200);
  finishShift(W.userId);
  const results = await Promise.all(Array.from({ length: 8 }, () => claim(W)));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 404, 404, 404, 404, 404, 404, 404], results.map((r) => r.text).join('\n'));
  assert.equal(cashOf(W.userId), 55500); assert.equal(payoutsOf(W.userId), 2);
});

test('stopping a shift pays nothing; stopping with no shift is refused', async () => {
  assert.equal((await start(W, 'okada-rider')).status, 200);
  const stop = await abandon(W);
  assert.equal(stop.status, 200, stop.text); assert.equal(stop.json.active, null);
  const none = await abandon(W);
  assert.equal(none.status, 404); assert.equal(none.json.code, 'not-found');
  assert.equal((await claim(W)).status, 404);
  assert.equal(cashOf(W.userId), 55500);
});

test('shops list their items with database prices', async () => {
  const buka = await api('/api/shop?shop=buka', { who: S });
  assert.equal(buka.status, 200, buka.text);
  assert.deepEqual(buka.json.items.map((i) => [i.key, i.price, i.maxPerPurchase]), [['puff-puff', 300, 10], ['zobo', 400, 10], ['amala-plate', 1500, 5]]);
  const store = await api('/api/shop?shop=mama-t-stores', { who: S });
  assert.deepEqual(store.json.items.map((i) => [i.key, i.price]), [['water-sachet', 50], ['bread', 800], ['adire-scarf', 6500]]);
  for (const q of ['', '?shop=', '?shop=land', '?shop=BUKA']) assert.equal((await api(`/api/shop${q}`, { who: S })).status, 400, q);
});

test('buying: charged once at the database price, item added, retries answered, reuse refused', async () => {
  for (const extra of [{ price: 1 }, { total: 1 }, { cash: 1e9 }, { playerId: W.userId }]) {
    const r = await buy(S, 'zobo', 2, newId(), extra);
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  for (const q of [0, 21, 1.5, '2', -1]) assert.equal((await buy(S, 'zobo', q)).status, 400, String(q));
  const id = newId();
  const r = await buy(S, 'zobo', 2, id);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual({ ...r.json, transactionId: undefined }, { itemKey: 'zobo', quantity: 2, total: 800, cash: 49200, owned: 2, replayed: false, transactionId: undefined });
  const retry = await buy(S, 'zobo', 2, id);
  assert.equal(retry.json.replayed, true); assert.equal(retry.json.cash, 49200);
  const reused = await buy(S, 'puff-puff', 1, id);
  assert.equal(reused.status, 409); assert.equal(reused.json.code, 'request-reused');
  const tooMany = await buy(S, 'adire-scarf', 3);
  assert.equal(tooMany.status, 400); assert.equal(tooMany.json.code, 'invalid');
  const missing = await buy(S, 'gold-bar', 1);
  assert.equal(missing.status, 404);
  assert.equal(cashOf(S.userId), 49200); assert.equal(ownedOf(S.userId, 'zobo'), 2);
  // The player's own inventory, as the app serves it, shows the server's count.
  const me = await api('/api/player', { who: S });
  assert.deepEqual(me.json.inventory.items.find((i) => i.key === 'zobo'), { key: 'zobo', quantity: 2 });
});

test('insufficient funds and parallel overspending: never below ₦0', async () => {
  // ₦49,200: three ₦13,000 purchases fit (₦39,000), the rest must be refused, even all at once.
  const results = await Promise.all(Array.from({ length: 6 }, () => buy(S, 'adire-scarf', 2)));
  const ok = results.filter((r) => r.status === 200).length;
  assert.equal(ok, 3, results.map((r) => r.text).join('\n'));
  for (const r of results.filter((x) => x.status !== 200)) { assert.equal(r.status, 402); assert.equal(r.json.code, 'insufficient-funds'); }
  assert.equal(cashOf(S.userId), 10200); assert.equal(ownedOf(S.userId, 'adire-scarf'), 6);
});

test('after jobs and shopping: every transaction balances and the ledger matches each balance', () => {
  assert.equal(sql('select sum(amount) from public.ledger_entries'), '0');
  assert.equal(sql('select count(*) from (select transaction_id from public.ledger_entries group by transaction_id having sum(amount) <> 0 or count(*) <> 2) t'), '0');
  for (const p of [W, S]) {
    assert.equal(Number(sql(`select e.balance_after from public.ledger_entries e join public.players p on p.id = e.player_id where p.user_id = '${p.userId}' order by e.id desc limit 1`)), cashOf(p.userId));
  }
  assert.equal(Number(sql(`select -sum(amount) from public.ledger_entries where account = 'game:wages'`)) >= 5500, true);
});
