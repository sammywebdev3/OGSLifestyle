/**
 * Which ground art goes on each tile. Pure (no DOM, no Phaser) and unit-tested.
 *
 * Inside the map the logical tile kind (starterArea.tileAt) decides the material; only the look
 * varies (patches of grass grow in clusters rather than a scattered pattern, roads get lane marks
 * and gutter grime next to the kerb). Outside the map the street and its pavements and gutter
 * carry on, and the rest is dimmed open ground, so the world has no hard edge. Nothing here
 * affects collision: the map edge stays blocked exactly as before.
 */
import { MAP_H, MAP_W, tileAt, type TileKind } from '../world/starterArea.ts';
import { hash2 } from './color.ts';

/** How far the painted ground extends past the playable map, in tiles. */
export const OUTSKIRTS = 8;

export type GroundFrame =
  | `laterite-${0 | 1 | 2 | 3}` | `grass-${0 | 1 | 2}` | `edge-${0 | 1}`
  | 'road' | 'road-north' | 'road-south' | 'road-lane-north' | 'road-lane-south'
  | 'pavement' | 'pavement-kerb-south' | 'pavement-kerb-north'
  | 'gutter' | 'slab' | `courtyard-${0 | 1}`;

export const GROUND_FRAMES: readonly GroundFrame[] = [
  'laterite-0', 'laterite-1', 'laterite-2', 'laterite-3', 'grass-0', 'grass-1', 'grass-2', 'edge-0', 'edge-1',
  'road', 'road-north', 'road-south', 'road-lane-north', 'road-lane-south',
  'pavement', 'pavement-kerb-south', 'pavement-kerb-north', 'gutter', 'slab', 'courtyard-0', 'courtyard-1',
];

export const insideMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** Smooth 0..1 value noise over the grid (cluster size ~4 tiles), for grass patches. */
export function grassiness(x: number, y: number): number {
  const s = 4;
  const gx = Math.floor(x / s); const gy = Math.floor(y / s);
  const fx = x / s - gx; const fy = y / s - gy;
  const v = (i: number, j: number) => (hash2(gx + i, gy + j) % 1000) / 1000;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sm(fx);
  const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sm(fx);
  return a + (b - a) * sm(fy);
}

/** The logical material of any tile, including the outskirts (where the street rows continue). */
export function materialAt(x: number, y: number): TileKind {
  if (insideMap(x, y)) return tileAt(x, y);
  // The street rows (gutter, pavements, road) carry on; x = 1 is a plain stretch of each (no slab).
  if (y >= 7 && y <= 11) return tileAt(1, y);
  return 'laterite';
}

/** The art for tile (x, y). */
export function groundFrame(x: number, y: number): GroundFrame {
  const kind = materialAt(x, y);
  const h = hash2(x, y);
  switch (kind) {
    case 'road': {
      const lane = x % 2 === 0;
      if (y === 9) return lane ? 'road-lane-north' : 'road-north';
      if (y === 10) return lane ? 'road-lane-south' : 'road-south';
      return 'road';
    }
    case 'pavement': return y === 8 ? 'pavement-kerb-south' : y === 11 ? 'pavement-kerb-north' : 'pavement';
    case 'gutter': return 'gutter';
    case 'slab': return 'slab';
    case 'courtyard': return `courtyard-${(h % 2) as 0 | 1}`;
    default: {
      // Open ground (laterite or grass, which play the same): grass where the noise says so, or in the
      // map's grassy south-east corner; a sparse tufted edge between the two.
      const g = grassiness(x, y) + (x >= 14 && y >= 14 ? 0.35 : 0) + (kind === 'grass' ? 0.12 : 0);
      if (g > 0.66) return `grass-${(h % 3) as 0 | 1 | 2}`;
      if (g > 0.56) return `edge-${(h % 2) as 0 | 1}`;
      return `laterite-${(h % 4) as 0 | 1 | 2 | 3}`;
    }
  }
}
