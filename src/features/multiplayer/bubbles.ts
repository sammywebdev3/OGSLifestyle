/**
 * Speech/emote bubbles and proximity: pure helpers used by the Phaser scene.
 */

export type BubbleKind = 'chat' | 'emote';

export interface Bubble { ownerId: string; kind: BubbleKind; lines: string[]; expiresAt: number }

/** How long a bubble stays: longer messages stay a little longer. */
export function bubbleDurationMs(kind: BubbleKind, text: string): number {
  if (kind === 'emote') return 2_500;
  return Math.min(9_000, Math.max(4_000, 3_000 + Array.from(text).length * 60));
}

/**
 * Wrap text for a bubble: at most `maxLines` lines of about `maxChars` characters.
 * Long words are split; text that does not fit ends with "…".
 */
export function wrapBubbleText(text: string, maxChars = 26, maxLines = 4): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = (s: string) => { lines.push(s); };
  for (let word of words) {
    while (Array.from(word).length > maxChars) { // split very long words
      if (line) { push(line); line = ''; }
      const chars = Array.from(word);
      push(chars.slice(0, maxChars).join(''));
      word = chars.slice(maxChars).join('');
    }
    const candidate = line ? `${line} ${word}` : word;
    if (Array.from(candidate).length > maxChars) { push(line); line = word; } else { line = candidate; }
  }
  if (line) push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = Array.from(kept[maxLines - 1] ?? '');
  kept[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).join('').trimEnd()}…`;
  return kept;
}

/** One bubble per character: a new one replaces the old; expired ones are removed. */
export class BubbleTracker {
  private readonly bubbles = new Map<string, Bubble>();

  show(ownerId: string, kind: BubbleKind, content: string, now: number, lines?: string[]): Bubble {
    const bubble = { ownerId, kind, lines: lines ?? (kind === 'chat' ? wrapBubbleText(content) : [content]), expiresAt: now + bubbleDurationMs(kind, content) };
    this.bubbles.set(ownerId, bubble);
    return bubble;
  }

  /** Remove and return the owners whose bubbles have expired. */
  expire(now: number): string[] {
    const gone: string[] = [];
    for (const [id, b] of this.bubbles) if (b.expiresAt <= now) { this.bubbles.delete(id); gone.push(id); }
    return gone;
  }

  remove(ownerId: string): boolean {
    return this.bubbles.delete(ownerId);
  }

  get(ownerId: string): Bubble | undefined {
    return this.bubbles.get(ownerId);
  }

  get size(): number {
    return this.bubbles.size;
  }
}

export interface Rect { x: number; y: number; width: number; height: number }

/**
 * Keep a bubble (centred horizontally on `x`, bottom edge at `y`) inside the
 * visible area, with a margin. Returns the adjusted centre-x and bottom-y.
 */
export function clampBubble(x: number, y: number, width: number, height: number, view: Rect, margin = 8): { x: number; y: number } {
  const minX = view.x + margin + width / 2;
  const maxX = view.x + view.width - margin - width / 2;
  const minY = view.y + margin + height;
  const maxY = view.y + view.height - margin;
  return {
    x: minX > maxX ? view.x + view.width / 2 : Math.min(Math.max(x, minX), maxX),
    y: minY > maxY ? view.y + view.height - margin : Math.min(Math.max(y, minY), maxY),
  };
}

// ---------------------------------------------------------------- proximity

/** Within this many tiles, the "nearby player" prompt and emote buttons appear. */
export const INTERACT_RADIUS = 1.75;
/** Emotes are shown to players within this many tiles of the sender. */
export const EMOTE_RANGE = 8;

export interface Positioned { id: string; x: number; y: number }

/** The closest player within `radius` tiles of `from`, or null. Ties go to the lower id (stable). */
export function nearestWithin<T extends Positioned>(from: { x: number; y: number }, others: Iterable<T>, radius: number): T | null {
  let best: T | null = null; let bestD = Infinity;
  for (const o of others) {
    const d = Math.hypot(o.x - from.x, o.y - from.y);
    if (d > radius) continue;
    if (d < bestD || (d === bestD && best !== null && o.id < best.id)) { best = o; bestD = d; }
  }
  return best;
}

export function withinRange(a: { x: number; y: number }, b: { x: number; y: number }, range: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= range;
}
