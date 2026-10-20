'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InteractionTarget } from '@/types/game';
import type { LocationId } from '@/types/player';
import { createGameBus } from '@/game/events';
import { useMultiplayer } from '@/features/multiplayer/useMultiplayer';
import { RequirePlayer, type PlayerSession } from '@/components/player/RequirePlayer';
import { Hud } from './Hud';
import { InteractionDialog, InteractionPrompt } from './InteractionUi';
import { InventoryPanel } from './InventoryPanel';
import { TouchControls } from './TouchControls';
import { ChatPanel } from './ChatPanel';
import { EmoteBar } from './EmoteBar';
import { EMOTE_IDS } from '@/features/multiplayer/chat';

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
  // The multiplayer room is the location the running scene reports; a new scene gets a new connection.
  const [scene, setScene] = useState<{ room: LocationId | null; generation: number }>({ room: null, generation: 0 });
  const multiplayer = useMultiplayer({ bus, playerId: player.id, selfName: player.characterName, mode, room: scene.room, generation: scene.generation });
  const [chatOpen, setChatOpen] = useState(false);
  // Unread = other players' lines after the last one seen (works when old lines drop out of the bounded history).
  const [lastReadId, setLastReadId] = useState<string | null>(null);
  const unread = useMemo(() => {
    if (chatOpen) return 0;
    const lines = multiplayer.chat;
    const from = lastReadId ? lines.findIndex((m) => m.id === lastReadId) + 1 : 0;
    return lines.slice(from).filter((m) => !m.self).length;
  }, [chatOpen, lastReadId, multiplayer.chat]);
  const [nearbyPlayer, setNearbyPlayer] = useState<{ id: string; name: string } | null>(null);
  const typingRef = useRef(false);
  const setTyping = useCallback((typing: boolean) => { typingRef.current = typing; bus.ui.emit('input:typing', typing); }, [bus]);
  const { sendEmote } = multiplayer;
  // Keep the same avatar object unless its values change, so a player reload
  // with identical data doesn't restart the Phaser world.
  const { body, skin, headwear, outfit } = player.avatar;
  const avatar = useMemo(() => ({ body, skin, headwear, outfit }), [body, skin, headwear, outfit]);

  useEffect(() => {
    const offs = [
      bus.world.on('interaction:available', setNearby),
      bus.world.on('interaction:triggered', setDialog),
      bus.world.on('proximity', setNearbyPlayer),
      bus.world.on('ready', ({ locationId: here }) => {
        setLocationId(here);
        setScene((s) => ({ room: here, generation: s.generation + 1 }));
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [bus]);

  // Pause the world while a panel is open.
  useEffect(() => { bus.ui.emit('world:pause', !!dialog || bagOpen); }, [bus, dialog, bagOpen]);

  // "I" toggles the inventory; Escape closes panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDialog(null); setBagOpen(false); }
      if (typingRef.current || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // typing in chat
      if ((e.key === 'i' || e.key === 'I') && !dialog) setBagOpen((o) => !o);
      // 1–4: emotes, only while another player is within reach.
      const emote = EMOTE_IDS[Number(e.key) - 1];
      if (emote && nearbyPlayer && !dialog && !bagOpen) sendEmote(emote);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, bagOpen, nearbyPlayer, sendEmote]);

  // Mark everything read whenever the panel is open.
  useEffect(() => {
    if (chatOpen) setLastReadId(multiplayer.chat.at(-1)?.id ?? null);
  }, [chatOpen, multiplayer.chat]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-adire-900">
      <GameCanvas avatar={avatar} characterName={player.characterName} bus={bus} />
      <Hud player={player} mode={mode} locationId={locationId} multiplayer={multiplayer} onInventory={() => setBagOpen(true)}
        onChat={() => setChatOpen((o) => !o)} chatUnread={unread} />
      {chatOpen && <ChatPanel entries={multiplayer.chat} status={multiplayer.status} onSend={multiplayer.sendChat} onTyping={setTyping} onClose={() => setChatOpen(false)} />}
      {nearbyPlayer && multiplayer.status === 'online' && !dialog && !bagOpen && <EmoteBar name={nearbyPlayer.name} onEmote={(emote) => { sendEmote(emote); }} />}
      {nearby && !dialog && !bagOpen && <InteractionPrompt target={nearby} onInteract={() => bus.ui.emit('input:interact')} />}
      <TouchControls bus={bus} />
      <p className="pointer-events-none absolute bottom-3 right-4 hidden text-xs text-cream/60 [@media(pointer:fine)]:block">Move: WASD / arrows · Interact: E · Bag: I</p>
      {dialog && <InteractionDialog target={dialog} onClose={() => setDialog(null)} onEnterApartment={() => router.push('/apartment')} />}
      {bagOpen && <InventoryPanel inventory={inventory} onClose={() => setBagOpen(false)} />}
    </div>
  );
}
