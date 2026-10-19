/**
 * Who is in the room, and what the scene should draw. Pure state machine: feed it
 * presence changes, profiles and validated movement; it returns join / move /
 * leave events for the scene. One entry per player id, so reconnects and repeated
 * presence events never create a second sprite.
 *
 * A remote player is shown only once we have BOTH their profile (from the
 * database) and at least one movement message on their own topic. Presence alone
 * is just a claim (see protocol.ts), so a fake presence entry never shows a sprite.
 */
import type { Facing, PlayerState, RemoteProfile } from './protocol.ts';
import type { ValidAvatar } from '../../lib/validation/character.ts';

export interface RemoteView { id: string; name: string; avatar: ValidAvatar; x: number; y: number; facing: Facing; moving: boolean }

export type RosterEvent =
  | { type: 'join'; player: RemoteView }
  | { type: 'move'; id: string; x: number; y: number; facing: Facing; moving: boolean }
  | { type: 'leave'; id: string };

export interface RosterOptions {
  /** Hide a player we haven't heard from for this long (they keep sending while idle). */
  staleMs?: number;
  /**
   * Same player in two tabs: keep following one tab, and only switch to another once
   * the current tab has been silent this long. Stops the sprite jumping between them.
   */
  sessionHoldMs?: number;
}

interface Entry { profile?: RemoteProfile; state?: PlayerState; lastSeen: number; shown: boolean; profileRequested: boolean }

export class Roster {
  private readonly entries = new Map<string, Entry>();
  private readonly staleMs: number;
  private readonly sessionHoldMs: number;

  constructor(opts: RosterOptions = {}) {
    this.staleMs = opts.staleMs ?? 10_000;
    this.sessionHoldMs = opts.sessionHoldMs ?? 3_000;
  }

  /** Players currently drawn. */
  get visibleCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.shown) n++;
    return n;
  }

  /** Replace the set of players present in the room (validated ids, without yourself). */
  setPresent(ids: readonly string[], now: number): { added: string[]; removed: string[]; events: RosterEvent[] } {
    const wanted = new Set(ids);
    const added: string[] = []; const removed: string[] = []; const events: RosterEvent[] = [];
    for (const [id, e] of this.entries) {
      if (wanted.has(id)) continue;
      this.entries.delete(id);
      removed.push(id);
      if (e.shown) events.push({ type: 'leave', id });
    }
    for (const id of wanted) {
      if (this.entries.has(id)) continue;
      this.entries.set(id, { lastSeen: now, shown: false, profileRequested: false });
      added.push(id);
    }
    return { added, removed, events };
  }

  /** Present players whose profile we still need. Marks them as requested. */
  takeProfileRequests(): string[] {
    const ids: string[] = [];
    for (const [id, e] of this.entries) if (!e.profile && !e.profileRequested) { e.profileRequested = true; ids.push(id); }
    return ids;
  }

  /** A profile request failed: allow asking again later. */
  profileRequestFailed(ids: readonly string[]): void {
    for (const id of ids) { const e = this.entries.get(id); if (e && !e.profile) e.profileRequested = false; }
  }

  setProfile(id: string, profile: RemoteProfile): RosterEvent[] {
    const e = this.entries.get(id);
    if (!e || e.profile) return [];
    e.profile = profile;
    return this.showIfReady(id, e);
  }

  /** A validated movement message arrived on `id`'s own topic. */
  receiveState(id: string, state: PlayerState, now: number): RosterEvent[] {
    const e = this.entries.get(id);
    if (!e) return []; // not (or no longer) in the room
    const cur = e.state;
    if (cur) {
      if (state.session !== cur.session) {
        if (now - e.lastSeen < this.sessionHoldMs) return []; // another tab of the same player: keep following the first
      } else if (state.seq <= cur.seq) {
        return []; // duplicate or out of order
      }
    }
    e.state = state;
    e.lastSeen = now;
    if (!e.shown) return this.showIfReady(id, e);
    return [{ type: 'move', id, x: state.x, y: state.y, facing: state.facing, moving: state.moving }];
  }

  /** Hide players that went silent without leaving (closed laptop, lost network). */
  prune(now: number): RosterEvent[] {
    const events: RosterEvent[] = [];
    for (const [id, e] of this.entries) {
      if (e.shown && now - e.lastSeen > this.staleMs) {
        e.shown = false;
        e.state = undefined; // must hear from them again before showing
        events.push({ type: 'leave', id });
      }
    }
    return events;
  }

  /** Forget everyone (leaving the room). */
  clear(): RosterEvent[] {
    const events: RosterEvent[] = [];
    for (const [id, e] of this.entries) if (e.shown) events.push({ type: 'leave', id });
    this.entries.clear();
    return events;
  }

  private showIfReady(id: string, e: Entry): RosterEvent[] {
    if (e.shown || !e.profile || !e.state) return [];
    e.shown = true;
    const { x, y, facing, moving } = e.state;
    return [{ type: 'join', player: { id, name: e.profile.name, avatar: e.profile.avatar, x, y, facing, moving } }];
  }
}
