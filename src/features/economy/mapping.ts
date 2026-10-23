/**
 * Database results → the client's jobs and shop model, and database errors → HTTP answers.
 * Pure (no Supabase, no Next.js) so the server service and the tests share it.
 * Rows that do not look right are dropped (or the whole answer refused) rather than shown.
 */
import type { ActiveShift, Job, JobsSnapshot, ShopItem, ShopKey, ShopSnapshot } from '../../types/economy.ts';
import type { ItemKey } from '../../types/inventory.ts';
import { ITEMS } from '../../config/game.ts';
import { isCatalogueKey } from './request.ts';

const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length >= 1 && v.length <= max;
const isTime = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** Items the client can draw. An item the database sells but this build does not know is not offered. */
const isItemKey = (v: unknown): v is ItemKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);
const cashOrNull = (v: unknown): number | null => (isWhole(v, 0, Number.MAX_SAFE_INTEGER) ? v : null);

function toJob(raw: unknown): Job | null {
  const r = obj(raw);
  if (!r || !isCatalogueKey(r.job_key) || !isText(r.title, 60) || !isText(r.description, 200)
      || !isWhole(r.pay, 100, 100_000) || !isWhole(r.duration_seconds, 10, 3600)) return null;
  return { key: r.job_key, title: r.title, description: r.description, pay: r.pay, durationSeconds: r.duration_seconds };
}

function toActive(raw: unknown): ActiveShift | null {
  const r = obj(raw);
  if (!r || typeof r.shift_id !== 'string' || !isCatalogueKey(r.job_key) || !isWhole(r.pay, 100, 100_000) || !isTime(r.started_at) || !isTime(r.ends_at)) return null;
  return { shiftId: r.shift_id, jobKey: r.job_key, pay: r.pay, startedAt: r.started_at, endsAt: r.ends_at };
}

/** What get_my_jobs returned (jsonb), plus the caller's cash. Null when the answer is not usable. */
export function toJobsSnapshot(raw: unknown, cash: unknown = null): JobsSnapshot | null {
  const r = obj(raw);
  if (!r || !Array.isArray(r.jobs) || !isWhole(r.shifts_today, 0, 1_000_000) || !isWhole(r.daily_limit, 1, 1000) || !isTime(r.server_now)) return null;
  const active = r.active === null || r.active === undefined ? null : toActive(r.active);
  if (r.active && !active) return null; // a shift we cannot read must not look like "no shift"
  return {
    jobs: r.jobs.map(toJob).filter((j): j is Job => j !== null),
    active,
    shiftsToday: r.shifts_today,
    dailyLimit: r.daily_limit,
    serverNow: r.server_now,
    cash: cashOrNull(cash),
  };
}

function toShopItem(raw: unknown): ShopItem | null {
  const r = obj(raw);
  if (!r || !isItemKey(r.item_key) || !isText(r.name, 60) || !isWhole(r.price, 10, 1_000_000) || !isWhole(r.max_per_purchase, 1, 20)) return null;
  return { key: r.item_key, name: r.name, price: r.price, maxPerPurchase: r.max_per_purchase };
}

export function toShopSnapshot(shop: ShopKey, raw: unknown, cash: unknown = null): ShopSnapshot | null {
  if (!Array.isArray(raw)) return null;
  return { shop, items: raw.map(toShopItem).filter((i): i is ShopItem => i !== null), cash: cashOrNull(cash) };
}

/** What claim_job_shift returned (jsonb). */
export interface ClaimRow { transaction_id: string; shift_id: string; job_key: string; pay: number; cash: number; replayed: boolean }

export function parseClaimRow(raw: unknown): ClaimRow | null {
  const r = obj(raw);
  if (!r || typeof r.transaction_id !== 'string' || typeof r.shift_id !== 'string' || !isCatalogueKey(r.job_key)
      || !isWhole(r.pay, 100, 100_000) || !isWhole(r.cash, 0, Number.MAX_SAFE_INTEGER) || typeof r.replayed !== 'boolean') return null;
  return { transaction_id: r.transaction_id, shift_id: r.shift_id, job_key: r.job_key, pay: r.pay, cash: r.cash, replayed: r.replayed };
}

/** What buy_shop_item returned (jsonb). */
export interface ShopBuyRow { transaction_id: string; item_key: ItemKey; quantity: number; total: number; cash: number; owned: number; replayed: boolean }

export function parseShopBuyRow(raw: unknown): ShopBuyRow | null {
  const r = obj(raw);
  if (!r || typeof r.transaction_id !== 'string' || !isItemKey(r.item_key) || !isWhole(r.quantity, 1, 20) || !isWhole(r.total, 10, 10_000_000)
      || !isWhole(r.cash, 0, Number.MAX_SAFE_INTEGER) || !isWhole(r.owned, 0, 999) || typeof r.replayed !== 'boolean') return null;
  return { transaction_id: r.transaction_id, item_key: r.item_key, quantity: r.quantity, total: r.total, cash: r.cash, owned: r.owned, replayed: r.replayed };
}

/** Machine-readable reasons the UI can act on. */
export type EconomyErrorCode =
  | 'signed-out' | 'no-character' | 'invalid' | 'not-found' | 'busy' | 'bag-full' | 'not-finished' | 'daily-limit'
  | 'insufficient-funds' | 'request-reused' | 'unavailable' | 'server';

export interface EconomyFailure { status: number; code: EconomyErrorCode; message: string }

export type EconomyAction = 'read-jobs' | 'start' | 'claim' | 'abandon' | 'read-shop' | 'buy';

const NOT_FOUND: Record<EconomyAction, string> = {
  'read-jobs': 'Jobs could not be found.',
  start: 'That job is not available.',
  claim: 'You have no shift to claim.',
  abandon: 'You have no shift to stop.',
  'read-shop': 'That shop does not exist.',
  buy: 'That item is not for sale.',
};

/** SQLSTATE from the Phase 3.4A functions → HTTP status, code and a message for the player. */
export function economyFailure(sqlstate: string | undefined, action: EconomyAction): EconomyFailure {
  const reading = action === 'read-jobs' || action === 'read-shop';
  switch (sqlstate) {
    case '28000':
      // The service checks the session first, so on reads this means "no character".
      return reading
        ? { status: 403, code: 'no-character', message: 'Create a character first.' }
        : { status: 401, code: 'signed-out', message: 'Please sign in.' };
    case 'OG403': return { status: 403, code: 'no-character', message: 'Create a character first.' };
    case '22023': case '22P02': case '22003':
      return { status: 400, code: 'invalid', message: action === 'buy' ? 'That purchase request is not valid.' : 'That request is not valid.' };
    case 'OG404': return { status: 404, code: 'not-found', message: NOT_FOUND[action] };
    case 'OG409':
      return action === 'buy'
        ? { status: 409, code: 'bag-full', message: 'Your bag cannot hold more of that.' }
        : { status: 409, code: 'busy', message: 'You are already working a shift.' };
    case 'OG425': return { status: 409, code: 'not-finished', message: 'Your shift is not finished yet.' };
    case 'OG429': return { status: 429, code: 'daily-limit', message: 'You have worked enough shifts for today. Rest and come back later.' };
    case 'OG402': return { status: 402, code: 'insufficient-funds', message: 'You do not have enough cash for that.' };
    case 'OG422': return { status: 409, code: 'request-reused', message: 'That request was already used for something else. Please try again.' };
    // The functions do not exist: the Phase 3.4A migration has not been applied to this database.
    case 'PGRST202': case '42883': return { status: 503, code: 'unavailable', message: 'Jobs and shops are not open on this server yet.' };
    default:
      return { status: 500, code: 'server', message: reading ? 'Could not load this right now.' : 'Could not complete that. Please try again.' };
  }
}
