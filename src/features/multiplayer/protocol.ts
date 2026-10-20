/**
 * Multiplayer wire protocol: channel topics and validation of everything that
 * arrives from other clients. Pure functions (no Supabase, no Phaser), so they
 * can be unit-tested.
 *
 * Topics (must match supabase/migrations/20261019000000_phase3_1_multiplayer.sql):
 *   mp:<room>              presence only: who is in the room
 *   mp:<room>:<player id>  broadcast: that player's movement. Realtime policies
 *                          only let the owner of <player id> send on it.
 *
 * Nothing received here is trusted: remote positions are only drawn, never saved.
 */
import { validateAvatar, validateCharacterName, type ValidAvatar } from '../../lib/validation/character.ts';

export const STATE_EVENT = 'state';
export const PROTOCOL_VERSION = 1;
/** Most remote players one client will show (and subscribe to) per room. */
export const MAX_REMOTE_PLAYERS = 30;

const ROOM_ID = /^[a-z0-9-]{1,40}$/;
const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{8,32}$/;
const MAX_SEQ = 2 ** 31 - 1;

export type Facing = 'left' | 'right';

/** A player's position in a room, in grid tiles. */
export interface PlayerState {
  /** Random id of the browser tab that sent it (one account may have two tabs open). */
  session: string;
  /** Increases with every message from that tab. */
  seq: number;
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
}

/** Compact form sent over the network. */
export interface WireState { v: 1; s: string; q: number; x: number; y: number; f: 'l' | 'r'; m: 0 | 1 }

export interface RemoteProfile { name: string; avatar: ValidAvatar }

export interface Bounds { width: number; height: number }

export const isRoomId = (v: unknown): v is string => typeof v === 'string' && ROOM_ID.test(v);
export const isPlayerId = (v: unknown): v is string => typeof v === 'string' && PLAYER_ID.test(v);
export const isSessionId = (v: unknown): v is string => typeof v === 'string' && SESSION_ID.test(v);

export function roomTopic(room: string): string {
  if (!isRoomId(room)) throw new Error('Invalid room id');
  return `mp:${room}`;
}

export function playerTopic(room: string, playerId: string): string {
  if (!isPlayerId(playerId)) throw new Error('Invalid player id');
  return `${roomTopic(room)}:${playerId}`;
}

/** A random tab id. Not a secret: it only tells two tabs of the same player apart. */
export function newSessionId(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) id += chars[Math.floor(random() * chars.length)] ?? 'x';
  return id;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function encodeState(state: PlayerState): WireState {
  return { v: PROTOCOL_VERSION, s: state.session, q: state.seq, x: round2(state.x), y: round2(state.y), f: state.facing === 'left' ? 'l' : 'r', m: state.moving ? 1 : 0 };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const inRange = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;

/** Validate a movement message from another client. Returns null if anything is off. */
export function parseState(raw: unknown, bounds: Bounds): PlayerState | null {
  if (!isPlainObject(raw) || raw.v !== PROTOCOL_VERSION) return null;
  const { s, q, x, y, f, m } = raw;
  if (!isSessionId(s)) return null;
  if (typeof q !== 'number' || !Number.isInteger(q) || q < 0 || q > MAX_SEQ) return null;
  if (!inRange(x, bounds.width) || !inRange(y, bounds.height)) return null;
  if (f !== 'l' && f !== 'r') return null;
  if (m !== 0 && m !== 1) return null;
  return { session: s, seq: q, x, y, facing: f === 'l' ? 'left' : 'right', moving: m === 1 };
}

/**
 * Player ids announced in a room's presence state (`channel.presenceState()`).
 * Presence keys are chosen by clients, so an id here is only a claim: we listen on
 * that player's own topic, and only its real owner can send there.
 */
export function presentPlayerIds(presenceState: unknown, selfId: string, limit = MAX_REMOTE_PLAYERS): string[] {
  if (!isPlainObject(presenceState)) return [];
  const ids: string[] = [];
  for (const key of Object.keys(presenceState).sort()) {
    if (key === selfId || !isPlayerId(key)) continue;
    ids.push(key);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Validate rows from the get_player_profiles RPC. Bad rows are dropped. */
export function parseProfiles(rows: unknown): Map<string, RemoteProfile> {
  const out = new Map<string, RemoteProfile>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!isPlainObject(row) || !isPlayerId(row.player_id)) continue;
    const name = validateCharacterName(row.character_name);
    const avatar = validateAvatar(row.avatar);
    if (name.ok && avatar.ok) out.set(row.player_id, { name: name.value, avatar: avatar.value });
  }
  return out;
}
