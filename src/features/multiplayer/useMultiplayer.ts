'use client';

import { useEffect, useState } from 'react';
import type { GameBus } from '@/game/events';
import type { PlayerMode } from '@/features/player/PlayerProvider';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { MAP_H, MAP_W } from '@/game/world/starterArea';
import { MultiplayerClient, type MultiplayerStatus } from './client';

/** "off" = guest or online accounts not configured: the world is single-player. */
export interface MultiplayerState { status: MultiplayerStatus | 'off'; nearby: number }

/**
 * Connects the running scene to the room it reported (`room`), for signed-in
 * players only. `generation` changes whenever the scene is (re)created, so a new
 * scene gets a fresh connection and redraws everyone.
 */
export function useMultiplayer({ bus, playerId, mode, room, generation }: {
  bus: GameBus; playerId: string; mode: PlayerMode; room: string | null; generation: number;
}): MultiplayerState {
  const [state, setState] = useState<MultiplayerState>({ status: 'off', nearby: 0 });

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
    });
    const off = bus.world.on('player:state', (s) => client.sendLocal(s));
    void client.start();
    return () => { off(); client.stop(); };
  }, [bus, playerId, mode, room, generation]);

  return state;
}
