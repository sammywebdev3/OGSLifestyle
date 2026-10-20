'use client';

import { useState } from 'react';
import type { LandPlot, MyPlot } from '@/types/land';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import type { AttemptState } from '@/features/land/purchase';
import { KUTO_PLOTS, LAND_TIERS, plotLabel } from '@/features/land/plots';
import { formatNaira } from '@/components/player/CashBadge';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

const TIER_BADGE: Record<LandPlot['tier'], string> = {
  basic: 'bg-laterite-300/60 text-laterite-700',
  standard: 'bg-adire-300/40 text-adire-900',
  premium: 'bg-palm-300 text-ink',
};

/**
 * One plot: where it is, its price and owner, and the Buy button. Shows only what
 * the server reported. Ownership and the new balance appear after the server
 * confirms; until then the dialog says "Buying…" and nothing else changes.
 */
export function LandDialog({ plot, mine, cash, mode, attempt, onBuy, onClose }: {
  plot: LandPlot; mine: MyPlot | undefined; cash: number; mode: PlayerMode; attempt: AttemptState;
  onBuy: () => void; onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const note = KUTO_PLOTS.find((p) => p.key === plot.key)?.note;
  const here = attempt.kind !== 'idle' && attempt.plotKey === plot.key ? attempt : null;
  const pending = here?.kind === 'pending';
  const short = plot.price - cash;
  const canBuy = mode === 'online' && plot.status === 'for-sale' && short <= 0 && !pending;

  return (
    <div className="absolute inset-0 z-30 grid place-items-end bg-black/30 p-4 sm:place-items-center" onClick={pending ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="land-title" className="w-full max-w-md rounded-3xl bg-cream p-5 text-ink shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="land-title" className="font-display text-xl font-black">🪧 {plotLabel(plot.key)}, Kuto Street</h2>
            {note && <p className="mt-0.5 text-sm text-ink/70">{note}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${TIER_BADGE[plot.tier]}`}>{LAND_TIERS[plot.tier].label}</span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink/60">Size</dt><dd className="font-semibold">{plot.w} × {plot.d} tiles</dd>
          <dt className="text-ink/60">Price</dt><dd className="font-display font-black">{formatNaira(plot.price)}</dd>
          <dt className="text-ink/60">Owner</dt>
          <dd className="font-semibold">
            {plot.status === 'mine' ? 'You' : plot.status === 'owned' ? plot.ownerName : plot.status === 'for-sale' ? 'For sale (owned by the game)' : 'Sign in to see'}
          </dd>
          {mine && <><dt className="text-ink/60">You paid</dt><dd className="font-semibold">{formatNaira(mine.pricePaid)} on {new Date(mine.acquiredAt).toLocaleDateString('en-NG')}</dd></>}
          {mode === 'online' && <><dt className="text-ink/60">Your cash</dt><dd className="font-semibold">{formatNaira(cash)}</dd></>}
        </dl>

        <div className="mt-4 space-y-2" aria-live="polite">
          {mode === 'guest' && <Notice tone="info">Sign in with a character to see who owns this plot and to buy land.</Notice>}
          {here?.kind === 'done' && plot.status === 'mine' && (
            <Notice tone="success">{here.replayed ? 'This purchase had already gone through. You were charged once.' : `You now own ${plotLabel(plot.key)}. Your new balance is ${formatNaira(cash)}.`}</Notice>
          )}
          {here?.kind === 'unknown' && plot.status === 'mine' && (
            <Notice tone="success">Your purchase went through: you own {plotLabel(plot.key)}. You were charged once; your balance is {formatNaira(cash)}.</Notice>
          )}
          {here?.kind === 'failed' && (
            <Notice tone="error">
              {here.code === 'sold' ? 'Someone else bought this plot first. You were not charged.'
                : here.code === 'insufficient-funds' ? 'Not enough cash for this plot. You were not charged.'
                : here.message}
            </Notice>
          )}
          {here?.kind === 'unknown' && plot.status !== 'mine' && <Notice tone="warn">{here.message}</Notice>}
          {mode === 'online' && plot.status === 'for-sale' && short > 0 && here?.kind !== 'failed' && (
            <Notice tone="warn">You need {formatNaira(short)} more to buy this plot.</Notice>
          )}
          {plot.status === 'owned' && here?.kind !== 'failed' && <Notice tone="info">This plot belongs to {plot.ownerName}. Trading between players comes later.</Notice>}
        </div>

        <div className="mt-5 flex gap-2">
          {plot.status === 'for-sale' && mode === 'online' && (
            confirming || pending || here?.kind === 'unknown' ? (
              <Button onClick={onBuy} disabled={!canBuy} className="flex-1">
                {pending ? 'Buying…' : here?.kind === 'unknown' ? 'Try again' : `Confirm: pay ${formatNaira(plot.price)}`}
              </Button>
            ) : (
              <Button onClick={() => setConfirming(true)} disabled={!canBuy} className="flex-1">Buy for {formatNaira(plot.price)}</Button>
            )
          )}
          <Button variant="secondary" onClick={onClose} disabled={pending} className="flex-1" autoFocus>{confirming && plot.status === 'for-sale' && !pending ? 'Cancel' : 'Close'}</Button>
        </div>
      </div>
    </div>
  );
}
