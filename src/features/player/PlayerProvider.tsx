'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Inventory, ItemKey } from '@/types/inventory';
import type { CreateCharacterInput, Player } from '@/types/player';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { ApiError, fetchMyPlayer, postCharacter } from './api';
import { shouldReloadOnAuthEvent } from './authEvents';
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
  /** Show the balance a server response just reported (e.g. after buying land). Never a client-side calculation. */
  applyServerCash: (cash: number) => void;
  applyServerItem: (key: ItemKey, owned: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const onlineAvailable = isSupabaseConfigured();
  const [state, setState] = useState<PlayerState>({ status: 'loading', mode: 'guest', player: null, inventory: null, error: null });
  // The signed-in user the current state belongs to (null = guest / signed out).
  const userIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    const supabase = getBrowserSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      userIdRef.current = data.session?.user.id ?? null;
      if (data.session) {
        try {
          const snap = await fetchMyPlayer();
          setState({ status: snap.player ? 'ready' : 'no-character', mode: 'online', player: snap.player, inventory: snap.inventory, error: null });
          return;
        } catch (e) {
          // The server rejected the session (expired/revoked): treat as signed out.
          if (!(e instanceof ApiError && e.status === 401)) {
            setState({ status: 'error', mode: 'online', player: null, inventory: null, error: e instanceof Error ? e.message : 'Could not load your character.' });
            return;
          }
          userIdRef.current = null;
        }
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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (shouldReloadOnAuthEvent(event, session?.user.id ?? null, userIdRef.current)) void refresh();
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
    userIdRef.current = null;
    clearGuest();
    setState({ status: 'signed-out', mode: 'guest', player: null, inventory: null, error: null });
  }, []);

  const applyServerCash = useCallback((cash: number) => {
    if (!Number.isSafeInteger(cash) || cash < 0) return;
    setState((s) => (s.mode === 'online' && s.player ? { ...s, player: { ...s.player, cash } } : s));
  }, []);

  // How many of an item the server says you own now (after a shop purchase). Only the server's count is shown.
  const applyServerItem = useCallback((key: ItemKey, owned: number) => {
    if (!Number.isSafeInteger(owned) || owned < 0) return;
    setState((s) => {
      if (s.mode !== 'online' || !s.inventory) return s;
      const others = s.inventory.items.filter((i) => i.key !== key);
      const items = owned > 0 ? [...others, { key, quantity: owned }] : others;
      return { ...s, inventory: { ...s.inventory, items } };
    });
  }, []);

  const value = useMemo(() => ({ ...state, onlineAvailable, refresh, createCharacter, signOut, applyServerCash, applyServerItem }),
    [state, onlineAvailable, refresh, createCharacter, signOut, applyServerCash, applyServerItem]);
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}
