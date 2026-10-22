// API integration tests for GET /api/land and POST /api/land/buy (and account deletion), over HTTP,
// against the real production build of the app and a DISPOSABLE local Supabase-like stack.
// Run with `npm run test:api` (scripts/test-api.sh), never against a real project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const { APP_URL, SUPABASE_URL, ANON_KEY, SERVICE_KEY, REST_CONTAINER, REST_HEALTH } = process.env;
assert.ok(APP_URL && SUPABASE_URL && ANON_KEY && SERVICE_KEY && REST_CONTAINER, 'run through scripts/test-api.sh');
assert.match(SUPABASE_URL, /^http:\/\/127\.0\.0\.1:/, 'tests only ever talk to a local stack');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newId = () => crypto.randomUUID();

/** One SQL value from the disposable database (PG* env vars come from test-api.sh). */
const sql = (q) => execFileSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
const cashOf = (userId) => Number(sql(`select cash from public.players where user_id = '${userId}'`));
const txCount = (plotKey) => Number(sql(`select count(*) from public.economy_transactions t join public.land_plots l on l.id = t.plot_id where l.plot_key = '${plotKey}'`));

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
  assert.ok(jar.size > 0, 'session cookies were set');
  return { userId: data.user.id, cookie: [...jar].map(([n, v]) => `${n}=${v}`).join('; ') };
}

/** Call the app. JSON POSTs get a same-origin Origin header unless told otherwise. */
async function api(path, { method = 'GET', who, body, headers = {}, raw } = {}) {
  const h = { ...(who ? { cookie: who.cookie } : {}), ...headers };
  if (method === 'POST' && !('content-type' in h)) h['content-type'] = 'application/json';
  if (method === 'POST' && !('origin' in h)) h.origin = APP_URL;
  const init = { method, headers: h, redirect: 'manual' };
  if (raw !== undefined) { init.body = raw; if (raw instanceof ReadableStream) init.duplex = 'half'; }
  else if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${APP_URL}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
const buy = (who, plotKey, requestId = newId(), extra = {}) => api('/api/land/buy', { method: 'POST', who, body: { plotKey, requestId, ...extra } });
const createCharacter = (who, characterName) => api('/api/player', { method: 'POST', who, body: { characterName, avatar: { body: 'femme', skin: 'warm', headwear: 'gele', outfit: 'adire' } } });

const A = {}; const B = {}; const C = {}; const D = {};
const plot07Id = newId();

test('unauthenticated requests are refused and change nothing', async () => {
  const get = await api('/api/land');
  assert.equal(get.status, 401); assert.equal(get.json.code, 'signed-out');
  const post = await buy(null, 'kuto-07');
  assert.equal(post.status, 401); assert.equal(post.json.code, 'signed-out');
  const forged = await buy({ cookie: 'sb-127-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0' }, 'kuto-07');
  assert.equal(forged.status, 401, 'a forged session cookie is not a session');
  assert.equal(sql('select count(*) from public.economy_transactions'), '0');
});

test('set-up: three players with characters (₦50,000 each) and one account without a character', async () => {
  Object.assign(A, await account('ada@api.test'), { name: 'Ada Kuto' });
  Object.assign(B, await account('bayo@api.test'), { name: 'Bayo Ade' });
  Object.assign(C, await account('chi@api.test'), { name: 'Chi Obi' });
  Object.assign(D, await account('dayo@api.test'));
  for (const p of [A, B, C]) {
    const r = await createCharacter(p, p.name);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.json.player.cash, 50000);
  }
});

test('an account without a character cannot see or buy land', async () => {
  const get = await api('/api/land', { who: D });
  assert.equal(get.status, 403); assert.equal(get.json.code, 'no-character');
  const post = await buy(D, 'kuto-07');
  assert.equal(post.status, 403); assert.equal(post.json.code, 'no-character');
});

test('invalid JSON and malformed input are refused before the database', async () => {
  const cases = [
    [{ raw: '{"plotKey":' }, 400],
    [{ raw: 'null' }, 400],
    [{ raw: '[]' }, 400],
    [{ body: { plotKey: 'KUTO-07', requestId: newId() } }, 400],
    [{ body: { plotKey: "kuto-07' or '1'='1", requestId: newId() } }, 400],
    [{ body: { plotKey: 'kuto-07' } }, 400],
    [{ body: { plotKey: 'kuto-07', requestId: 'not-a-uuid' } }, 400],
    [{ body: { plotKey: 'kuto-07', requestId: newId(), price: 1 } }, 400],
    [{ body: { plotKey: 'kuto-07', requestId: newId(), cash: 999999999 } }, 400],
    [{ body: { plotKey: 'kuto-07', requestId: newId(), playerId: B.userId } }, 400],
  ];
  for (const [opts, status] of cases) {
    const r = await api('/api/land/buy', { method: 'POST', who: A, ...opts });
    assert.equal(r.status, status, JSON.stringify(opts)); assert.equal(r.json.code, 'invalid');
  }
  const unknown = await buy(A, 'kuto-99');
  assert.equal(unknown.status, 404); assert.equal(unknown.json.code, 'not-found');
  assert.equal(cashOf(A.userId), 50000);
  assert.equal(sql('select count(*) from public.economy_transactions'), '0');
});

test('oversized bodies are refused (with and without a Content-Length header)', async () => {
  const big = JSON.stringify({ plotKey: 'kuto-07', requestId: newId(), pad: 'x'.repeat(4000) });
  const declared = await api('/api/land/buy', { method: 'POST', who: A, raw: big });
  assert.equal(declared.status, 413);
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const chunked = await api('/api/land/buy', { method: 'POST', who: A, raw: stream });
  assert.equal(chunked.status, 413);
  assert.equal(cashOf(A.userId), 50000);
});

test('cross-origin and non-JSON requests are refused even with a valid session', async () => {
  const body = { plotKey: 'kuto-07', requestId: newId() };
  const evil = await api('/api/land/buy', { method: 'POST', who: A, body, headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const nullOrigin = await api('/api/land/buy', { method: 'POST', who: A, body, headers: { origin: 'null' } });
  assert.equal(nullOrigin.status, 403);
  const form = await api('/api/land/buy', { method: 'POST', who: A, body, headers: { 'content-type': 'text/plain' } });
  assert.equal(form.status, 415);
  assert.equal(cashOf(A.userId), 50000);
  assert.equal(sql('select count(*) from public.economy_transactions'), '0');
});

test('successful purchase: charged once at the database price, owner recorded, balanced ledger', async () => {
  const r = await buy(A, 'kuto-07', plot07Id);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.plotKey, 'kuto-07'); assert.equal(r.json.price, 25000); assert.equal(r.json.cash, 25000); assert.equal(r.json.replayed, false);
  assert.equal(r.json.land.cash, 25000);
  assert.deepEqual(r.json.land.mine.map((m) => m.key), ['kuto-07']);
  assert.equal(r.json.land.plots.find((p) => p.key === 'kuto-07').status, 'mine');
  assert.equal(cashOf(A.userId), 25000);
  assert.equal(sql(`select p.user_id from public.land_plots l join public.players p on p.id = l.owner_player_id where l.plot_key = 'kuto-07'`), A.userId);
  assert.equal(sql('select count(*) || \':\' || sum(amount) from public.ledger_entries'), '2:0');
  const get = await api('/api/land', { who: A });
  assert.equal(get.status, 200); assert.equal(get.json.cash, 25000); assert.equal(get.json.plots.length, 12);
});

test('idempotent retries: the same request is answered again and never charged twice', async () => {
  const again = await buy(A, 'kuto-07', plot07Id);
  assert.equal(again.status, 200); assert.equal(again.json.replayed, true); assert.equal(again.json.cash, 25000);
  assert.equal(again.json.transactionId, (await buy(A, 'kuto-07', plot07Id)).json.transactionId);
  assert.equal(txCount('kuto-07'), 1); assert.equal(cashOf(A.userId), 25000);
  const reused = await buy(A, 'kuto-08', plot07Id);
  assert.equal(reused.status, 409); assert.equal(reused.json.code, 'request-reused');
  // Five identical requests at the same moment (a double-click storm or a retrying client).
  const id = newId();
  const all = await Promise.all(Array.from({ length: 5 }, () => buy(A, 'kuto-08', id)));
  assert.deepEqual(all.map((r) => r.status), [200, 200, 200, 200, 200]);
  assert.equal(all.filter((r) => r.json.replayed === false).length, 1);
  assert.equal(txCount('kuto-08'), 1); assert.equal(cashOf(A.userId), 0);
});

test('insufficient funds: refused, nothing charged, never negative', async () => {
  const r = await buy(A, 'kuto-09');
  assert.equal(r.status, 402); assert.equal(r.json.code, 'insufficient-funds');
  assert.equal(cashOf(A.userId), 0); assert.equal(txCount('kuto-09'), 0);
});

test('already-sold plot: another player cannot buy it', async () => {
  const r = await buy(B, 'kuto-07');
  assert.equal(r.status, 409); assert.equal(r.json.code, 'sold');
  assert.equal(cashOf(B.userId), 50000); assert.equal(txCount('kuto-07'), 1);
  const view = await api('/api/land', { who: B });
  const p = view.json.plots.find((x) => x.key === 'kuto-07');
  assert.equal(p.status, 'owned'); assert.equal(p.ownerName, 'Ada Kuto');
  assert.deepEqual(view.json.mine, []); assert.equal(view.json.cash, 50000);
  assert.doesNotMatch(view.text, UUID, 'B\'s land view contains no player, user or transaction ids');
});

test('one player\'s requests cannot act on another player', async () => {
  // B reuses A's request id: it is B's own new purchase, not a replay of A's, and charges B only.
  const r = await buy(B, 'kuto-01', plot07Id);
  assert.equal(r.status, 200); assert.equal(r.json.replayed, false); assert.equal(r.json.cash, 0);
  assert.equal(cashOf(B.userId), 0); assert.equal(cashOf(A.userId), 0);
  // A's private view is unchanged; B's purchase shows up only in B's.
  const a = await api('/api/land', { who: A });
  assert.deepEqual(a.json.mine.map((m) => m.key).sort(), ['kuto-07', 'kuto-08']);
  assert.equal(a.json.plots.find((x) => x.key === 'kuto-01').ownerName, 'Bayo Ade');
  // Naming another player in the body is refused outright.
  const forged = await buy(B, 'kuto-02', newId(), { playerId: A.userId });
  assert.equal(forged.status, 400);
  assert.equal(sql(`select count(*) from public.economy_transactions t join public.players p on p.id = t.player_id where p.user_id = '${A.userId}'`), '2');
});

test('unexpected database errors give a clear server error and charge nothing', async () => {
  // (a) a database permission error while reading land
  sql('revoke execute on function public.get_my_land() from authenticated');
  try {
    const r = await api('/api/land', { who: C });
    assert.equal(r.status, 500); assert.equal(r.json.code, 'server'); assert.equal(r.json.error, 'Could not load land.');
  } finally { sql('grant execute on function public.get_my_land() to authenticated'); }

  // (b) the database API is down during a purchase: 500, and nothing was charged
  const before = cashOf(C.userId);
  execFileSync('docker', ['stop', '-t', '1', REST_CONTAINER]);
  try {
    const r = await buy(C, 'kuto-03');
    assert.equal(r.status, 500); assert.equal(r.json.code, 'server');
  } finally {
    execFileSync('docker', ['start', REST_CONTAINER]);
    for (let i = 0; i < 60; i++) { try { if ((await fetch(REST_HEALTH)).ok) break; } catch { /* starting */ } await sleep(500); }
  }
  assert.equal(cashOf(C.userId), before); assert.equal(txCount('kuto-03'), 0);

  // (c) the land functions are missing (migration not applied): 503 "not open yet"
  sql('alter function public.get_land_plots() rename to get_land_plots_hidden; notify pgrst, \'reload schema\'');
  try {
    let r;
    for (let i = 0; i < 40; i++) { r = await api('/api/land', { who: C }); if (r.status === 503) break; await sleep(250); }
    assert.equal(r.status, 503); assert.equal(r.json.code, 'unavailable'); assert.equal(r.json.error, 'Land is not open on this server yet.');
  } finally {
    sql('alter function public.get_land_plots_hidden() rename to get_land_plots; notify pgrst, \'reload schema\'');
    for (let i = 0; i < 40; i++) { if ((await api('/api/land', { who: C })).status === 200) break; await sleep(250); }
  }
  assert.equal((await api('/api/land', { who: C })).status, 200);
});

test('account deletion: refused for a land owner (nothing removed), still works for a player without land', async () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const refused = await admin.auth.admin.deleteUser(A.userId);
  assert.ok(refused.error, 'deleting a land owner must fail');
  assert.equal(sql(`select count(*) from auth.users where id = '${A.userId}'`), '1');
  const stillThere = await api('/api/land', { who: A });
  assert.equal(stillThere.status, 200);
  assert.deepEqual(stillThere.json.mine.map((m) => m.key).sort(), ['kuto-07', 'kuto-08']);

  const ok = await admin.auth.admin.deleteUser(C.userId);
  assert.equal(ok.error, null, ok.error?.message);
  assert.equal(sql(`select count(*) from public.players where user_id = '${C.userId}'`), '0');
  assert.equal((await api('/api/player', { who: C })).status, 401, 'the deleted account\'s session no longer works');
});

test('money is conserved across everything above', () => {
  assert.equal(sql('select count(*) from public.players where cash < 0'), '0');
  assert.equal(sql('select sum(amount) from public.ledger_entries'), '0');
  // A and B started with ₦50,000 each and spent 25,000 + 25,000 and 50,000 on land.
  assert.equal(sql(`select (select sum(cash) from public.players p where p.user_id in ('${A.userId}', '${B.userId}'))
                         + (select sum(amount) from public.ledger_entries where account = 'game:land-sales')`), '100000');
});
