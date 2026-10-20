'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InteractionTarget, PlotView } from '@/types/game';
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
import { usePlayer } from '@/features/player/PlayerProvider';
import { useLand } from '@/features/land/useLand';
import { PLOT_TARGET_PREFIX, plotLabel } from '@/features/land/plots';
import { LandDialog } from './LandDialog';
import { LandPanel } from './LandPanel';

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
  // Land: what the server reports. The balance shown changes only from a server response.
  const { applyServerCash } = usePlayer();
  const land = useLand({ mode, onCash: applyServerCash });
  const [landKey, setLandKey] = useState<string | null>(null);
  const [landOpen, setLandOpen] = useState(false);
  const landPlot = landKey ? land.plots.find((p) => p.key === landKey) ?? null : null;
  const plotViews = useMemo<PlotView[]>(() => land.plots.map((p) => ({ key: p.key, x: p.x, y: p.y, w: p.w, d: p.d, status: p.status, label: plotLabel(p.key) })), [land.plots]);
  const plotViewsRef = useRef(plotViews);
  plotViewsRef.current = plotViews;
  const { clearAttempt } = land;
  const closeLand = useCallback(() => { setLandKey(null); clearAttempt(); }, [clearAttempt]);
  // Keep the same avatar object unless its values change, so a player reload
  // with identical data doesn't restart the Phaser world.
  const { body, skin, headwear, outfit } = player.avatar;
  const avatar = useMemo(() => ({ body, skin, headwear, outfit }), [body, skin, headwear, outfit]);

  useEffect(() => {
    const offs = [
      bus.world.on('interaction:available', setNearby),
      bus.world.on('interaction:triggered', (target) => {
        if (target.id.startsWith(PLOT_TARGET_PREFIX)) setLandKey(target.id.slice(PLOT_TARGET_PREFIX.length));
        else setDialog(target);
      }),
      bus.world.on('proximity', setNearbyPlayer),
      bus.world.on('ready', ({ locationId: here }) => {
        setLocationId(here);
        setScene((s) => ({ room: here, generation: s.generation + 1 }));
        bus.ui.emit('land:plots', plotViewsRef.current); // a new scene needs the plots too
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [bus]);

  // Draw the plots whenever the server's land view changes.
  useEffect(() => { bus.ui.emit('land:plots', plotViews); }, [bus, plotViews]);

  // Pause the world while a panel is open.
  const panelOpen = !!dialog || bagOpen || landOpen || !!landKey;
  useEffect(() => { bus.ui.emit('world:pause', panelOpen); }, [bus, panelOpen]);

  // "I" toggles the inventory; Escape closes panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDialog(null); setBagOpen(false);
        // A land dialog waiting for the server stays open until the answer arrives.
        if (land.attempt.kind !== 'pending') { closeLand(); setLandOpen(false); }
      }
      if (typingRef.current || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return; // typing in chat
      if ((e.key === 'i' || e.key === 'I') && !dialog && !landKey) setBagOpen((o) => !o);
      if ((e.key === 'l' || e.key === 'L') && !dialog && !landKey && !bagOpen) setLandOpen((o) => !o);
      // 1–4: emotes, only while another player is within reach.
      const emote = EMOTE_IDS[Number(e.key) - 1];
      if (emote && nearbyPlayer && !panelOpen) sendEmote(emote);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, bagOpen, landKey, panelOpen, nearbyPlayer, sendEmote, land.attempt.kind, closeLand]);

  // Mark everything read whenever the panel is open.
  useEffect(() => {
    if (chatOpen) setLastReadId(multiplayer.chat.at(-1)?.id ?? null);
  }, [chatOpen, multiplayer.chat]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-adire-900">
      <GameCanvas avatar={avatar} characterName={player.characterName} bus={bus} />
      <Hud player={player} mode={mode} locationId={locationId} multiplayer={multiplayer} onInventory={() => setBagOpen(true)}
        onChat={() => setChatOpen((o) => !o)} chatUnread={unread} onLand={() => setLandOpen(true)} />
      {chatOpen && <ChatPanel entries={multiplayer.chat} status={multiplayer.status} onSend={multiplayer.sendChat} onTyping={setTyping} onClose={() => setChatOpen(false)} />}
      {nearbyPlayer && multiplayer.status === 'online' && !panelOpen && <EmoteBar name={nearbyPlayer.name} onEmote={(emote) => { sendEmote(emote); }} />}
      {nearby && !panelOpen && <InteractionPrompt target={nearby} onInteract={() => bus.ui.emit('input:interact')} />}
      <TouchControls bus={bus} />
      <p className="pointer-events-none absolute bottom-3 right-4 hidden text-xs text-cream/60 [@media(pointer:fine)]:block">Move: WASD / arrows · Interact: E · Bag: I · Land: L</p>
      {dialog && <InteractionDialog target={dialog} onClose={() => setDialog(null)} onEnterApartment={() => router.push('/apartment')} />}
      {bagOpen && <InventoryPanel inventory={inventory} onClose={() => setBagOpen(false)} />}
      {landOpen && <LandPanel land={land} onOpen={(key) => { setLandOpen(false); setLandKey(key); }} onClose={() => setLandOpen(false)} />}
      {landPlot && (
        <LandDialog plot={landPlot} mine={land.mine.find((m) => m.key === landPlot.key)} cash={player.cash} mode={mode} attempt={land.attempt}
          onBuy={() => void land.buy(landPlot.key)} onClose={closeLand} />
      )}
    </div>
  );
}
