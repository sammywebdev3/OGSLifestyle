import type Phaser from 'phaser';
import { gridToScreen, TILE_H, TILE_W } from '../iso/isoMath';
import { hex } from './colors';

type G = Phaser.GameObjects.Graphics;
const P = (gx: number, gy: number, z = 0) => { const s = gridToScreen(gx, gy); return { x: s.x, y: s.y - z }; };

export function fillPoly(g: G, color: string, points: { x: number; y: number }[], alpha = 1) {
  g.fillStyle(hex(color), alpha);
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  g.closePath();
  g.fillPath();
}

export function strokePoly(g: G, color: string, points: { x: number; y: number }[], width = 1, alpha = 1) {
  g.lineStyle(width, hex(color), alpha);
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  g.closePath();
  g.strokePath();
}

export function tile(g: G, gx: number, gy: number, color: string) {
  fillPoly(g, color, [P(gx, gy), P(gx + 1, gy), P(gx + 1, gy + 1), P(gx, gy + 1)]);
}

/** Quad on the x = const face (screen-left visible face) between y0..y1 and z0..z1. */
export function faceX(g: G, x: number, y0: number, y1: number, z0: number, z1: number, color: string) {
  fillPoly(g, color, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]);
}
/** Quad on the y = const face (screen-right visible face) between x0..x1 and z0..z1. */
export function faceY(g: G, y: number, x0: number, x1: number, z0: number, z1: number, color: string) {
  fillPoly(g, color, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]);
}
export function top(g: G, x0: number, y0: number, x1: number, y1: number, z: number, color: string) {
  fillPoly(g, color, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)]);
}

/** Solid box from (x, y) with size (w, d) and height h (pixels). */
export function box(g: G, x: number, y: number, w: number, d: number, h: number, topC: string, leftC: string, rightC: string, z = 0) {
  faceX(g, x + w, y, y + d, z, z + h, leftC);
  faceY(g, y + d, x, x + w, z, z + h, rightC);
  top(g, x, y, x + w, y + d, z + h, topC);
}

export { P as isoPoint, TILE_W, TILE_H };
