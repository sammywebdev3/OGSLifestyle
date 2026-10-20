'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameBus } from '@/game/events';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { MAP_H, MAP_W } from '@/game/world/starterArea';
import { MultiplayerClient, type MultiplayerStatus, type SendResult } from './client';
import { ChatLog, type ChatEntry, type EmoteId } from './chat';

/** "off" = guest or online accounts not configured: the world is single-player. */
export interface MultiplayerState { status: MultiplayerStatus | 'off'; nearby: number }

export interface Multiplayer extends MultiplayerState {
  /** This session's chat, oldest first (in memory only, bounded). */
  chat: readonly ChatEntry[];
  sendChat: (text: string) => SendResult;
  sendEmote: (emote: EmoteId) => SendResult;
}

const OFFLINE: SendResult = { ok: false, reason: 'offline' };

/**
 * Connects the running scene to the room it reported (`room`), for signed-in
 * players only. `generation` changes whenever the scene is (re)created, so a new
 * scene gets a fresh connection and redraws everyone. Chat history survives
 * reconnects (it lives here, not in the connection).
 */
export function useMultiplayer({ bus, playerId, selfName, mode, room, generation }: {
  bus: GameBus; playerId: string; selfName: string; mode: PlayerMode; room: string | null; generation: number;
}): Multiplayer {
  const [state, setState] = useState<MultiplayerState>({ status: 'off', nearby: 0 });
  const clientRef = useRef<MultiplayerClient | null>(null);
  const logRef = useRef(new ChatLog());
  const [chat, setChat] = useState<readonly ChatEntry[]>(() => logRef.current.entries());

  const addLine = useCallback((entry: ChatEntry) => {
    if (logRef.current.add(entry)) setChat(logRef.current.entries());
  }, []);

  useEffect(() => {
    const db = mode === 'online' && room ? getBrowserSupabase() : null;
    if (!db || !room) { setState({ status: 'off', nearby: 0 }); return; }

    const client = new MultiplayerClient(db, playerId, room, { width: MAP_W, height: MAP_H }, {
      onStatus: (status) => setState((s) => ({ ...s, status })),
      onEvents: (events, visible) => {
        for (const e of events) {
          if (e.type === 'join') bus.ui.emit('remote:join', e.player);
          else if (e.type === 'move') bus.ui.emit('remote:move', { id: e.id, x: e.x, y: e.y, facing: e.facing, moving: e.moving });
          else bus.ui.emit('remote:leave', { id: e.id });
        }
        setState((s) => (s.nearby === visible ? s : { ...s, nearby: visible }));
      },
      onChat: ({ playerId: from, name, text, session, n }) => {
        addLine({ id: `${from}|${session}|${n}`, playerId: from, name, text, at: Date.now(), self: false });
        bus.ui.emit('bubble:chat', { id: from, text });
      },
      onEmote: ({ playerId: from, emote }) => bus.ui.emit('bubble:emote', { id: from, emote }),
    });
    clientRef.current = client;
    const off = bus.world.on('player:state', (s) => client.sendLocal(s));
    void client.start();
    return () => { off(); client.stop(); if (clientRef.current === client) clientRef.current = null; };
  }, [bus, playerId, mode, room, generation, addLine]);

  const sendChat = useCallback((text: string): SendResult => {
    const result = clientRef.current?.sendChat(text) ?? OFFLINE;
    if (result.ok) {
      // We do not receive our own broadcast: show our line and bubble locally.
      addLine({ id: `self|${result.session}|${result.n}`, playerId, name: selfName, text: result.text, at: Date.now(), self: true });
      bus.ui.emit('bubble:chat', { id: 'self', text: result.text });
    }
    return result;
  }, [addLine, bus, playerId, selfName]);

  const sendEmote = useCallback((emote: EmoteId): SendResult => {
    const result = clientRef.current?.sendEmote(emote) ?? OFFLINE;
    if (result.ok) bus.ui.emit('bubble:emote', { id: 'self', emote });
    return result;
  }, [bus]);

  return { ...state, chat, sendChat, sendEmote };
}
