/**
 * Draw order for an isometric world. Pure (no Phaser), unit-tested.
 *
 * Static things (buildings, props, decor) are ordered once by a topological sort: A goes before B
 * when A's footprint lies entirely behind B's (north-west of it on the grid) and their pictures
 * overlap on screen. Moving characters are slotted between the statics they overlap each frame:
 * in front of everything whose footprint they stand clear of on the south/east side, behind the
 * rest. This replaces "depth = x + y", which let a lamp post or notice board behind a two-storey
 * building draw on top of its roof.
 */

export interface Footprint { x0: number; y0: number; x1: number; y1: number }
export interface ScreenBox { x: number; y: number; w: number; h: number }
export interface SortItem { fp: Footprint; box: ScreenBox }

/**
 * Footprint a is further from the viewer than footprint b (the viewer looks from the south-east).
 * Clear cases: a lies west of b or north of b (and not the opposite way on the other axis). When a
 * is diagonally off (west but south, or east but north), the corners nearest each other decide.
 */
export function isBehind(a: Footprint, b: Footprint): boolean {
  const west = a.x1 <= b.x0; const east = a.x0 >= b.x1;
  const north = a.y1 <= b.y0; const south = a.y0 >= b.y1;
  if ((west && south) || (east && north)) {
    const aNear = (west ? a.x1 : a.x0) + (south ? a.y0 : a.y1);
    const bNear = (west ? b.x0 : b.x1) + (south ? b.y1 : b.y0);
    return aNear < bNear;
  }
  return west || north;
}

export const boxesOverlap = (a: ScreenBox, b: ScreenBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const key = (f: Footprint) => f.x0 + f.x1 + f.y0 + f.y1;

/** Rank (0..n-1) for each static item: draw lower ranks first. Deterministic; cycles are broken by position. */
export function staticRanks(items: readonly SortItem[]): number[] {
  const n = items.length;
  const after: number[][] = items.map(() => []);
  const indeg = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i]!; const b = items[j]!;
    if (!boxesOverlap(a.box, b.box)) continue;
    const ab = isBehind(a.fp, b.fp); const ba = isBehind(b.fp, a.fp);
    if (ab && !ba) { after[i]!.push(j); indeg[j]!++; } else if (ba && !ab) { after[j]!.push(i); indeg[i]!++; }
  }
  const rank = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  for (let r = 0; r < n; r++) {
    // Among items with nothing left in front of them, take the furthest back; if none (a cycle), the furthest back overall.
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || key(items[i]!.fp) < key(items[pick]!.fp))) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || key(items[i]!.fp) < key(items[pick]!.fp))) pick = i;
    done[pick] = true; rank[pick] = r;
    for (const j of after[pick]!) indeg[j]!--;
  }
  return rank;
}

/**
 * Depth for a character standing at grid point (x, y) whose picture covers `box`: just above the
 * highest-ranked static it is in front of, and below every static it is behind. A small x + y term
 * keeps characters in the right order among themselves.
 */
export function characterDepth(x: number, y: number, box: ScreenBox, items: readonly SortItem[], ranks: readonly number[]): number {
  let lo = -1; let hi = Infinity; // hi is kept for clarity of intent; lo decides

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!boxesOverlap(box, it.box)) continue;
    if (isBehind({ x0: x, y0: y, x1: x, y1: y }, it.fp)) hi = Math.min(hi, ranks[i]!); else lo = Math.max(lo, ranks[i]!);
  }
  // If the constraints conflict (lo >= hi), standing in front wins: never hidden behind something you passed.
  return lo + 0.5 + (x + y) * 0.001;
}
