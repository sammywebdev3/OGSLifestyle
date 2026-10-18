'use client';

import { RequirePlayer } from '@/components/player/RequirePlayer';
import { CashBadge } from '@/components/player/CashBadge';
import { AvatarPreview } from '@/components/character/AvatarPreview';
import { InventoryList } from '@/components/game/InventoryList';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { LOCATIONS } from '@/config/game';
import { usePlayer } from '@/features/player/PlayerProvider';
import { ApartmentRoom } from './ApartmentRoom';

/** Game-entry screen: your self-contain in Kuto, before stepping out into the street. */
export function ApartmentScreen() {
  const { signOut } = usePlayer();
  return (
    <RequirePlayer>
      {({ player, inventory, mode }) => (
        <div className="grid gap-5 md:grid-cols-[1fr_320px]">
          <Card className="bg-gradient-to-b from-adire-300/40 to-cream p-3 sm:p-5">
            <p className="px-2 text-xs font-bold uppercase tracking-widest text-adire-700">{LOCATIONS['kuto-starter-apartment'].area}</p>
            <h1 className="px-2 font-display text-2xl font-black sm:text-3xl">Your starter apartment</h1>
            <ApartmentRoom avatar={player.avatar} />
            <p className="px-2 text-sm text-ink/70">One room self-contain: a bed, a standing fan, a small TV and a gas cooker. Small, but it&apos;s yours. Rent and upgrades arrive in a later phase.</p>
          </Card>
          <div className="space-y-4">
            <Card className="text-center">
              <div className="flex justify-center"><AvatarPreview avatar={player.avatar} size={110} /></div>
              <h2 className="font-display text-xl font-black">{player.characterName}</h2>
              <div className="mt-2"><CashBadge cash={player.cash} mode={mode} /></div>
              <p className="mt-2 text-xs text-ink/60">Moved in {new Date(player.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <ButtonLink href="/play" variant="gold" className="mt-4 w-full">🚪 Step outside</ButtonLink>
            </Card>
            <Card>
              <h2 className="mb-2 font-display text-lg font-black">🎒 Inventory</h2>
              <InventoryList inventory={inventory} />
            </Card>
            {mode === 'guest' && <Notice tone="warn">Guest mode — saved only in this browser.</Notice>}
            <Button variant="ghost" className="w-full text-cream/80" onClick={() => { if (mode !== 'guest' || window.confirm('Delete this guest character? This cannot be undone.')) void signOut(); }}>{mode === 'guest' ? 'Delete guest & start over' : 'Sign out'}</Button>
          </div>
        </div>
      )}
    </RequirePlayer>
  );
}
