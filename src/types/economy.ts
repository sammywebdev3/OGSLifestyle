/** Phase 3.4A jobs and shops: what the client is shown. All of it comes from the server. */
import type { ItemKey } from '@/types/inventory';

export interface Job {
  key: string;
  title: string;
  description: string;
  /** Whole Naira paid for one finished shift, from the database. */
  pay: number;
  durationSeconds: number;
}

/** The caller's shift in progress. Times are the server's (ISO strings). */
export interface ActiveShift { shiftId: string; jobKey: string; pay: number; startedAt: string; endsAt: string }

export interface JobsSnapshot {
  jobs: Job[];
  active: ActiveShift | null;
  shiftsToday: number;
  dailyLimit: number;
  /** The database clock when this was read, so the client can show a countdown without trusting its own clock. */
  serverNow: string;
  /** Your cash as the database holds it right now. */
  cash: number | null;
}

/** Answer to a claim: the authoritative balance after the wage. */
export interface ClaimResult { shiftId: string; jobKey: string; pay: number; cash: number; transactionId: string; replayed: boolean; jobs: JobsSnapshot }

export type ShopKey = 'buka' | 'mama-t-stores';

export interface ShopItem { key: ItemKey; name: string; price: number; maxPerPurchase: number }

export interface ShopSnapshot { shop: ShopKey; items: ShopItem[]; cash: number | null }

/** Answer to a purchase: what was charged, the balance after it and how many of the item you now own. */
export interface ShopPurchaseResult { itemKey: ItemKey; quantity: number; total: number; cash: number; owned: number; transactionId: string; replayed: boolean }
