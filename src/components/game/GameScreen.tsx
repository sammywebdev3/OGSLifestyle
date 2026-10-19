'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { InteractionTarget } from '@/types/game';
import type { LocationId } from '@/types/player';
import { createGameBus } from '@/game/events';
import { RequirePlayer, type PlayerSession } from '@/components/player/RequirePlayer';
import { Hud } from './Hud';
import { InteractionDialog, InteractionPrompt } from './InteractionUi';
import { InventoryPanel } from './InventoryPanel';
import { TouchControls } from './TouchControls';

// Client-only: never server-render the Phaser host.
const GameCanvas = dynamic(() => import('./GameCanvas'), { ssr: false });

export function GameScreen() {
  return (
    <RequirePlayer>
      {({ player, inventory, mode }) => <World player={player} inventory={inventory} mode={mode} />}
    </RequirePlayer>
  );
}

function World({ player, inventory, mode }: PlayerSession) {
  const router = useRouter();
  const bus = useMemo(() => createGameBus(), []);
  const [nearby, setNearby] = useState<InteractionTarget | null>(null);
  const [dialog, setDialog] = useState<InteractionTarget | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  // Where the player is right now: reported by the running scene, else their saved location.
  const [locationId, setLocationId] = useState<LocationId>(player.location);
  // Keep the same avatar object unless its values change, so a player reload
  // with identical data doesn't restart the Phaser world.
  const { body, skin, headwear, outfit } = player.avatar;
  const avatar = useMemo(() => ({ body, skin, headwear, outfit }), [body, skin, headwear, outfit]);

  useEffect(() => {
    const offs = [
      bus.world.on('interaction:available', setNearby),
      bus.world.on('interaction:triggered', setDialog),
      bus.world.on('ready', ({ locationId: here }) => setLocationId(here)),
    ];
    return () => offs.forEach((off) => off());
  }, [bus]);

  // Pause the world while a panel is open.
  useEffect(() => { bus.ui.emit('world:pause', !!dialog || bagOpen); }, [bus, dialog, bagOpen]);

  // "I" toggles the inventory; Escape closes panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDialog(null); setBagOpen(false); }
      if ((e.key === 'i' || e.key === 'I') && !dialog) setBagOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-adire-900">
      <GameCanvas avatar={avatar} characterName={player.characterName} bus={bus} />
      <Hud player={player} mode={mode} locationId={locationId} onInventory={() => setBagOpen(true)} />
      {nearby && !dialog && !bagOpen && <InteractionPrompt target={nearby} onInteract={() => bus.ui.emit('input:interact')} />}
      <TouchControls bus={bus} />
      <p className="pointer-events-none absolute bottom-3 right-4 hidden text-xs text-cream/60 [@media(pointer:fine)]:block">Move: WASD / arrows · Interact: E · Bag: I</p>
      {dialog && <InteractionDialog target={dialog} onClose={() => setDialog(null)} onEnterApartment={() => router.push('/apartment')} />}
      {bagOpen && <InventoryPanel inventory={inventory} onClose={() => setBagOpen(false)} />}
    </div>
  );
}
