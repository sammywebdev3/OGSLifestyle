/**
 * Tiny isometric SVG kit used for the brand art (logo, landing skyline, apartment).
 * Same 2:1 projection as the game (src/game/iso/isoMath.ts): one grid unit = `u`
 * pixels across, u/2 down; height `h` is in pixels.
 */
import type { ReactNode } from 'react';

export const iso = (gx: number, gy: number, z = 0, u = 20) => ({ x: (gx - gy) * u, y: (gx + gy) * (u / 2) - z });
const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

export interface IsoBoxProps {
  x: number; y: number; w: number; d: number; h: number;
  top: string; left: string; right: string;
  u?: number; z?: number; stroke?: string; children?: ReactNode;
}

/** A box sitting on the ground: top face plus the two faces you can see. */
export function IsoBox({ x, y, w, d, h, top, left, right, u = 20, z = 0, stroke = 'rgba(0,0,0,0.18)' }: IsoBoxProps) {
  const b = (gx: number, gy: number, zz: number) => iso(gx, gy, zz, u);
  const lo = z; const hi = z + h;
  return (
    <g stroke={stroke} strokeWidth={0.8} strokeLinejoin="round">
      {/* left face: along y at x + w */}
      <polygon points={pts([b(x + w, y, lo), b(x + w, y + d, lo), b(x + w, y + d, hi), b(x + w, y, hi)])} fill={left} />
      {/* right face: along x at y + d */}
      <polygon points={pts([b(x, y + d, lo), b(x + w, y + d, lo), b(x + w, y + d, hi), b(x, y + d, hi)])} fill={right} />
      <polygon points={pts([b(x, y, hi), b(x + w, y, hi), b(x + w, y + d, hi), b(x, y + d, hi)])} fill={top} />
    </g>
  );
}

/** A flat diamond on the ground (tiles, roads, rugs). */
export function IsoTile({ x, y, w = 1, d = 1, fill, u = 20, z = 0 }: { x: number; y: number; w?: number; d?: number; fill: string; u?: number; z?: number }) {
  return <polygon points={pts([iso(x, y, z, u), iso(x + w, y, z, u), iso(x + w, y + d, z, u), iso(x, y + d, z, u)])} fill={fill} />;
}
