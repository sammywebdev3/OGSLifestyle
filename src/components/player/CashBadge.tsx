import type { PlayerMode } from '@/features/player/PlayerProvider';

export const formatNaira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

/** Cash display. Guest balances are labelled as a local preview, not an authoritative balance. */
export function CashBadge({ cash, mode, className = '' }: { cash: number; mode: PlayerMode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-ogun-500 px-3 py-1.5 font-display font-black text-white ${className}`}>
      {formatNaira(cash)}
      {mode === 'guest' && <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold uppercase tracking-wide" title="Guest mode: stored only in this browser">preview</span>}
    </span>
  );
}
