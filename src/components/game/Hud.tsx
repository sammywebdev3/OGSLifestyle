'use client';

import Link from 'next/link';
import type { LocationId, Player } from '@/types/player';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import { LOCATIONS, SKIN_TONES, OUTFIT_COLORS } from '@/config/game';
import { CashBadge } from '@/components/player/CashBadge';

/** Top HUD: who you are, your cash, where you are, and quick buttons. */
export function Hud({ player, mode, locationId, onInventory }: { player: Player; mode: PlayerMode; locationId: LocationId; onInventory: () => void }) {
  const loc = LOCATIONS[locationId];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-adire-900/80 py-1 pl-1 pr-3 text-cream shadow-card backdrop-blur">
        <span className="grid h-10 w-10 place-items-center rounded-full ring-2 ring-palm-500" style={{ background: OUTFIT_COLORS[player.avatar.outfit].hex }}>
          <span className="h-5 w-5 rounded-full" style={{ background: SKIN_TONES[player.avatar.skin].hex }} />
        </span>
        <span className="leading-tight">
          <span className="block max-w-[9rem] truncate font-display text-sm font-black">{player.characterName}</span>
          <span className="block text-[11px] text-palm-300">📍 {loc.name}, {loc.area.split(',')[0]}</span>
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <CashBadge cash={player.cash} mode={mode} className="shadow-card" />
        <button type="button" onClick={onInventory} className="grid h-10 w-10 place-items-center rounded-full bg-adire-900/80 text-lg shadow-card backdrop-blur hover:bg-adire-700" aria-label="Open inventory" title="Inventory (I)">🎒</button>
        <Link href="/apartment" className="grid h-10 w-10 place-items-center rounded-full bg-adire-900/80 text-lg shadow-card backdrop-blur hover:bg-adire-700" aria-label="Back to your apartment" title="Your apartment">🏠</Link>
      </div>
    </div>
  );
}
