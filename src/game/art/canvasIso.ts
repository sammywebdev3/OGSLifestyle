/**
 * Painting isometric shapes onto a 2D canvas that becomes a texture. Everything in the world is
 * painted once at load (no image files), then drawn by Phaser as plain textured quads.
 */
import type Phaser from 'phaser';
import { gridToScreen } from '../iso/isoMath';

/** Texture pixels per world pixel. 2 keeps art sharp on HiDPI phones and when the camera zooms in. */
export const RES = 2;

export type Pt = [number, number];

export class IsoCanvas {
  readonly ctx: CanvasRenderingContext2D;
  /** World-space position (screen px at zoom 1) of the canvas's top-left corner. */
  readonly ox: number;
  readonly oy: number;

  constructor(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
    this.ctx = ctx; this.ox = ox; this.oy = oy;
  }

  /** Grid point (gx, gy) at height z (px) → canvas pixel. */
  p(gx: number, gy: number, z = 0): Pt {
    const s = gridToScreen(gx, gy);
    return [(s.x - this.ox) * RES, (s.y - z - this.oy) * RES];
  }

  path(pts: Pt[]) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
    c.closePath();
  }

  fill(pts: Pt[], style: string | CanvasGradient) {
    this.path(pts);
    this.ctx.fillStyle = style;
    this.ctx.fill();
  }

  stroke(pts: Pt[], style: string, width = 1) {
    this.path(pts);
    this.ctx.strokeStyle = style;
    this.ctx.lineWidth = width * RES;
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  /** Ground-level quad (x0..x1, y0..y1) at height z. */
  rect(x0: number, y0: number, x1: number, y1: number, z = 0): Pt[] {
    return [this.p(x0, y0, z), this.p(x1, y0, z), this.p(x1, y1, z), this.p(x0, y1, z)];
  }

  /** Face on the plane y = const (faces the lower left of the screen: the lit side). */
  faceY(y: number, x0: number, x1: number, z0: number, z1: number): Pt[] {
    return [this.p(x0, y, z0), this.p(x1, y, z0), this.p(x1, y, z1), this.p(x0, y, z1)];
  }

  /** Face on the plane x = const (faces the lower right of the screen: the shaded side). */
  faceX(x: number, y0: number, y1: number, z0: number, z1: number): Pt[] {
    return [this.p(x, y0, z0), this.p(x, y1, z0), this.p(x, y1, z1), this.p(x, y0, z1)];
  }

  /**
   * Paint on the wall plane y = const as if it were flat paper: local u runs left→right along the
   * wall (screen px), v runs top→bottom (px), origin at (x0, y, zTop). Windows, doors and signs drawn
   * as rectangles come out correctly skewed.
   */
  onWallY(y: number, x0: number, zTop: number, paint: (c: CanvasRenderingContext2D) => void) {
    const [px, py] = this.p(x0, y, zTop);
    this.onPlane(RES, 0.5 * RES, px, py, paint);
  }

  /** Same for the wall plane x = const; u runs from y1 (screen left) towards y0 (screen right). */
  onWallX(x: number, y1: number, zTop: number, paint: (c: CanvasRenderingContext2D) => void) {
    const [px, py] = this.p(x, y1, zTop);
    this.onPlane(RES, -0.5 * RES, px, py, paint);
  }

  /** Paint on the ground plane at height z: local (u, v) in px along grid x and grid y, origin at (gx, gy). 32 px = 1 tile. */
  onGround(gx: number, gy: number, z: number, paint: (c: CanvasRenderingContext2D) => void) {
    const [px, py] = this.p(gx, gy, z);
    const c = this.ctx;
    c.save();
    c.setTransform(RES, 0.5 * RES, -RES, 0.5 * RES, px, py);
    paint(c);
    c.restore();
  }

  private onPlane(a: number, b: number, px: number, py: number, paint: (c: CanvasRenderingContext2D) => void) {
    const c = this.ctx;
    c.save();
    c.setTransform(a, b, 0, RES, px, py);
    paint(c);
    c.restore();
  }
}

/** Screen-space bounding box (world px) of grid points at given heights, plus a margin. */
export function screenBounds(points: [number, number, number][], margin = 8) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [gx, gy, z] of points) {
    const s = gridToScreen(gx, gy);
    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
    minY = Math.min(minY, s.y - z); maxY = Math.max(maxY, s.y - z);
  }
  const x = Math.floor(minX - margin); const y = Math.floor(minY - margin);
  return { x, y, w: Math.ceil(maxX + margin) - x, h: Math.ceil(maxY + margin) - y };
}

/** Rounded rectangle path in the current transform. */
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/**
 * Paint into a scratch canvas, then keep only the visible pixels as texture `key`: transparent
 * margins would otherwise cost memory (canvas textures live on the CPU and the GPU) and fill rate.
 * `w` and `h` are the scratch size in world px. Returns the kept region's offset from the scratch
 * origin in world px (add it to wherever the scratch canvas would have been placed).
 */
export function paintTrimmed(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): { x: number; y: number } {
  const scratch = document.createElement('canvas');
  scratch.width = Math.ceil(w * RES); scratch.height = Math.ceil(h * RES);
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
  paint(sctx);
  const { width, height } = scratch;
  const data = sctx.getImageData(0, 0, width, height).data;
  let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3]! > 4) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }
  const tex = scene.textures.createCanvas(key, x1 - x0 + 1, y1 - y0 + 1)!;
  tex.getContext().drawImage(scratch, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, x1 - x0 + 1, y1 - y0 + 1);
  tex.refresh();
  scratch.width = 0; scratch.height = 0; // release the scratch memory now
  tex.customData = { offsetX: x0 / RES, offsetY: y0 / RES };
  return { x: x0 / RES, y: y0 / RES };
}

/** The offset paintTrimmed recorded for texture `key` (world px). */
export function trimOffset(scene: Phaser.Scene, key: string): { x: number; y: number } {
  const d = scene.textures.get(key).customData as { offsetX?: number; offsetY?: number };
  return { x: d.offsetX ?? 0, y: d.offsetY ?? 0 };
}
