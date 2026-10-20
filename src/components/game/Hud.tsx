'use client';

import Link from 'next/link';
import type { LocationId, Player } from '@/types/player';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import type { MultiplayerState } from '@/features/multiplayer/useMultiplayer';
import { LOCATIONS, SKIN_TONES, OUTFIT_COLORS } from '@/config/game';
import { CashBadge } from '@/components/player/CashBadge';

/** Top HUD: who you are, your cash, where you are, and quick buttons. */
export function Hud({ player, mode, locationId, multiplayer, onInventory, onChat, chatUnread }: {
  player: Player; mode: PlayerMode; locationId: LocationId; multiplayer: MultiplayerState; onInventory: () => void;
  onChat: () => void; chatUnread: number;
}) {
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
          <MultiplayerLine state={multiplayer} mode={mode} />
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-2">
        <CashBadge cash={player.cash} mode={mode} className="shadow-card" />
        <button type="button" onClick={onChat} className="relative grid h-10 w-10 place-items-center rounded-full bg-adire-900/80 text-lg shadow-card backdrop-blur hover:bg-adire-700" aria-label={chatUnread > 0 ? `Open chat (${chatUnread} new)` : 'Open chat'} title="Chat">
          💬
          {chatUnread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-laterite-500 px-1 text-[10px] font-black text-white">{chatUnread > 9 ? '9+' : chatUnread}</span>}
        </button>
        <button type="button" onClick={onInventory} className="grid h-10 w-10 place-items-center rounded-full bg-adire-900/80 text-lg shadow-card backdrop-blur hover:bg-adire-700" aria-label="Open inventory" title="Inventory (I)">🎒</button>
        <Link href="/apartment" className="grid h-10 w-10 place-items-center rounded-full bg-adire-900/80 text-lg shadow-card backdrop-blur hover:bg-adire-700" aria-label="Back to your apartment" title="Your apartment">🏠</Link>
      </div>
    </div>
  );
}

const MP_LABELS: Record<MultiplayerState['status'], { dot: string; text: string }> = {
  off: { dot: 'bg-cream/40', text: 'Solo' },
  connecting: { dot: 'bg-palm-500 animate-pulse', text: 'Connecting…' },
  online: { dot: 'bg-ogun-400', text: 'Online' },
  reconnecting: { dot: 'bg-palm-500 animate-pulse', text: 'Reconnecting…' },
  unavailable: { dot: 'bg-laterite-500', text: 'Multiplayer offline' },
};

/** Connection state for multiplayer. Guests always play solo. */
function MultiplayerLine({ state, mode }: { state: MultiplayerState; mode: PlayerMode }) {
  const label = MP_LABELS[state.status];
  const text = state.status === 'online' ? `Online · ${state.nearby} nearby` : state.status === 'off' && mode === 'guest' ? 'Solo · guest' : label.text;
  return (
    <span className="flex items-center gap-1 text-[11px] text-cream/80" role="status" aria-live="polite">
      <span className={`inline-block h-2 w-2 rounded-full ${label.dot}`} aria-hidden />
      {text}
    </span>
  );
}
