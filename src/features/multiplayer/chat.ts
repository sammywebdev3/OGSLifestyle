/**
 * Phase 3.2 chat and emotes: wire format, text cleaning, rate limits and the
 * bounded chat history. Pure functions/classes (no Supabase, no Phaser, no React).
 *
 * Chat and emotes travel exactly like movement: as broadcast events on the
 * sender's OWN player topic mp:<room>:<player id>. The Realtime policy from the
 * Phase 3.1 migration lets only the owner of that id send there (it checks the
 * topic, not the event name), so the topic identifies the sender. Everything in
 * the payload is untrusted and validated here. Nothing is stored in the database.
 */
import { PROTOCOL_VERSION, isSessionId } from './protocol.ts';

export const CHAT_EVENT = 'chat';
export const EMOTE_EVENT = 'emote';
/** Longest chat message, in characters (Unicode code points). */
export const CHAT_MAX_CHARS = 200;
/** Chat lines kept in memory for this session. */
export const CHAT_HISTORY_LIMIT = 50;

export const EMOTES = {
  wave: { label: 'Wave', icon: '👋' },
  greet: { label: 'Greet', icon: '🤝' },
  laugh: { label: 'Laugh', icon: '😂' },
  heart: { label: 'Heart', icon: '❤️' },
} as const;
export type EmoteId = keyof typeof EMOTES;
export const EMOTE_IDS = Object.keys(EMOTES) as EmoteId[];
export const isEmoteId = (v: unknown): v is EmoteId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(EMOTES, v);

const MAX_COUNTER = 2 ** 31 - 1;

// ---------------------------------------------------------------- text cleaning

/** Control characters, invisible/format characters and bidi overrides (used for spoofing). */
function isUnsafeCodePoint(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)
    || (cp >= 0x200b && cp <= 0x200f) // zero-width chars, LRM/RLM
    || (cp >= 0x2028 && cp <= 0x202e) // line/paragraph separators, bidi embeddings/overrides
    || (cp >= 0x2060 && cp <= 0x206f) // word joiner, invisible operators, bidi isolates
    || cp === 0xfeff // byte order mark
    || (cp >= 0xfff9 && cp <= 0xfffb) // interlinear annotation
    || (cp >= 0xd800 && cp <= 0xdfff); // lone surrogates
}

function isCombiningMark(cp: number): boolean {
  return (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff)
    || (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe20 && cp <= 0xfe2f);
}

/** At most this many combining marks in a row (keeps Yoruba tone marks, stops "zalgo" text). */
const MAX_COMBINING_RUN = 2;

/**
 * Clean a chat message: NFC-normalise, turn tabs/newlines into spaces, drop
 * control/invisible/bidi characters, cap combining-mark runs, collapse spaces.
 * Returns null if nothing is left or it is longer than CHAT_MAX_CHARS.
 * HTML is NOT escaped here on purpose: messages are only ever shown as plain
 * text (React text nodes and Phaser Text), so "<b>" is displayed literally.
 */
export function sanitizeChatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let out = '';
  let combiningRun = 0;
  for (const ch of raw.normalize('NFC')) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) { out += ' '; combiningRun = 0; continue; }
    if (isUnsafeCodePoint(cp)) continue;
    if (isCombiningMark(cp)) {
      combiningRun += 1;
      if (combiningRun > MAX_COMBINING_RUN) continue;
    } else {
      combiningRun = 0;
    }
    out += ch;
  }
  out = out.replace(/ {2,}/g, ' ').trim();
  if (out.length === 0 || Array.from(out).length > CHAT_MAX_CHARS) return null;
  return out;
}

// ---------------------------------------------------------------- wire format

/** Chat on the wire. `n` increases per tab session (for de-duplication). */
export interface WireChat { v: 1; s: string; n: number; t: string }
export interface WireEmote { v: 1; s: string; n: number; e: EmoteId }

export interface ChatMessage { session: string; n: number; text: string }
export interface EmoteMessage { session: string; n: number; emote: EmoteId }

export function encodeChat(session: string, n: number, text: string): WireChat {
  return { v: PROTOCOL_VERSION, s: session, n, t: text };
}

export function encodeEmote(session: string, n: number, emote: EmoteId): WireEmote {
  return { v: PROTOCOL_VERSION, s: session, n, e: emote };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCounter = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNTER;

/** Validate a chat message from another client. The text is cleaned again on arrival. */
export function parseChat(raw: unknown): ChatMessage | null {
  if (!isPlainObject(raw) || raw.v !== PROTOCOL_VERSION || !isSessionId(raw.s) || !isCounter(raw.n)) return null;
  if (typeof raw.t !== 'string' || raw.t.length > CHAT_MAX_CHARS * 4) return null; // cheap size guard before cleaning
  const text = sanitizeChatText(raw.t);
  return text === null ? null : { session: raw.s, n: raw.n, text };
}

export function parseEmote(raw: unknown): EmoteMessage | null {
  if (!isPlainObject(raw) || raw.v !== PROTOCOL_VERSION || !isSessionId(raw.s) || !isCounter(raw.n)) return null;
  return isEmoteId(raw.e) ? { session: raw.s, n: raw.n, emote: raw.e } : null;
}

// ---------------------------------------------------------------- rate limiting

/** Token bucket: `capacity` messages at once, refilled at one per `refillMs`. */
export class RateLimiter {
  private tokens: number;
  private last: number | null = null;
  private readonly capacity: number;
  private readonly refillMs: number;

  constructor(capacity: number, refillMs: number) {
    this.capacity = capacity;
    this.refillMs = refillMs;
    this.tokens = capacity;
  }

  /** Spend one token if available. */
  tryTake(now: number): boolean {
    if (this.last !== null) this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) / this.refillMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** What we allow ourselves to send (the UI explains when a message is held back). */
export const SEND_LIMITS = { chat: { capacity: 5, refillMs: 2_000 }, emote: { capacity: 3, refillMs: 1_500 } } as const;
/**
 * What we accept from each other player. A little looser than SEND_LIMITS (for
 * network bunching), but stops a modified client from flooding everyone's screen.
 */
export const RECEIVE_LIMITS = { chat: { capacity: 8, refillMs: 1_500 }, emote: { capacity: 5, refillMs: 1_000 } } as const;

/** Per-sender receive limits and de-duplication for chat and emotes. */
export class InboundGate {
  private readonly limiters = new Map<string, { chat: RateLimiter; emote: RateLimiter }>();
  private readonly lastSeen = new Map<string, number>();

  /** True if this message (from `playerId`, tab `session`, number `n`) should be shown. */
  accept(kind: 'chat' | 'emote', playerId: string, session: string, n: number, now: number): boolean {
    const key = `${kind}|${playerId}|${session}`;
    const prev = this.lastSeen.get(key);
    if (prev !== undefined && n <= prev) return false; // duplicate or out of order
    let l = this.limiters.get(playerId);
    if (!l) {
      l = { chat: new RateLimiter(RECEIVE_LIMITS.chat.capacity, RECEIVE_LIMITS.chat.refillMs), emote: new RateLimiter(RECEIVE_LIMITS.emote.capacity, RECEIVE_LIMITS.emote.refillMs) };
      this.limiters.set(playerId, l);
    }
    if (!l[kind].tryTake(now)) return false;
    this.lastSeen.set(key, n);
    return true;
  }

  /** Forget a player who left (so state cannot grow without bound). */
  forget(playerId: string): void {
    this.limiters.delete(playerId);
    for (const key of [...this.lastSeen.keys()]) if (key.split('|')[1] === playerId) this.lastSeen.delete(key);
  }
}

// ---------------------------------------------------------------- history

export interface ChatEntry {
  /** Unique per message: `<player id or "me">|<session>|<n>`. */
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
  self: boolean;
}

/** The last CHAT_HISTORY_LIMIT messages of this session, oldest first. In memory only. */
export class ChatLog {
  private items: ChatEntry[] = [];
  private readonly limit: number;

  constructor(limit = CHAT_HISTORY_LIMIT) {
    this.limit = limit;
  }

  /** Add a message (ignored if its id is already present). Returns whether it was added. */
  add(entry: ChatEntry): boolean {
    if (this.items.some((e) => e.id === entry.id)) return false;
    this.items = [...this.items, entry].slice(-this.limit);
    return true;
  }

  /** A new array each time something changes, so React can render it directly. */
  entries(): readonly ChatEntry[] {
    return this.items;
  }
}
