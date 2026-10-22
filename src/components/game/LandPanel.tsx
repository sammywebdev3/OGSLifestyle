'use client';

import type { LandPlot, MyPlot } from '@/types/land';
import type { LandState } from '@/features/land/useLand';
import { LAND_TIERS, plotLabel } from '@/features/land/plots';
import { formatNaira } from '@/components/player/CashBadge';
import { Spinner } from '@/components/ui/Spinner';
import { Notice } from '@/components/ui/Notice';

const STATUS: Record<LandPlot['status'], { text: (p: LandPlot) => string; className: string }> = {
  'for-sale': { text: () => 'For sale', className: 'bg-palm-300 text-ink' },
  mine: { text: () => 'Yours', className: 'bg-ogun-500 text-white' },
  owned: { text: (p) => `Owned by ${p.ownerName ?? 'a player'}`, className: 'bg-adire-500 text-white' },
  unknown: { text: () => 'Sign in to see', className: 'bg-ink/10 text-ink/70' },
};

/** All Kuto Street plots and the ones you own. Opening a plot shows its dialog. */
export function LandPanel({ land, onOpen, onClose }: { land: LandState; onOpen: (key: string) => void; onClose: () => void }) {
  const mine: MyPlot[] = land.mine;
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Land" className="h-full w-full max-w-sm overflow-y-auto bg-cream p-5 text-ink shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-black">🗺️ Kuto Street land</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-bold ring-1 ring-ink/15 hover:bg-ink/5" autoFocus>Close</button>
        </div>
        {land.status === 'loading' && <Spinner label="Loading land…" />}
        {land.status === 'error' && (
          <div className="space-y-2">
            <Notice tone="error">{land.error ?? 'Could not load land.'}</Notice>
            <button type="button" onClick={() => void land.refresh()} className="rounded-full px-3 py-1 text-sm font-bold ring-1 ring-ink/15 hover:bg-ink/5">Try again</button>
          </div>
        )}
        {land.status === 'guest' && <div className="mb-3"><Notice tone="info">Guest preview: sign in with a character to see owners and buy land.</Notice></div>}
        {land.status !== 'loading' && land.status !== 'error' && (
          <>
            {land.status === 'ready' && (
              <section className="mb-4 rounded-2xl bg-ogun-50 p-3 text-sm ring-1 ring-ogun-600/20">
                <h3 className="font-bold">Your land</h3>
                {mine.length === 0 ? <p className="text-ink/70">You do not own any land yet.</p> : (
                  <ul className="mt-1 space-y-0.5">
                    {mine.map((m) => <li key={m.key}>{plotLabel(m.key)} · {LAND_TIERS[m.tier].label} · paid {formatNaira(m.pricePaid)}</li>)}
                  </ul>
                )}
              </section>
            )}
            <ul className="space-y-2">
              {land.plots.map((p) => (
                <li key={p.key}>
                  <button type="button" onClick={() => onOpen(p.key)} className="flex w-full items-center justify-between gap-2 rounded-2xl bg-white/80 px-3 py-2 text-left ring-1 ring-ink/10 hover:bg-white">
                    <span>
                      <span className="block font-bold">{plotLabel(p.key)} <span className="font-normal text-ink/60">· {LAND_TIERS[p.tier].label}</span></span>
                      <span className="block text-sm font-display font-black">{formatNaira(p.price)}</span>
                    </span>
                    <span className={`max-w-[10rem] truncate rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[p.status].className}`}>{STATUS[p.status].text(p)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink/50">Prices are set by the game. Each plot has one owner. Trading between players, building and new plot releases come in later phases.</p>
          </>
        )}
      </aside>
    </div>
  );
}
