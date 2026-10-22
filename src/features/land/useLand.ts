'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LandPlot, LandSnapshot } from '@/types/land';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import { ApiError } from '@/features/player/api';
import { KUTO_PLOTS, LAND_PRICES } from './plots';
import { fetchLand, postBuyPlot } from './api';
import { PurchaseAttempt, type AttemptState } from './purchase';
import { newRequestId } from './request';
import type { LandErrorCode } from './mapping';

export interface LandState {
  /** "guest" = local preview: plots are shown from the map data, without owners, and cannot be bought. */
  status: 'loading' | 'ready' | 'error' | 'guest';
  plots: LandPlot[];
  mine: LandSnapshot['mine'];
  error: string | null;
  attempt: AttemptState;
  refresh: () => Promise<void>;
  /** Ask the server to buy `plotKey`. Resolves when the server has answered (or the request failed). */
  buy: (plotKey: string) => Promise<void>;
  clearAttempt: () => void;
}

const GUEST_PLOTS: LandPlot[] = KUTO_PLOTS.map((p) => ({ key: p.key, tier: p.tier, price: LAND_PRICES[p.tier], x: p.x, y: p.y, w: p.w, d: p.d, status: 'unknown', ownerName: null }));

/**
 * Land as the server reports it. Ownership and cash change ONLY from a server
 * response: `onCash` receives the balance the purchase response carried.
 */
export function useLand({ mode, onCash }: { mode: PlayerMode; onCash: (cash: number) => void }): LandState {
  const [snap, setSnap] = useState<{ status: LandState['status']; plots: LandPlot[]; mine: LandSnapshot['mine']; error: string | null }>(
    mode === 'guest' ? { status: 'guest', plots: GUEST_PLOTS, mine: [], error: null } : { status: 'loading', plots: [], mine: [], error: null });
  const attemptRef = useRef(new PurchaseAttempt(newRequestId));
  // Answers that arrive after a newer request was sent are stale and ignored.
  const version = useRef(0);
  const [attempt, setAttempt] = useState<AttemptState>({ kind: 'idle' });
  const sync = () => setAttempt({ ...attemptRef.current.state });

  const refresh = useCallback(async () => {
    if (mode === 'guest') return;
    const v = ++version.current;
    try {
      const land = await fetchLand();
      if (v !== version.current) return;
      setSnap({ status: 'ready', plots: land.plots, mine: land.mine, error: null });
      if (land.cash !== null) onCash(land.cash);
    } catch (e) {
      if (v !== version.current) return;
      setSnap((s) => ({ ...s, status: s.plots.length ? s.status : 'error', error: e instanceof Error ? e.message : 'Could not load land.' }));
    }
  }, [mode, onCash]);

  useEffect(() => { void refresh(); }, [refresh]);

  const buy = useCallback(async (plotKey: string) => {
    if (mode === 'guest') return;
    const req = attemptRef.current.start(plotKey);
    if (!req) return; // already sending
    sync();
    version.current += 1; // a land view loading right now must not overwrite this purchase's answer
    try {
      const result = await postBuyPlot(req.plotKey, req.requestId);
      onCash(result.cash);
      setSnap({ status: 'ready', plots: result.land.plots, mine: result.land.mine, error: null });
      attemptRef.current.succeeded(result.replayed);
    } catch (e) {
      const code: LandErrorCode | 'network' = e instanceof ApiError ? ((e.code as LandErrorCode | undefined) ?? (e.status >= 500 ? 'server' : 'invalid')) : 'network';
      const message = code === 'network' || code === 'server'
        ? 'We could not confirm the purchase (network or server problem). It is safe to try again: you will not be charged twice.'
        : e instanceof Error ? e.message : 'Could not complete the purchase.';
      attemptRef.current.failed(code, message);
      // The plot may have changed hands (sold) or the purchase may have gone through: show the server's view.
      void refresh();
    }
    sync();
  }, [mode, onCash, refresh]);

  const clearAttempt = useCallback(() => { attemptRef.current.reset(); setAttempt({ ...attemptRef.current.state }); }, []);

  return { ...snap, attempt, refresh, buy, clearAttempt };
}
