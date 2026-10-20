/**
 * Browser-side multiplayer over Supabase Realtime (private channels only).
 *
 *   mp:<room>              presence: we announce ourselves, and learn who else is here
 *   mp:<room>:<our id>     we broadcast our movement (only we may send here)
 *   mp:<room>:<their id>   we listen to each other player's movement
 *
 * Who may join or send is enforced by the database (Realtime Authorization
 * policies in supabase/migrations/20261019000000_phase3_1_multiplayer.sql), using
 * the signed-in user's own session token; no secret key is involved. Names come
 * from the get_player_profiles RPC, never from other clients.
 *
 * Failures never throw into the game: they only change the reported status, and
 * the single-player world keeps running.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { LocalPlayerState } from '@/types/game';
import { SendPolicy } from './motion.ts';
import { STATE_EVENT, encodeState, newSessionId, parseProfiles, parseState, playerTopic, presentPlayerIds, roomTopic, type Bounds } from './protocol.ts';
import { Roster, type RosterEvent } from './roster.ts';

export type MultiplayerStatus = 'connecting' | 'online' | 'reconnecting' | 'unavailable';

export interface MultiplayerCallbacks {
  onStatus: (status: MultiplayerStatus) => void;
  /** Join / move / leave events for the scene, plus how many players are visible. */
  onEvents: (events: RosterEvent[], visible: number) => void;
}

type ChannelStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

const PRUNE_EVERY_MS = 1_000;
const PROFILE_RETRY_MS = 5_000;

export class MultiplayerClient {
  private readonly db: SupabaseClient<Database>;
  private readonly playerId: string;
  private readonly room: string;
  private readonly bounds: Bounds;
  private readonly cb: MultiplayerCallbacks;

  private readonly roster = new Roster();
  private readonly policy = new SendPolicy();
  private readonly session = newSessionId();
  private seq = 0;
  private roomChannel: RealtimeChannel | null = null;
  private ownChannel: RealtimeChannel | null = null;
  private readonly remoteChannels = new Map<string, RealtimeChannel>();
  private ready = { room: false, own: false };
  private status: MultiplayerStatus | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastProfileAttempt = 0;
  private stopped = false;

  constructor(db: SupabaseClient<Database>, playerId: string, room: string, bounds: Bounds, cb: MultiplayerCallbacks) {
    this.db = db; this.playerId = playerId; this.room = room; this.bounds = bounds; this.cb = cb;
  }

  async start(): Promise<void> {
    this.setStatus('connecting');
    try {
      // Private channels authorise with the user's own access token.
      await this.db.realtime.setAuth();
      if (this.stopped) return;

      this.ownChannel = this.db
        .channel(playerTopic(this.room, this.playerId), { config: { private: true, broadcast: { self: false, ack: false } } })
        .subscribe((status, err) => this.onChannelStatus('own', status, err));

      const room = this.db.channel(roomTopic(this.room), { config: { private: true, presence: { key: this.playerId } } });
      this.roomChannel = room;
      room
        .on('presence', { event: 'sync' }, () => this.syncPresence())
        .subscribe((status, err) => {
          this.onChannelStatus('room', status, err);
          // (Re)announce ourselves every time the channel (re)joins.
          if (status === 'SUBSCRIBED') void room.track({ s: this.session }).catch(() => undefined);
        });

      this.timer = setInterval(() => this.tick(), PRUNE_EVERY_MS);
    } catch (e) {
      console.warn('Multiplayer unavailable:', e instanceof Error ? e.message : e);
      this.setStatus('unavailable');
    }
  }

  /** Called with the local player's state every frame; sends only when SendPolicy allows. */
  sendLocal(state: LocalPlayerState): void {
    if (this.stopped || !this.ready.own || !this.ownChannel) return;
    const now = Date.now();
    const clamped = { ...state, x: clamp(state.x, this.bounds.width), y: clamp(state.y, this.bounds.height) };
    if (!this.policy.tick(now, clamped)) return;
    this.seq += 1;
    void this.ownChannel
      .send({ type: 'broadcast', event: STATE_EVENT, payload: encodeState({ session: this.session, seq: this.seq, ...clamped }) })
      .catch(() => undefined);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.closeAll();
  }

  /** Hide everyone and close every channel (also stops realtime-js from retrying). */
  private closeAll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ready = { room: false, own: false };
    this.emit(this.roster.clear());
    for (const ch of this.remoteChannels.values()) void this.db.removeChannel(ch);
    this.remoteChannels.clear();
    if (this.roomChannel) void this.db.removeChannel(this.roomChannel); // leaving also drops our presence
    if (this.ownChannel) void this.db.removeChannel(this.ownChannel);
    this.roomChannel = this.ownChannel = null;
  }

  private tick(): void {
    this.emit(this.roster.prune(Date.now()));
    if (Date.now() - this.lastProfileAttempt > PROFILE_RETRY_MS) void this.fetchProfiles();
  }

  private syncPresence(): void {
    if (this.stopped || !this.roomChannel) return;
    const ids = presentPlayerIds(this.roomChannel.presenceState(), this.playerId);
    const { added, removed, events } = this.roster.setPresent(ids, Date.now());
    this.emit(events);
    for (const id of removed) {
      const ch = this.remoteChannels.get(id);
      if (ch) void this.db.removeChannel(ch);
      this.remoteChannels.delete(id);
    }
    for (const id of added) this.listenTo(id);
    if (added.length > 0) {
      this.policy.forceNext(); // newcomers should see us without waiting for a heartbeat
      void this.fetchProfiles();
    }
  }

  private listenTo(id: string): void {
    if (this.remoteChannels.has(id)) return;
    const ch = this.db
      .channel(playerTopic(this.room, id), { config: { private: true } })
      .on('broadcast', { event: STATE_EVENT }, (msg) => {
        // The topic, not the payload, says who sent this: only `id` may send on it.
        const state = parseState(msg.payload, this.bounds);
        if (state) this.emit(this.roster.receiveState(id, state, Date.now()));
      })
      .subscribe();
    this.remoteChannels.set(id, ch);
  }

  private async fetchProfiles(): Promise<void> {
    const ids = this.roster.takeProfileRequests();
    if (ids.length === 0) return;
    this.lastProfileAttempt = Date.now();
    try {
      const { data, error } = await this.db.rpc('get_player_profiles', { p_player_ids: ids });
      if (this.stopped) return;
      if (error) { this.roster.profileRequestFailed(ids); return; }
      for (const [id, profile] of parseProfiles(data)) this.emit(this.roster.setProfile(id, profile));
    } catch {
      this.roster.profileRequestFailed(ids);
    }
  }

  private onChannelStatus(which: 'room' | 'own', status: ChannelStatus, err?: Error): void {
    if (this.stopped) return;
    this.ready[which] = status === 'SUBSCRIBED';
    if (status === 'SUBSCRIBED') {
      if (this.ready.room && this.ready.own) this.setStatus('online');
      return;
    }
    // realtime-js retries failed joins by itself. That helps after a network drop,
    // but a permission error will not fix itself: stop, instead of asking the
    // database to re-check the policies every few seconds from every open tab.
    const denied = /unauthori[sz]ed|permission|not allowed/i.test(err?.message ?? '');
    if (!denied) { this.setStatus('reconnecting'); return; }
    console.warn('Multiplayer not authorised for this room:', err?.message);
    this.stopped = true;
    this.closeAll();
    this.setStatus('unavailable');
  }

  private setStatus(status: MultiplayerStatus): void {
    if (status === this.status) return;
    this.status = status;
    safely(() => this.cb.onStatus(status));
  }

  private emit(events: RosterEvent[]): void {
    if (events.length === 0) return;
    safely(() => this.cb.onEvents(events, this.roster.visibleCount));
  }
}

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

function safely(fn: () => void): void {
  try { fn(); } catch (e) { console.error('Multiplayer callback failed', e); }
}
