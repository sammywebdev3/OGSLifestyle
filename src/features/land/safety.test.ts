/**
 * Static safety checks for Phase 3.3A land (no browser or database needed):
 *  - only the server service talks to the database about land, through the three
 *    land functions, passing nothing but the plot key and request id;
 *  - nothing uses the service-role client;
 *  - the browser never decides cash or ownership itself.
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

const CLIENT_LAND = [
  ...sourceFiles(join(SRC, 'features/land')).map((p) => relative(SRC, p)),
  'components/game/LandDialog.tsx', 'components/game/LandPanel.tsx', 'components/game/GameScreen.tsx',
];

test('land client code never talks to Supabase directly', () => {
  for (const p of CLIENT_LAND) {
    const src = code(read(p));
    assert.equal(/\.rpc\(|\.from\(\s*['"`]|lib\/supabase|getBrowserSupabase|createClient/.test(src), false, `${p} reaches the database`);
  }
});

test('only the land service calls the land functions, with only the plot key and request id', () => {
  const callers = sourceFiles(SRC).filter((p) => /buy_land_plot|get_land_plots|get_my_land/.test(code(readFileSync(p, 'utf8'))) && !p.endsWith('database.types.ts'));
  assert.deepEqual(callers.map((p) => relative(SRC, p)), ['server/services/landService.ts']);
  const svc = code(read('server/services/landService.ts'));
  const rpcs = [...svc.matchAll(/\.rpc\(\s*'([^']+)'([^)]*)\)/g)].map((m) => ({ name: m[1], args: m[2]!.trim() }));
  assert.deepEqual(rpcs.map((r) => r.name).sort(), ['buy_land_plot', 'get_land_plots', 'get_my_land']);
  assert.equal(rpcs.find((r) => r.name === 'buy_land_plot')?.args, ', { p_plot_key: req.plotKey, p_idempotency_key: req.requestId }');
  for (const r of rpcs.filter((x) => x.name !== 'buy_land_plot')) assert.equal(r.args, '', `${r.name} takes no arguments`);
  // The only table read is the caller's own balance (players RLS: own row); no table is ever written.
  assert.deepEqual([...svc.matchAll(/\.from\(\s*'([^']+)'\)([^\n]*)/g)].map((m) => `${m[1]}${m[2]}`), ["players.select('cash').maybeSingle(),"]);
  assert.equal(/\.(insert|update|upsert|delete)\(/.test(svc), false, 'the service writes no table');
});

test('nothing uses the service-role (admin) client', () => {
  const users = sourceFiles(SRC).filter((p) => /lib\/supabase\/admin|getAdminSupabase|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(code(readFileSync(p, 'utf8'))));
  assert.deepEqual(users.map((p) => relative(SRC, p)).filter((p) => p !== 'lib/supabase/admin.ts' && p !== 'lib/supabase/env.ts'), []);
});

test('the buy route checks origin and body before using the database, and uses the user-scoped client', () => {
  const route = code(read('app/api/land/buy/route.ts'));
  assert.ok(route.indexOf('parseBuyRequest(') > 0 && route.indexOf('parseBuyRequest(') < route.indexOf('getServerSupabase()'), 'parse before database');
  assert.match(route, /if \(!parsed\.ok\) return/);
  assert.match(route, /buyPlot\(db, parsed\.value\)/);
  assert.equal(/admin/.test(route), false);
  const get = code(read('app/api/land/route.ts'));
  assert.match(get, /getServerSupabase\(\)/);
});

test('the browser only shows cash the server returned, and never marks land as owned by itself', () => {
  const hook = code(read('features/land/useLand.ts'));
  const cashCalls = [...hook.matchAll(/onCash\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(cashCalls, ['land.cash', 'result.cash']);
  assert.equal(/status:\s*'mine'/.test(hook), false, 'useLand never sets a plot to "mine" itself');
  for (const p of CLIENT_LAND) assert.equal(/cash\s*[-+]=|cash:\s*[^,}]*[-+]\s*\w/.test(code(read(p))), false, `${p} computes a balance`);
  const provider = code(read('features/player/PlayerProvider.tsx'));
  assert.match(provider, /applyServerCash = useCallback\(\(cash: number\) => \{\n\s*if \(!Number\.isSafeInteger\(cash\) \|\| cash < 0\) return;/);
});

test('the purchase request body carries only plotKey and requestId', () => {
  const api = code(read('features/land/api.ts'));
  assert.match(api, /body: JSON\.stringify\(\{ plotKey, requestId \}\)/);
});
