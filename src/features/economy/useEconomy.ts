'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobsSnapshot, ShopKey, ShopSnapshot } from '@/types/economy';
import type { ItemKey } from '@/types/inventory';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import { ApiError } from '@/features/player/api';
import { fetchJobs, fetchShop, postAbandonJob, postBuyItem, postClaimJob, postStartJob } from './api';
import { MoneyAttempt, type Attempt } from './attempt';
import { newRequestId } from './request';
import type { EconomyErrorCode } from './mapping';

export interface EconomyState {
  /** "guest" = local preview: jobs and shops need an online character. */
  status: 'loading' | 'ready' | 'error' | 'guest';
  jobs: JobsSnapshot | null;
  /** Local time when `jobs` was read (for the server-clock countdown). */
  jobsReadAt: number;
  shop: ShopSnapshot | null;
  error: string | null;
  /** The job action (start / stop) waiting for the server, if any. */
  jobBusy: boolean;
  jobError: string | null;
  claim: Attempt<EconomyErrorCode>;
  purchase: Attempt<EconomyErrorCode>;
  refreshJobs: () => Promise<void>;
  openShop: (shop: ShopKey) => Promise<void>;
  start: (jobKey: string) => Promise<void>;
  claimPay: () => Promise<void>;
  abandon: () => Promise<void>;
  buy: (itemKey: ItemKey, quantity: number) => Promise<void>;
  clearMessages: () => void;
}

const codeOf = (e: unknown): EconomyErrorCode | 'network' =>
  e instanceof ApiError ? ((e.code as EconomyErrorCode | undefined) ?? (e.status >= 500 ? 'server' : 'invalid')) : 'network';

/**
 * Jobs and shops as the server reports them. Cash and item counts change ONLY from a server
 * response: `onCash` and `onItem` receive what the claim or purchase response carried.
 */
export function useEconomy({ mode, onCash, onItem }: { mode: PlayerMode; onCash: (cash: number) => void; onItem: (key: ItemKey, owned: number) => void }): EconomyState {
  const [status, setStatus] = useState<EconomyState['status']>(mode === 'guest' ? 'guest' : 'loading');
  const [jobs, setJobs] = useState<{ snap: JobsSnapshot | null; readAt: number }>({ snap: null, readAt: 0 });
  const [shop, setShop] = useState<ShopSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const claimRef = useRef(new MoneyAttempt<EconomyErrorCode>(newRequestId));
  const buyRef = useRef(new MoneyAttempt<EconomyErrorCode>(newRequestId));
  const [claim, setClaim] = useState<Attempt<EconomyErrorCode>>({ kind: 'idle' });
  const [purchase, setPurchase] = useState<Attempt<EconomyErrorCode>>({ kind: 'idle' });
  const sync = () => { setClaim({ ...claimRef.current.state }); setPurchase({ ...buyRef.current.state }); };
  // Answers that arrive after a newer job request was sent are stale and ignored.
  const version = useRef(0);

  const showJobs = useCallback((snap: JobsSnapshot) => {
    setJobs({ snap, readAt: Date.now() });
    if (snap.cash !== null) onCash(snap.cash);
    setStatus('ready');
  }, [onCash]);

  const refreshJobs = useCallback(async () => {
    if (mode === 'guest') return;
    const v = ++version.current;
    try {
      const snap = await fetchJobs();
      if (v === version.current) { showJobs(snap); setError(null); }
    } catch (e) {
      if (v !== version.current) return;
      setError(e instanceof Error ? e.message : 'Could not load jobs.');
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [mode, showJobs]);

  useEffect(() => { void refreshJobs(); }, [refreshJobs]);

  const openShop = useCallback(async (key: ShopKey) => {
    if (mode === 'guest') return;
    setShop((s) => (s?.shop === key ? s : null));
    try {
      const snap = await fetchShop(key);
      setShop(snap);
      if (snap.cash !== null) onCash(snap.cash);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the shop.');
    }
  }, [mode, onCash]);

  // Start and stop change no money; a failed one is simply re-read from the server.
  const jobAction = useCallback(async (send: () => Promise<JobsSnapshot>) => {
    if (mode === 'guest' || jobBusy) return;
    setJobBusy(true); setJobError(null);
    const v = ++version.current;
    try {
      const snap = await send();
      if (v === version.current) showJobs(snap);
    } catch (e) {
      setJobError(codeOf(e) === 'network' ? 'Could not reach the server. Please try again.' : e instanceof Error ? e.message : 'Could not do that.');
      void refreshJobs();
    } finally {
      setJobBusy(false);
    }
  }, [mode, jobBusy, showJobs, refreshJobs]);

  const start = useCallback((jobKey: string) => jobAction(() => postStartJob(jobKey)), [jobAction]);
  const abandon = useCallback(() => jobAction(postAbandonJob), [jobAction]);

  const claimPay = useCallback(async () => {
    if (mode === 'guest') return;
    const requestId = claimRef.current.start('claim');
    if (!requestId) return;
    sync();
    version.current += 1; // a board loading right now must not overwrite this claim's answer
    try {
      const result = await postClaimJob(requestId);
      onCash(result.cash);
      showJobs(result.jobs);
      claimRef.current.succeeded(result.replayed);
    } catch (e) {
      const code = codeOf(e);
      claimRef.current.failed(code, code === 'network' || code === 'server'
        ? 'We could not confirm your pay (network or server problem). It is safe to try again: you will not be paid twice, and nothing is lost.'
        : e instanceof Error ? e.message : 'Could not collect your pay.');
      void refreshJobs();
    }
    sync();
  }, [mode, onCash, showJobs, refreshJobs]);

  const buy = useCallback(async (itemKey: ItemKey, quantity: number) => {
    if (mode === 'guest') return;
    const requestId = buyRef.current.start(`buy:${itemKey}:${quantity}`);
    if (!requestId) return;
    sync();
    try {
      const result = await postBuyItem(itemKey, quantity, requestId);
      onCash(result.cash);
      onItem(result.itemKey, result.owned);
      buyRef.current.succeeded(result.replayed);
    } catch (e) {
      const code = codeOf(e);
      buyRef.current.failed(code, code === 'network' || code === 'server'
        ? 'We could not confirm the purchase (network or server problem). It is safe to try again: you will not be charged twice.'
        : e instanceof Error ? e.message : 'Could not complete the purchase.');
    }
    sync();
  }, [mode, onCash, onItem]);

  const clearMessages = useCallback(() => {
    claimRef.current.reset(); buyRef.current.reset(); setJobError(null);
    setClaim({ ...claimRef.current.state }); setPurchase({ ...buyRef.current.state });
  }, []);

  return { status, jobs: jobs.snap, jobsReadAt: jobs.readAt, shop, error, jobBusy, jobError, claim, purchase, refreshJobs, openShop, start, claimPay, abandon, buy, clearMessages };
}
