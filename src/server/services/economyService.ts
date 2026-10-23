import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { ClaimResult, JobsSnapshot, ShopKey, ShopPurchaseResult, ShopSnapshot } from '@/types/economy';
import { economyFailure, parseClaimRow, parseShopBuyRow, toJobsSnapshot, toShopSnapshot, type EconomyAction } from '@/features/economy/mapping';
import type { ClaimRequest, ShopBuyRequest, StartJobRequest } from '@/features/economy/request';
import { ServiceError } from './errors';

type Db = SupabaseClient<Database>;

/**
 * Jobs and shops for the signed-in player. Uses the request's own Supabase client (the
 * player's session, never the service-role key): the database functions decide who the
 * caller is from auth.uid(), and take pay and prices from their own catalogue.
 */
async function requireUser(db: Db): Promise<void> {
  // getUser() validates the JWT with Supabase Auth (getSession() would trust the cookie).
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new ServiceError(401, 'Please sign in.', undefined, 'signed-out');
}

function fail(code: string | undefined, action: EconomyAction): never {
  const f = economyFailure(code, action);
  throw new ServiceError(f.status, f.message, undefined, f.code);
}

const unusable = (): never => {
  throw new ServiceError(500, 'Could not complete that. Please try again.', undefined, 'server');
};

// The caller's own balance (players RLS: read own row only), so the HUD always matches the database.
const readCash = async (db: Db) => {
  const me = await db.from('players').select('cash').maybeSingle();
  return me.error ? null : me.data?.cash;
};

async function readJobs(db: Db): Promise<JobsSnapshot> {
  const [jobs, cash] = await Promise.all([db.rpc('get_my_jobs'), readCash(db)]);
  if (jobs.error) fail(jobs.error.code, 'read-jobs');
  return toJobsSnapshot(jobs.data, cash) ?? unusable();
}

/** The job board, the caller's shift in progress (if any) and today's shift count. */
export async function getJobs(db: Db): Promise<JobsSnapshot> {
  await requireUser(db);
  return readJobs(db);
}

/** Start a shift. Only the job key is passed on; pay and duration come from the database. */
export async function startJob(db: Db, req: StartJobRequest): Promise<JobsSnapshot> {
  await requireUser(db);
  const { error } = await db.rpc('start_job_shift', { p_job_key: req.jobKey });
  if (error) fail(error.code, 'start');
  return readJobs(db);
}

/** Collect the wage for a finished shift. Retries with the same request id are answered, not paid again. */
export async function claimJob(db: Db, req: ClaimRequest): Promise<ClaimResult> {
  await requireUser(db);
  const { data, error } = await db.rpc('claim_job_shift', { p_idempotency_key: req.requestId });
  if (error) fail(error.code, 'claim');
  const row = parseClaimRow(data) ?? unusable();
  return { shiftId: row.shift_id, jobKey: row.job_key, pay: row.pay, cash: row.cash, transactionId: row.transaction_id, replayed: row.replayed, jobs: await readJobs(db) };
}

/** Stop the shift in progress without pay. */
export async function abandonJob(db: Db): Promise<JobsSnapshot> {
  await requireUser(db);
  const { error } = await db.rpc('abandon_job_shift');
  if (error) fail(error.code, 'abandon');
  return readJobs(db);
}

/** What one shop sells right now (names and prices from the database). */
export async function getShop(db: Db, shop: ShopKey): Promise<ShopSnapshot> {
  await requireUser(db);
  const [items, cash] = await Promise.all([db.rpc('get_shop', { p_shop_key: shop }), readCash(db)]);
  if (items.error) fail(items.error.code, 'read-shop');
  return toShopSnapshot(shop, items.data, cash) ?? unusable();
}

/** Buy an item. Only the item key, quantity and request id are passed on; the price is the database's. */
export async function buyItem(db: Db, req: ShopBuyRequest): Promise<ShopPurchaseResult> {
  await requireUser(db);
  const { data, error } = await db.rpc('buy_shop_item', { p_item_key: req.itemKey, p_quantity: req.quantity, p_idempotency_key: req.requestId });
  if (error) fail(error.code, 'buy');
  const row = parseShopBuyRow(data);
  if (!row || row.item_key !== req.itemKey || row.quantity !== req.quantity) return unusable();
  return { itemKey: row.item_key, quantity: row.quantity, total: row.total, cash: row.cash, owned: row.owned, transactionId: row.transaction_id, replayed: row.replayed };
}
