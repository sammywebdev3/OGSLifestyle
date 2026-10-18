/**
 * Isometric (2:1 "dimetric") projection helpers. Pure functions, no Phaser —
 * so they can be unit-tested and reused by server-side map tools later.
 *
 * Grid space: (gx, gy) in tiles, x to the south-east, y to the south-west.
 * Screen space: pixels, origin at the top corner of tile (0, 0).
 */

export const TILE_W = 64;
export const TILE_H = 32;

export interface Point { x: number; y: number }

export function gridToScreen(gx: number, gy: number, tileW = TILE_W, tileH = TILE_H): Point {
  return { x: (gx - gy) * (tileW / 2), y: (gx + gy) * (tileH / 2) };
}

export function screenToGrid(sx: number, sy: number, tileW = TILE_W, tileH = TILE_H): Point {
  const a = sx / (tileW / 2);
  const b = sy / (tileH / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Depth so that things lower on screen (further "south") draw on top. */
export function depthOf(gx: number, gy: number): number {
  return gx + gy;
}

/**
 * Screen-relative movement → grid movement. "Up" on the keyboard moves the
 * character up the screen (north), which is −x −y in grid space.
 */
export function screenDirToGrid(dx: number, dy: number): Point {
  // Inverse of gridToScreen for a direction vector, normalised to unit length.
  const gx = dx / 2 + dy;
  const gy = -dx / 2 + dy;
  const len = Math.hypot(gx, gy);
  return len === 0 ? { x: 0, y: 0 } : { x: gx / len, y: gy / len };
}

/** True if a circle of `radius` (in tiles) centred at (gx, gy) overlaps any blocked tile. */
export function collides(gx: number, gy: number, radius: number, isBlocked: (tx: number, ty: number) => boolean): boolean {
  const minX = Math.floor(gx - radius); const maxX = Math.floor(gx + radius);
  const minY = Math.floor(gy - radius); const maxY = Math.floor(gy + radius);
  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      if (!isBlocked(tx, ty)) continue;
      // nearest point of the tile square to the circle centre
      const nx = Math.max(tx, Math.min(gx, tx + 1));
      const ny = Math.max(ty, Math.min(gy, ty + 1));
      if ((gx - nx) ** 2 + (gy - ny) ** 2 < radius * radius) return true;
    }
  }
  return false;
}

/** Move with axis-separated collision so the player slides along walls. */
export function moveWithCollision(
  pos: Point, delta: Point, radius: number, isBlocked: (tx: number, ty: number) => boolean,
): Point {
  let { x, y } = pos;
  if (!collides(x + delta.x, y, radius, isBlocked)) x += delta.x;
  if (!collides(x, y + delta.y, radius, isBlocked)) y += delta.y;
  return { x, y };
}
