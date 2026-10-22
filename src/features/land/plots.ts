/**
 * Phase 3.3A land: plot tiers, prices and the 12 Kuto Street plots.
 *
 * The DATABASE is the authority for every plot, price and owner: this list only
 * mirrors the seed in supabase/migrations/20261020000000_phase3_3a_land.sql so
 * tests can check each plot against the map (placement.test.ts) and that the
 * seed matches it. The client never sends a price; the server never reads one.
 */
import type { TileRect } from './placement.ts';

export type LandTier = 'basic' | 'standard' | 'premium';

/** Whole Naira. Mirrors the seeded prices; the purchase function reads the price from the database. */
export const LAND_PRICES: Record<LandTier, number> = { basic: 25_000, standard: 50_000, premium: 100_000 };

export const LAND_TIERS: Record<LandTier, { label: string }> = {
  basic: { label: 'Basic' },
  standard: { label: 'Standard' },
  premium: { label: 'Premium' },
};

/** Plot keys look like "kuto-01" (same rule as the database). */
export const PLOT_KEY_PATTERN = /^[a-z]{1,12}-[0-9]{2}$/;
export const isPlotKey = (v: unknown): v is string => typeof v === 'string' && PLOT_KEY_PATTERN.test(v);

/** Interaction ids for plots in the scene are "plot:<key>"; the UI opens the land dialog for them. */
export const PLOT_TARGET_PREFIX = 'plot:';

/** "kuto-07" → "Plot 07". */
export const plotLabel = (key: string) => `Plot ${key.slice(key.lastIndexOf('-') + 1)}`;

export interface PlotDef extends TileRect { key: string; tier: LandTier; note: string }

/** All 2×2 tiles. Checked by placement.test.ts: open ground, nothing built or blocked, no overlaps. */
export const KUTO_PLOTS: readonly PlotDef[] = [
  { key: 'kuto-01', tier: 'standard', x: 12, y: 0, w: 2, d: 2, note: 'North-east of Iya Basira Buka, by the palm' },
  { key: 'kuto-02', tier: 'standard', x: 15, y: 0, w: 2, d: 2, note: 'Quiet corner north of Blessed POS' },
  { key: 'kuto-03', tier: 'basic', x: 18, y: 0, w: 2, d: 2, note: 'Far north-east corner' },
  { key: 'kuto-04', tier: 'premium', x: 16, y: 3, w: 2, d: 2, note: 'Right beside Blessed POS' },
  { key: 'kuto-05', tier: 'premium', x: 0, y: 5, w: 2, d: 2, note: 'Next to Kuto Court, facing the main road' },
  { key: 'kuto-06', tier: 'premium', x: 18, y: 12, w: 2, d: 2, note: 'Road frontage beside Mama T Stores' },
  { key: 'kuto-07', tier: 'basic', x: 0, y: 15, w: 2, d: 2, note: 'South-west edge, past the okada park' },
  { key: 'kuto-08', tier: 'basic', x: 3, y: 15, w: 2, d: 2, note: 'Behind the okada park' },
  { key: 'kuto-09', tier: 'basic', x: 18, y: 15, w: 2, d: 2, note: 'Grassy south-east edge' },
  { key: 'kuto-10', tier: 'standard', x: 9, y: 16, w: 2, d: 2, note: 'In front of the storey building, west side' },
  { key: 'kuto-11', tier: 'standard', x: 12, y: 16, w: 2, d: 2, note: 'In front of the storey building, east side' },
  { key: 'kuto-12', tier: 'standard', x: 15, y: 16, w: 2, d: 2, note: 'Just south of Mama T Stores' },
];
