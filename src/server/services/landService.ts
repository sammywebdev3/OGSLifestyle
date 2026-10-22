import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { LandSnapshot, PurchaseResult } from '@/types/land';
import { landFailure, parseBuyRow, toLandSnapshot } from '@/features/land/mapping';
import type { BuyRequest } from '@/features/land/request';
import { ServiceError } from './errors';

type Db = SupabaseClient<Database>;

/**
 * Land for the signed-in player. Uses the request's own Supabase client (the
 * player's session, never the service-role key): the database functions decide
 * who the caller is from auth.uid().
 */
async function requireUser(db: Db): Promise<void> {
  // getUser() validates the JWT with Supabase Auth (getSession() would trust the cookie).
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ServiceError(401, 'Please sign in.', undefined, 'signed-out');
}

function fail(code: string | undefined, during: 'buy' | 'read'): never {
  const f = landFailure(code, during);
  throw new ServiceError(f.status, f.message, undefined, f.code);
}

async function readLand(db: Db): Promise<LandSnapshot> {
  const [plots, mine, me] = await Promise.all([
    db.rpc('get_land_plots'),
    db.rpc('get_my_land'),
    // The caller's own balance (players RLS: read own row only), so the HUD always matches the database.
    db.from('players').select('cash').maybeSingle(),
  ]);
  if (plots.error) fail(plots.error.code, 'read');
  if (mine.error) fail(mine.error.code, 'read');
  return toLandSnapshot(plots.data ?? [], mine.data ?? [], me.error ? null : me.data?.cash);
}

/** Every plot (public facts: tier, price, footprint, owner's character name) and the caller's own plots. */
export async function getLand(db: Db): Promise<LandSnapshot> {
  await requireUser(db);
  return readLand(db);
}

/**
 * Buy a plot from the game. Only the plot key and the request id are passed on;
 * the database function takes the buyer from the session, the price from the
 * registry, and does the whole purchase atomically.
 */
export async function buyPlot(db: Db, req: BuyRequest): Promise<PurchaseResult> {
  await requireUser(db);
  const { data, error } = await db.rpc('buy_land_plot', { p_plot_key: req.plotKey, p_idempotency_key: req.requestId });
  if (error) fail(error.code, 'buy');
  const row = parseBuyRow(data);
  if (!row || row.plot_key !== req.plotKey) throw new ServiceError(500, 'Could not complete the purchase.', undefined, 'server');
  return { plotKey: row.plot_key, price: row.price, cash: row.cash, transactionId: row.transaction_id, replayed: row.replayed, land: await readLand(db) };
}
