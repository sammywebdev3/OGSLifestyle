/** Phase 3.3A land: what the client is shown. All of it comes from the server. */
import type { LandTier } from '@/features/land/plots';

/** "for-sale" = still owned by the game; "mine" = yours; "owned" = another player's; "unknown" = guest preview. */
export type PlotStatus = 'for-sale' | 'mine' | 'owned' | 'unknown';

export interface LandPlot {
  key: string;
  tier: LandTier;
  /** Whole Naira, from the database. */
  price: number;
  /** Footprint in map tiles. */
  x: number; y: number; w: number; d: number;
  status: PlotStatus;
  /** Character name of the owner, if a player owns it. */
  ownerName: string | null;
}

/** A plot you own, with what you paid (private: only your own). */
export interface MyPlot { key: string; tier: LandTier; pricePaid: number; acquiredAt: string; transactionId: string }

export interface LandSnapshot {
  plots: LandPlot[];
  mine: MyPlot[];
  /** Your cash as the database holds it right now (read under your own row-level security). */
  cash: number | null;
}

/** The server's answer to a purchase: the authoritative balance and the fresh land view. */
export interface PurchaseResult {
  plotKey: string;
  price: number;
  /** Your cash after the purchase, from the database. */
  cash: number;
  transactionId: string;
  /** True when this was a retry of a purchase that had already gone through (nothing charged again). */
  replayed: boolean;
  land: LandSnapshot;
}
