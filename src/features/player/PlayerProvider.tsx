'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Inventory } from '@/types/inventory';
import type { CreateCharacterInput, Player } from '@/types/player';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { fetchMyPlayer, postCharacter } from './api';
import { clearGuest, createGuest, loadGuest } from './guestStore';

export type PlayerMode = 'online' | 'guest';
export type PlayerStatus = 'loading' | 'signed-out' | 'no-character' | 'ready' | 'error';

interface PlayerState {
  status: PlayerStatus;
  mode: PlayerMode;
  player: Player | null;
  inventory: Inventory | null;
  error: string | null;
}

interface PlayerContextValue extends PlayerState {
  onlineAvailable: boolean;
  refresh: () => Promise<void>;
  createCharacter: (input: CreateCharacterInput, mode: PlayerMode) => Promise<void>;
  signOut: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const onlineAvailable = isSupabaseConfigured();
  const [state, setState] = useState<PlayerState>({ status: 'loading', mode: 'guest', player: null, inventory: null, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    const supabase = getBrowserSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          const snap = await fetchMyPlayer();
          setState({ status: snap.player ? 'ready' : 'no-character', mode: 'online', player: snap.player, inventory: snap.inventory, error: null });
        } catch (e) {
          setState({ status: 'error', mode: 'online', player: null, inventory: null, error: e instanceof Error ? e.message : 'Could not load your character.' });
        }
        return;
      }
    }
    const guest = loadGuest();
    setState(guest
      ? { status: 'ready', mode: 'guest', player: guest.player, inventory: guest.inventory, error: null }
      : { status: 'signed-out', mode: 'guest', player: null, inventory: null, error: null });
  }, []);

  useEffect(() => {
    void refresh();
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const createCharacter = useCallback(async (input: CreateCharacterInput, mode: PlayerMode) => {
    if (mode === 'online') {
      const snap = await postCharacter(input);
      setState({ status: 'ready', mode: 'online', player: snap.player, inventory: snap.inventory, error: null });
    } else {
      const save = createGuest(input);
      setState({ status: 'ready', mode: 'guest', player: save.player, inventory: save.inventory, error: null });
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (supabase) await supabase.auth.signOut();
    clearGuest();
    setState({ status: 'signed-out', mode: 'guest', player: null, inventory: null, error: null });
  }, []);

  const value = useMemo(() => ({ ...state, onlineAvailable, refresh, createCharacter, signOut }), [state, onlineAvailable, refresh, createCharacter, signOut]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
