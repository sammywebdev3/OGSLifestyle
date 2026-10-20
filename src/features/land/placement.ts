/**
 * Where land plots may go on the Kuto Street map. Pure functions over the map
 * data in src/game/world/starterArea.ts (no Phaser, no Supabase), used by the
 * tests that check every seeded plot, and by the tool that proposed them.
 *
 * A plot is a rectangle of whole tiles. Every tile must be open ground that is
 * inside the map, not part of a building, prop, door approach, interaction spot
 * or the spawn point, not hidden behind a building on screen, and not part of
 * another plot.
 */
import { BUILDINGS, INTERACTABLES, MAP_H, MAP_W, PROPS, SPAWN, tileAt, type BuildingDef, type TileKind } from '../../game/world/starterArea.ts';
import { gridToScreen, type Point } from '../../game/iso/isoMath.ts';

export interface TileRect { x: number; y: number; w: number; d: number }

/** Ground a plot may sit on. Road, pavement, gutter, slab and the Kuto Court courtyard are not for sale. */
export const PLOT_GROUND: readonly TileKind[] = ['laterite', 'grass'];

export function rectTiles(r: TileRect): Point[] {
  const out: Point[] = [];
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.d; y++) out.push({ x, y });
  return out;
}

export function rectsOverlap(a: TileRect, b: TileRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;
}

/** The tile right in front of a building's door (players walk through it). */
export function doorTile(b: BuildingDef): Point | null {
  return b.door === undefined ? null : { x: Math.floor(b.x + b.door), y: b.y + b.d };
}

/** Does the reach circle of an interaction spot touch tile (tx, ty)? */
function circleTouchesTile(cx: number, cy: number, radius: number, tx: number, ty: number): boolean {
  const nx = Math.max(tx, Math.min(cx, tx + 1));
  const ny = Math.max(ty, Math.min(cy, ty + 1));
  return Math.hypot(cx - nx, cy - ny) < radius;
}

/** The building's outline on screen (convex: a box seen from above), in drawing order. */
export function buildingSilhouette(b: BuildingDef): Point[] {
  const pts: Point[] = [];
  for (const [gx, gy] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.d], [b.x + b.w, b.y + b.d]] as const) {
    const s = gridToScreen(gx, gy);
    pts.push(s, { x: s.x, y: s.y - b.h });
  }
  return convexHull(pts);
}

function convexHull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = []; const upper: Point[] = [];
  for (const pt of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, pt) <= 0) lower.pop(); lower.push(pt); }
  for (const pt of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, pt) <= 0) upper.pop(); upper.push(pt); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function insideConvex(poly: Point[], q: Point): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!; const b = poly[(i + 1) % poly.length]!;
    const c = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    if (c === 0) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** True if the building is drawn over part of tile (tx, ty): the tile is behind it (north or west) and under its outline. */
export function hiddenBehind(b: BuildingDef, tx: number, ty: number): boolean {
  const behind = tx < b.x + b.w && ty < b.y + b.d;
  if (!behind) return false;
  const hull = buildingSilhouette(b);
  const inset = 0.1;
  const probes = [[0.5, 0.5], [inset, inset], [1 - inset, inset], [inset, 1 - inset], [1 - inset, 1 - inset]] as const;
  return probes.some(([ox, oy]) => insideConvex(hull, gridToScreen(tx + ox, ty + oy)));
}

/** Why a plot cannot go here (empty = it can). `others` are the other plots already placed. */
export function plotProblems(r: TileRect, others: readonly TileRect[] = []): string[] {
  const problems: string[] = [];
  if (![r.x, r.y, r.w, r.d].every(Number.isInteger) || r.w < 1 || r.d < 1) return ['not a whole-tile rectangle'];
  if (r.x < 0 || r.y < 0 || r.x + r.w > MAP_W || r.y + r.d > MAP_H) return ['outside the map'];
  for (const { x, y } of rectTiles(r)) {
    const at = `tile ${x},${y}`;
    const kind = tileAt(x, y);
    if (!PLOT_GROUND.includes(kind)) problems.push(`${at} is ${kind}`);
    for (const b of BUILDINGS) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d) problems.push(`${at} is inside building ${b.id}`);
      const door = doorTile(b);
      if (door && door.x === x && door.y === y) problems.push(`${at} is in front of the ${b.id} door`);
      if (hiddenBehind(b, x, y)) problems.push(`${at} is hidden behind building ${b.id}`);
    }
    for (const p of PROPS) if (p.x === x && p.y === y) problems.push(`${at} has a ${p.kind}`);
    for (const it of INTERACTABLES) if (circleTouchesTile(it.x, it.y, it.radius, x, y)) problems.push(`${at} is in reach of ${it.id}`);
    if (Math.floor(SPAWN.x) === x && Math.floor(SPAWN.y) === y) problems.push(`${at} is the spawn point`);
  }
  for (const o of others) if (rectsOverlap(r, o)) problems.push(`overlaps the plot at ${o.x},${o.y}`);
  return problems;
}
