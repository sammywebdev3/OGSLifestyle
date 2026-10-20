/**
 * Database results → the client's land model, and database errors → HTTP answers.
 * Pure (no Supabase, no Next.js) so the server service and the tests share it.
 * Rows that do not look right are dropped rather than shown.
 */
import type { LandPlot, LandSnapshot, MyPlot, PlotStatus } from '../../types/land.ts';
import { LAND_TIERS, isPlotKey, type LandTier } from './plots.ts';
import { MAP_H, MAP_W } from '../../game/world/starterArea.ts';

export interface PlotRow {
  plot_key: string; location_id: string; tier: string; price: number;
  tile_x: number; tile_y: number; width: number; depth: number;
  owner_name: string | null; owned_by_me: boolean;
}
export interface MyLandRow { plot_key: string; tier: string; price_paid: number; acquired_at: string; transaction_id: string }

const isTier = (v: unknown): v is LandTier => typeof v === 'string' && Object.prototype.hasOwnProperty.call(LAND_TIERS, v);
const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

export function toLandPlot(row: PlotRow): LandPlot | null {
  if (!isPlotKey(row.plot_key) || row.location_id !== 'kuto-street' || !isTier(row.tier) || !isWhole(row.price, 1, 10_000_000)) return null;
  const { tile_x: x, tile_y: y, width: w, depth: d } = row;
  if (!isWhole(x, 0, MAP_W - 1) || !isWhole(y, 0, MAP_H - 1) || !isWhole(w, 1, 8) || !isWhole(d, 1, 8) || x + w > MAP_W || y + d > MAP_H) return null;
  const status: PlotStatus = row.owned_by_me ? 'mine' : row.owner_name !== null ? 'owned' : 'for-sale';
  return { key: row.plot_key, tier: row.tier, price: row.price, x, y, w, d, status, ownerName: row.owner_name };
}

export function toMyPlot(row: MyLandRow): MyPlot | null {
  if (!isPlotKey(row.plot_key) || !isTier(row.tier) || !isWhole(row.price_paid, 1, 10_000_000)) return null;
  return { key: row.plot_key, tier: row.tier, pricePaid: row.price_paid, acquiredAt: row.acquired_at, transactionId: row.transaction_id };
}

export function toLandSnapshot(plots: readonly PlotRow[], mine: readonly MyLandRow[], cash: unknown = null): LandSnapshot {
  return {
    plots: plots.map(toLandPlot).filter((p): p is LandPlot => p !== null),
    mine: mine.map(toMyPlot).filter((p): p is MyPlot => p !== null),
    cash: isWhole(cash, 0, Number.MAX_SAFE_INTEGER) ? cash : null,
  };
}

/** What buy_land_plot returned (jsonb). */
export interface BuyRow { transaction_id: string; plot_key: string; price: number; cash: number; owned_by_me: boolean; replayed: boolean }

export function parseBuyRow(raw: unknown): BuyRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.transaction_id !== 'string' || !isPlotKey(r.plot_key) || !isWhole(r.price, 1, 10_000_000)
      || !isWhole(r.cash, 0, Number.MAX_SAFE_INTEGER) || typeof r.owned_by_me !== 'boolean' || typeof r.replayed !== 'boolean') return null;
  return { transaction_id: r.transaction_id, plot_key: r.plot_key, price: r.price, cash: r.cash, owned_by_me: r.owned_by_me, replayed: r.replayed };
}

/** Machine-readable reasons the UI can act on. */
export type LandErrorCode = 'signed-out' | 'no-character' | 'invalid' | 'not-found' | 'sold' | 'insufficient-funds' | 'request-reused' | 'unavailable' | 'server';

export interface LandFailure { status: number; code: LandErrorCode; message: string }

/** SQLSTATE from buy_land_plot / get_land_plots → HTTP status, code and a message for the player. */
export function landFailure(sqlstate: string | undefined, during: 'buy' | 'read'): LandFailure {
  switch (sqlstate) {
    case '28000':
      // The service checks the session first, so on reads this means "no character".
      return during === 'read'
        ? { status: 403, code: 'no-character', message: 'Create a character to see land.' }
        : { status: 401, code: 'signed-out', message: 'Please sign in.' };
    case 'OG403': return { status: 403, code: 'no-character', message: 'Create a character before buying land.' };
    case '22023': case '22P02': return { status: 400, code: 'invalid', message: 'That purchase request is not valid.' };
    case 'OG404': return { status: 404, code: 'not-found', message: 'That plot does not exist.' };
    case 'OG409': return { status: 409, code: 'sold', message: 'This plot has already been sold.' };
    case 'OG402': return { status: 402, code: 'insufficient-funds', message: 'You do not have enough cash for this plot.' };
    case 'OG422': return { status: 409, code: 'request-reused', message: 'That request was already used for another purchase. Please try again.' };
    // The land functions do not exist: the Phase 3.3A migration has not been applied to this database.
    case 'PGRST202': case '42883': return { status: 503, code: 'unavailable', message: 'Land is not open on this server yet.' };
    default: return { status: 500, code: 'server', message: during === 'buy' ? 'Could not complete the purchase.' : 'Could not load land.' };
  }
}
