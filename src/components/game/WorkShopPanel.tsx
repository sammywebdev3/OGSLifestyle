'use client';

import { useEffect, useState } from 'react';
import type { ShopKey } from '@/types/economy';
import type { EconomyState } from '@/features/economy/useEconomy';
import { secondsLeft } from '@/features/economy/attempt';
import { ITEMS } from '@/config/game';
import { formatNaira } from '@/components/player/CashBadge';
import { Spinner } from '@/components/ui/Spinner';
import { Notice } from '@/components/ui/Notice';

type Tab = 'jobs' | ShopKey;
const TABS: { key: Tab; label: string }[] = [
  { key: 'jobs', label: '💼 Jobs' },
  { key: 'buka', label: '🍲 Iya Basira Buka' },
  { key: 'mama-t-stores', label: '🛒 Mama T Stores' },
];

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const btn = 'rounded-full px-3 py-1.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50';

/** Work shifts for pay and buy from the two Kuto shops. Every amount shown is the server's. */
export function WorkShopPanel({ economy, cash, onClose }: { economy: EconomyState; cash: number; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('jobs');
  const { openShop, refreshJobs } = economy;
  // Re-read from the server whenever a tab is shown: the board and prices are the server's, not a cached copy.
  useEffect(() => { if (tab === 'jobs') void refreshJobs(); else void openShop(tab); }, [tab, openShop, refreshJobs]);
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Work and shops" className="h-full w-full max-w-sm overflow-y-auto bg-cream p-5 text-ink shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span>
            <h2 className="font-display text-xl font-black">Work &amp; shops</h2>
            {/* The HUD is hidden behind this panel on phones, so the server's balance is repeated here. */}
            <span className="text-sm" aria-live="polite">Cash: <span className="font-display font-black">{formatNaira(cash)}</span></span>
          </span>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-bold ring-1 ring-ink/15 hover:bg-ink/5" autoFocus>Close</button>
        </div>
        <div role="tablist" className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { economy.clearMessages(); setTab(t.key); }}
              className={`${btn} ${tab === t.key ? 'bg-adire-700 text-white' : 'bg-white/80 ring-1 ring-ink/10 hover:bg-white'}`}>{t.label}</button>
          ))}
        </div>
        {economy.status === 'guest' && <Notice tone="info">Guest preview: sign in with a character to work for pay and shop.</Notice>}
        {economy.status === 'loading' && <Spinner label="Loading…" />}
        {economy.status === 'error' && (
          <div className="space-y-2">
            <Notice tone="error">{economy.error ?? 'Could not load jobs.'}</Notice>
            <button type="button" onClick={() => void economy.refreshJobs()} className={`${btn} ring-1 ring-ink/15 hover:bg-ink/5`}>Try again</button>
          </div>
        )}
        {economy.status === 'ready' && (tab === 'jobs' ? <JobsTab economy={economy} /> : <ShopTab economy={economy} shop={tab} cash={cash} />)}
      </aside>
    </div>
  );
}

function JobsTab({ economy }: { economy: EconomyState }) {
  const { jobs, jobsReadAt, claim } = economy;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!jobs) return null;
  const active = jobs.active;
  const left = active ? secondsLeft(active.endsAt, jobs.serverNow, jobsReadAt, now) : 0;
  const activeJob = active ? jobs.jobs.find((j) => j.key === active.jobKey) : undefined;
  const claiming = claim.kind === 'pending';
  const atLimit = jobs.shiftsToday >= jobs.dailyLimit;
  return (
    <div className="space-y-3">
      {active ? (
        <section className="rounded-2xl bg-ogun-50 p-3 ring-1 ring-ogun-600/20" aria-live="polite">
          <h3 className="font-bold">{activeJob?.title ?? 'Your shift'}</h3>
          <p className="text-sm">Pay: <span className="font-display font-black">{formatNaira(active.pay)}</span></p>
          {left > 0 ? <p className="text-sm text-ink/70">Working… {minutes(left)} left</p> : <p className="text-sm font-bold text-ogun-700">Shift finished. Collect your pay.</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={left > 0 || claiming} onClick={() => void economy.claimPay()} className={`${btn} bg-ogun-500 text-white hover:bg-ogun-600`}>
              {claiming ? 'Collecting…' : claim.kind === 'unknown' ? 'Try again' : 'Collect pay'}
            </button>
            <button type="button" disabled={economy.jobBusy || claiming} onClick={() => void economy.abandon()} className={`${btn} ring-1 ring-ink/15 hover:bg-ink/5`}>Stop (no pay)</button>
          </div>
        </section>
      ) : (
        <ul className="space-y-2">
          {jobs.jobs.map((j) => (
            <li key={j.key} className="rounded-2xl bg-white/80 p-3 ring-1 ring-ink/10">
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="block font-bold">{j.title}</span>
                  <span className="block text-sm text-ink/70">{j.description}</span>
                  <span className="block text-sm"><span className="font-display font-black">{formatNaira(j.pay)}</span> · {minutes(j.durationSeconds)} min</span>
                </span>
                <button type="button" disabled={economy.jobBusy || atLimit} onClick={() => void economy.start(j.key)} className={`${btn} shrink-0 bg-adire-700 text-white hover:bg-adire-900`}>Start</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {claim.kind === 'done' && <Notice tone="success">{claim.replayed ? 'Already paid. Nothing was paid twice.' : 'Paid. Your new balance is shown at the top.'}</Notice>}
      {(claim.kind === 'failed' || claim.kind === 'unknown') && <Notice tone={claim.kind === 'unknown' ? 'warn' : 'error'}>{claim.message}</Notice>}
      {economy.jobError && <Notice tone="error">{economy.jobError}</Notice>}
      <p className="text-xs text-ink/50">Shifts today: {jobs.shiftsToday} of {jobs.dailyLimit}. Pay and shift times are set by the game; you are paid once per finished shift.</p>
    </div>
  );
}

function ShopTab({ economy, shop, cash }: { economy: EconomyState; shop: ShopKey; cash: number }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const { purchase } = economy;
  const snap = economy.shop?.shop === shop ? economy.shop : null;
  if (!snap) return economy.error ? <Notice tone="error">{economy.error}</Notice> : <Spinner label="Loading shop…" />;
  const busy = purchase.kind === 'pending';
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {snap.items.map((item) => {
          const q = Math.min(qty[item.key] ?? 1, item.maxPerPurchase);
          const total = item.price * q;
          const def = ITEMS[item.key];
          const retry = purchase.kind === 'unknown' && purchase.action === `buy:${item.key}:${q}`;
          return (
            <li key={item.key} className="rounded-2xl bg-white/80 p-3 ring-1 ring-ink/10">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="block font-bold">{def.icon} {item.name}</span>
                  <span className="block text-sm font-display font-black">{formatNaira(item.price)} <span className="font-sans text-xs font-normal text-ink/60">each</span></span>
                </span>
                <span className="flex items-center gap-1.5">
                  <label className="sr-only" htmlFor={`qty-${item.key}`}>How many {item.name}</label>
                  <select id={`qty-${item.key}`} value={q} disabled={busy} onChange={(e) => setQty((s) => ({ ...s, [item.key]: Number(e.target.value) }))}
                    className="rounded-full bg-white px-2 py-1 text-sm ring-1 ring-ink/15">
                    {Array.from({ length: item.maxPerPurchase }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="button" disabled={busy || (total > cash && !retry)} onClick={() => void economy.buy(item.key, q)} className={`${btn} whitespace-nowrap bg-ogun-500 text-white hover:bg-ogun-600`}
                    title={total > cash ? 'Not enough cash' : undefined}>
                    {busy && purchase.action === `buy:${item.key}:${q}` ? 'Buying…' : retry ? 'Try again' : `Buy ${formatNaira(total)}`}
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {purchase.kind === 'done' && <Notice tone="success">{purchase.replayed ? 'Already bought. You were not charged twice.' : 'Bought. It is in your bag.'}</Notice>}
      {(purchase.kind === 'failed' || purchase.kind === 'unknown') && <Notice tone={purchase.kind === 'unknown' ? 'warn' : 'error'}>{purchase.message}</Notice>}
      <p className="text-xs text-ink/50">Prices are set by the game. Your bag holds up to 999 of each item.</p>
    </div>
  );
}
