/**
 * Static safety checks for Phase 3.4A jobs and shops (no browser or database needed):
 *  - only the economy service talks to the database about jobs and shops, through the six
 *    3.4A functions, passing nothing but keys, a quantity and request ids;
 *  - the browser never decides cash, pay, prices or item counts itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const CLIENT = [
  ...sourceFiles(join(SRC, 'features/economy')).map((p) => relative(SRC, p)),
  'components/game/WorkShopPanel.tsx', 'components/game/GameScreen.tsx',
];
const FUNCTIONS = /start_job_shift|claim_job_shift|abandon_job_shift|get_my_jobs|get_shop|buy_shop_item/;

test('jobs and shops client code never talks to Supabase directly', () => {
  for (const p of CLIENT) {
    assert.equal(/\.rpc\(|\.from\(\s*['"`]|lib\/supabase|getBrowserSupabase|createClient/.test(code(read(p))), false, `${p} reaches the database`);
  }
});

test('only the economy service calls the 3.4A functions, with only keys, quantity and request ids', () => {
  const callers = sourceFiles(SRC).filter((p) => FUNCTIONS.test(code(readFileSync(p, 'utf8'))) && !p.endsWith('database.types.ts'));
  assert.deepEqual(callers.map((p) => relative(SRC, p)), ['server/services/economyService.ts']);
  const svc = code(read('server/services/economyService.ts'));
  const rpcs = Object.fromEntries([...svc.matchAll(/\.rpc\(\s*'([^']+)'([^)]*)\)/g)].map((m) => [m[1], m[2]!.trim()]));
  assert.deepEqual(rpcs, {
    get_my_jobs: '',
    start_job_shift: ', { p_job_key: req.jobKey }',
    claim_job_shift: ', { p_idempotency_key: req.requestId }',
    abandon_job_shift: '',
    get_shop: ', { p_shop_key: shop }',
    buy_shop_item: ', { p_item_key: req.itemKey, p_quantity: req.quantity, p_idempotency_key: req.requestId }',
  });
  // The only table read is the caller's own balance (players RLS: own row); no table is ever written.
  assert.deepEqual([...svc.matchAll(/\.from\(\s*'([^']+)'\)([^\n]*)/g)].map((m) => `${m[1]}${m[2]}`), ["players.select('cash').maybeSingle();"]);
  assert.equal(/\.(insert|update|upsert|delete)\(/.test(svc), false, 'the service writes no table');
  assert.equal(/admin|SERVICE_ROLE|SECRET_KEY/.test(svc), false, 'the service never uses the service-role client');
});

test('every POST route validates same-origin JSON before using the database', () => {
  const helpers = code(read('server/http/routeHelpers.ts'));
  const post = helpers.slice(helpers.indexOf('export async function respondToPost'));
  assert.ok(post.indexOf('parseJsonRequest(') > 0 && post.indexOf('parseJsonRequest(') < post.indexOf('respond('), 'parse before database');
  assert.match(post, /if \(!parsed\.ok\) return/);
  for (const [route, validator] of [['jobs/start', 'validateStartJobBody'], ['jobs/claim', 'validateClaimBody'], ['jobs/abandon', 'validateAbandonBody'], ['shop/buy', 'validateShopBuyBody']]) {
    const src = code(read(`app/api/${route}/route.ts`));
    assert.match(src, new RegExp(`respondToPost\\(request, ${validator}, `), route);
    assert.equal(/export async function GET/.test(src), false, `${route} has no GET`);
  }
  assert.match(code(read('app/api/shop/route.ts')), /if \(!isShopKey\(shop\)\) return/);
});

test('request bodies carry only what names the action', () => {
  const api = code(read('features/economy/api.ts'));
  const bodies = [...api.matchAll(/body: (JSON\.stringify\([^)]*\)|'[^']*')/g)].map((m) => m[1]);
  assert.deepEqual(bodies, ['JSON.stringify({ jobKey })', 'JSON.stringify({ requestId })', "'{}'", 'JSON.stringify({ itemKey, quantity, requestId })']);
});

test('the browser shows only cash and item counts the server returned', () => {
  const hook = code(read('features/economy/useEconomy.ts'));
  assert.deepEqual([...hook.matchAll(/onCash\(([^)]*)\)/g)].map((m) => m[1]), ['snap.cash', 'snap.cash', 'result.cash', 'result.cash']);
  assert.deepEqual([...hook.matchAll(/onItem\(([^)]*)\)/g)].map((m) => m[1]), ['result.itemKey, result.owned']);
  for (const p of CLIENT) {
    assert.equal(/cash\s*[-+]=|cash:\s*[^,}]*[-+]\s*\w|quantity\s*[-+]=|owned\s*[-+]/.test(code(read(p))), false, `${p} computes a balance or count`);
  }
  const provider = code(read('features/player/PlayerProvider.tsx'));
  assert.match(provider, /const applyServerItem = useCallback\(\(key: ItemKey, owned: number\) => \{\n\s*if \(!Number\.isSafeInteger\(owned\) \|\| owned < 0\) return;/);
});
