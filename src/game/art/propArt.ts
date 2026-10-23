/**
 * Props and decoration, each painted once into its own texture with its feet at a known anchor.
 * Shapes are drawn in screen space around the anchor (the centre of the tile the prop stands on).
 */
import type Phaser from 'phaser';
import { IsoCanvas, RES, paintTrimmed, roundRect, trimOffset } from './canvasIso';
import { rgba, rng, shade } from './color';
import { PAL } from './palette';

export type ArtKind =
  | 'palm' | 'generator' | 'okada' | 'board' | 'bench'
  | 'lamp' | 'chairs' | 'drum' | 'pots' | 'tree' | 'tyres' | 'umbrella' | 'crates' | 'bush';

/** Texture size and anchor (world px). */
const SIZES: Record<ArtKind, { w: number; h: number; ax: number; ay: number }> = {
  palm: { w: 110, h: 120, ax: 55, ay: 108 },
  generator: { w: 50, h: 44, ax: 25, ay: 34 },
  okada: { w: 60, h: 48, ax: 30, ay: 38 },
  board: { w: 56, h: 72, ax: 28, ay: 62 },
  bench: { w: 60, h: 40, ax: 30, ay: 28 },
  lamp: { w: 50, h: 100, ax: 25, ay: 92 },
  chairs: { w: 64, h: 50, ax: 32, ay: 38 },
  drum: { w: 36, h: 44, ax: 18, ay: 36 },
  pots: { w: 56, h: 52, ax: 28, ay: 42 },
  tree: { w: 120, h: 130, ax: 60, ay: 118 },
  tyres: { w: 44, h: 46, ax: 22, ay: 36 },
  umbrella: { w: 80, h: 86, ax: 40, ay: 74 },
  crates: { w: 50, h: 50, ax: 25, ay: 40 },
  bush: { w: 60, h: 40, ax: 30, ay: 30 },
};

type C = CanvasRenderingContext2D;

function groundShadow(c: C, rx: number, ry: number, dx = 4, alpha = 0.28) {
  c.fillStyle = rgba(PAL.shadow, alpha);
  c.beginPath(); c.ellipse(dx * RES, 0, rx * RES, ry * RES, 0, 0, Math.PI * 2); c.fill();
}

/** groundShadow for painters that work through an IsoCanvas (no translation to the feet). */
function isoShadow(ic: IsoCanvas, rx: number, ry: number, dx = 4, alpha = 0.28) {
  const [x, y] = ic.p(0, 0);
  ic.ctx.save(); ic.ctx.translate(x, y); groundShadow(ic.ctx, rx, ry, dx, alpha); ic.ctx.restore();
}

/** Iso box centred on the anchor: (dx, dy) grid offset of its corner, size (w, d) tiles, height h px. */
function box(ic: IsoCanvas, dx: number, dy: number, w: number, d: number, h: number, color: string, z = 0) {
  ic.fill(ic.faceX(dx + w, dy, dy + d, z, z + h), shade(color, -0.25));
  ic.fill(ic.faceY(dy + d, dx, dx + w, z, z + h), shade(color, -0.05));
  ic.fill(ic.rect(dx, dy, dx + w, dy + d, z + h), shade(color, 0.15));
  ic.stroke([ic.p(dx, dy + d, z), ic.p(dx + w, dy + d, z), ic.p(dx + w, dy, z), ic.p(dx + w, dy, z + h), ic.p(dx, dy, z + h), ic.p(dx, dy + d, z + h)], rgba(PAL.outline, 0.5), 0.6);
}

function palm(c: C, r: () => number) {
  groundShadow(c, 22, 8, 10);
  c.save(); c.scale(RES, RES);
  // Trunk: tapered, leaning slightly, with ring scars.
  const top = { x: 6, y: -78 };
  c.fillStyle = '#7a5230';
  c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(-2, -40, top.x - 3, top.y); c.lineTo(top.x + 3, top.y); c.quadraticCurveTo(4, -40, 5, 0); c.closePath(); c.fill();
  c.fillStyle = rgba('#000', 0.22); c.beginPath(); c.moveTo(1, 0); c.quadraticCurveTo(2, -40, top.x + 0.5, top.y); c.lineTo(top.x + 3, top.y); c.quadraticCurveTo(4, -40, 5, 0); c.closePath(); c.fill();
  c.strokeStyle = rgba('#4a2e16', 0.55); c.lineWidth = 0.8;
  for (let i = 1; i < 14; i++) { const t = i / 14; const x = -0.5 + (top.x - 0.5) * t * t; const y = -t * 78; c.beginPath(); c.moveTo(x - 4 + t, y); c.quadraticCurveTo(x, y + 1.5, x + 4 - t, y); c.stroke(); }
  // Fronds: arching leaves, darker underneath, lighter on top.
  const fronds = 10;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r() * 0.3;
    const len = 34 + r() * 10; const ex = top.x + Math.cos(a) * len; const ey = top.y + Math.sin(a) * len * 0.45 + 14;
    const cx = top.x + Math.cos(a) * len * 0.5; const cy = top.y + Math.sin(a) * len * 0.2 - 12;
    const back = Math.sin(a) < 0;
    c.strokeStyle = back ? '#2a6e33' : '#3c9443'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(top.x, top.y); c.quadraticCurveTo(cx, cy, ex, ey); c.stroke();
    c.strokeStyle = back ? '#2f7a37' : '#56b052'; c.lineWidth = 1.1;
    for (let k = 2; k < 12; k++) { // leaflets
      const t = k / 12; const px = (1 - t) * (1 - t) * top.x + 2 * (1 - t) * t * cx + t * t * ex; const py = (1 - t) * (1 - t) * top.y + 2 * (1 - t) * t * cy + t * t * ey;
      const n = 6 * (1 - t * 0.5);
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.sin(a) * n * 0.6 + 1, py + n); c.stroke();
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - Math.sin(a) * n * 0.6 - 1, py + n * 0.8); c.stroke();
    }
  }
  for (const [x, y, col] of [[3, -76, '#6b8e2a'], [8, -75, '#7a5a1c'], [5, -72, '#5f7f24']] as const) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function tree(c: C, r: () => number) {
  groundShadow(c, 40, 13, 10, 0.3);
  c.save(); c.scale(RES, RES);
  c.fillStyle = '#6a4426'; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-3, -40); c.lineTo(-10, -56); c.lineTo(-6, -58); c.lineTo(0, -46); c.lineTo(6, -60); c.lineTo(9, -57); c.lineTo(4, -40); c.lineTo(6, 0); c.closePath(); c.fill();
  c.fillStyle = rgba('#000', 0.25); c.fillRect(1, -40, 5, 40);
  const blobs: [number, number, number][] = [[-26, -68, 20], [24, -70, 21], [0, -86, 26], [-14, -96, 18], [16, -98, 17], [0, -64, 22]];
  for (const [x, y, s] of blobs) { c.fillStyle = '#2f6f34'; c.beginPath(); c.arc(x, y + 3, s, 0, Math.PI * 2); c.fill(); }
  for (const [x, y, s] of blobs) {
    const g = c.createRadialGradient(x - s * 0.35, y - s * 0.4, 1, x, y, s);
    g.addColorStop(0, '#7cc456'); g.addColorStop(0.6, '#4a9a40'); g.addColorStop(1, '#2f7436');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 40; i++) { c.fillStyle = rgba(r() < 0.5 ? '#9fd970' : '#235a2a', 0.5); c.beginPath(); c.arc(-36 + r() * 72, -112 + r() * 60, 1.2 + r() * 1.4, 0, Math.PI * 2); c.fill(); }
  for (let i = 0; i < 7; i++) { c.fillStyle = r() < 0.5 ? '#f2b632' : '#e07b2a'; c.beginPath(); c.ellipse(-28 + r() * 56, -60 - r() * 40, 1.8, 2.4, 0, 0, Math.PI * 2); c.fill(); } // mangoes
  c.restore();
}

function bush(c: C, r: () => number) {
  groundShadow(c, 24, 8, 6, 0.25);
  c.save(); c.scale(RES, RES);
  for (const [x, y, s] of [[-12, -10, 11], [10, -11, 12], [0, -17, 12]] as const) {
    const g = c.createRadialGradient(x - 3, y - 4, 1, x, y, s);
    g.addColorStop(0, '#78c055'); g.addColorStop(1, '#2f7436');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
  }
  for (let i = 0; i < 5; i++) { c.fillStyle = r() < 0.5 ? '#e64f8a' : '#fff6e5'; c.beginPath(); c.arc(-18 + r() * 36, -24 + r() * 16, 1.4, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

function generator(ic: IsoCanvas) {
  isoShadow(ic, 16, 6, 4);
  box(ic, -0.3, -0.22, 0.6, 0.44, 16, '#d94b3a');
  box(ic, -0.12, -0.1, 0.25, 0.2, 5, '#f2b632', 16);
  const [x, y] = ic.p(0.3, -0.05, 10);
  ic.ctx.fillStyle = '#2d2a2e'; ic.ctx.fillRect(x, y - 1 * RES, 5 * RES, 2 * RES); // exhaust
  ic.stroke([ic.p(-0.32, 0.24, 0), ic.p(0.32, 0.24, 0), ic.p(0.32, 0.24, 18), ic.p(-0.32, 0.24, 18)], '#26262b', 1.2);
}

function okada(c: C) {
  groundShadow(c, 22, 6, 4);
  c.save(); c.scale(RES, RES);
  const wheel = (x: number) => { c.fillStyle = '#18181b'; c.beginPath(); c.ellipse(x, -7, 7, 7, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#a4a7ad'; c.beginPath(); c.ellipse(x, -7, 3, 3, 0, 0, Math.PI * 2); c.fill(); };
  wheel(-13); wheel(13);
  c.strokeStyle = '#c9ccd2'; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, -10); c.lineTo(10, -2); c.stroke(); // exhaust
  c.fillStyle = '#2d2a2e'; c.beginPath(); c.moveTo(-12, -10); c.lineTo(8, -10); c.lineTo(13, -7); c.lineTo(-4, -6); c.closePath(); c.fill(); // frame
  const g = c.createLinearGradient(0, -24, 0, -12); g.addColorStop(0, '#ef6a52'); g.addColorStop(1, '#b8321f');
  c.fillStyle = g; roundRect(c, -8, -24, 16, 9, 4); c.fill(); // tank
  c.fillStyle = '#1d1c20'; roundRect(c, -16, -21, 13, 5, 2.5); c.fill(); // seat
  c.fillStyle = '#d94b3a'; c.beginPath(); c.arc(-13, -12, 7.5, Math.PI * 1.05, Math.PI * 1.95); c.fill(); c.beginPath(); c.arc(13, -12, 7.5, Math.PI * 1.05, Math.PI * 1.95); c.fill(); // mudguards
  c.strokeStyle = '#2d2a2e'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(13, -7); c.lineTo(10, -26); c.stroke(); // fork
  c.lineWidth = 1.5; c.beginPath(); c.moveTo(6, -28); c.lineTo(14, -27); c.stroke(); // handlebar
  c.fillStyle = '#fff6c2'; c.beginPath(); c.arc(13.5, -22, 2.4, 0, Math.PI * 2); c.fill(); // headlamp
  c.strokeStyle = '#555'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(8, -28); c.lineTo(6, -33); c.stroke(); c.fillStyle = '#9fd6ee'; c.fillRect(4.5, -35, 3, 2.5); // mirror
  c.restore();
}

function board(ic: IsoCanvas, r: () => number) {
  isoShadow(ic, 18, 5, 5, 0.22);
  ic.onWallY(0.1, -0.55, 50, (c) => {
    c.fillStyle = '#5b3a1a'; c.fillRect(4, 18, 3, 32); c.fillRect(28, 18, 3, 32);
    c.fillStyle = '#7d8590'; c.beginPath(); c.moveTo(-1, 2); c.lineTo(36, 2); c.lineTo(33, -3); c.lineTo(2, -3); c.closePath(); c.fill(); // little zinc roof
    c.fillStyle = '#8a5a34'; c.fillRect(0, 2, 35, 24);
    c.fillStyle = '#d9b77c'; c.fillRect(2, 4, 31, 20); // cork
    const cols = ['#fff6e5', '#ffd978', '#c8ecd7', '#f0a17f', '#8d9be0'];
    for (let i = 0; i < 5; i++) { c.fillStyle = cols[i]!; c.fillRect(3 + (i % 3) * 10 + r() * 2, 5 + Math.floor(i / 3) * 9 + r() * 2, 8, 7); c.fillStyle = '#d94b3a'; c.beginPath(); c.arc(7 + (i % 3) * 10, 6 + Math.floor(i / 3) * 9, 0.8, 0, Math.PI * 2); c.fill(); }
  });
}

function bench(ic: IsoCanvas) {
  isoShadow(ic, 20, 6, 4);
  for (const dx of [-0.5, 0.42]) box(ic, dx, -0.1, 0.08, 0.2, 9, '#4a3020');
  box(ic, -0.6, -0.15, 1.2, 0.3, 3, PAL.woodLight, 9);
  box(ic, -0.6, -0.17, 1.2, 0.05, 10, PAL.wood, 12);
}

function lamp(c: C) {
  groundShadow(c, 9, 3.5, 3, 0.25);
  c.save(); c.scale(RES, RES);
  c.fillStyle = '#3a4048'; c.fillRect(-3.5, -6, 7, 6);
  const g = c.createLinearGradient(-2, 0, 2, 0); g.addColorStop(0, '#6c7480'); g.addColorStop(1, '#2c3138');
  c.fillStyle = g; c.fillRect(-1.6, -82, 3.2, 78);
  c.strokeStyle = '#3a4048'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, -80); c.quadraticCurveTo(2, -88, 14, -86); c.stroke();
  c.fillStyle = '#2c3138'; c.beginPath(); c.moveTo(9, -88); c.lineTo(21, -88); c.lineTo(19, -83); c.lineTo(11, -83); c.closePath(); c.fill();
  c.fillStyle = '#fff1b8'; c.fillRect(12, -83, 6, 1.6);
  c.fillStyle = '#12935a'; c.fillRect(-1.6, -40, 3.2, 10); // painted band
  c.restore();
}

function chairs(c: C) {
  groundShadow(c, 24, 7, 4, 0.22);
  c.save(); c.scale(RES, RES);
  const chair = (x: number, flip: number) => {
    c.fillStyle = '#f4f4f0'; c.strokeStyle = rgba('#7d7d78', 0.8); c.lineWidth = 0.6;
    c.fillRect(x - 5, -12, 10, 3); c.strokeRect(x - 5, -12, 10, 3);
    c.beginPath(); c.moveTo(x - 5 * flip, -12); c.lineTo(x - 6 * flip, -24); c.lineTo(x - 1 * flip, -24); c.lineTo(x, -12); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#dcdcd6'; c.fillRect(x - 4.5, -9, 1.2, 9); c.fillRect(x + 3.3, -9, 1.2, 9);
  };
  chair(-14, 1); chair(15, -1);
  c.fillStyle = '#e9e6dc'; c.fillRect(-1, -14, 2, 14); // table
  c.fillStyle = '#d94b3a'; c.beginPath(); c.ellipse(0, -16, 10, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff6e5'; c.beginPath(); c.ellipse(-2, -17, 2.4, 1.1, 0, 0, Math.PI * 2); c.fill(); // a plate
  c.fillStyle = '#7a4f2c'; c.fillRect(3, -22, 2, 5); // a bottle
  c.restore();
}

function drum(c: C) {
  groundShadow(c, 11, 4, 3, 0.25);
  c.save(); c.scale(RES, RES);
  const g = c.createLinearGradient(-9, 0, 9, 0); g.addColorStop(0, '#3a8ec4'); g.addColorStop(1, '#1d5478');
  c.fillStyle = g; c.fillRect(-9, -24, 18, 22); c.beginPath(); c.ellipse(0, -2, 9, 3.5, 0, 0, Math.PI); c.fill();
  c.strokeStyle = rgba('#0f2f45', 0.7); c.lineWidth = 1; for (const y of [-17, -9]) { c.beginPath(); c.ellipse(0, y, 9, 3.5, 0, 0, Math.PI); c.stroke(); }
  c.fillStyle = '#16242c'; c.beginPath(); c.ellipse(0, -24, 9, 3.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff6e5'; c.font = 'bold 4px sans-serif'; c.textAlign = 'center'; c.fillText('BIN', 0, -12);
  c.restore();
}

function pots(c: C, r: () => number) {
  groundShadow(c, 22, 6, 4, 0.22);
  c.save(); c.scale(RES, RES);
  const pot = (x: number, s: number, flowers: string) => {
    for (let i = 0; i < 9; i++) { c.strokeStyle = i % 2 ? '#3c9443' : '#2a6e33'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, -s * 1.1); c.quadraticCurveTo(x + (r() - 0.5) * 14, -s * 2.2, x + (r() - 0.5) * 18, -s * 2.3 - r() * 6); c.stroke(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = flowers; c.beginPath(); c.arc(x + (r() - 0.5) * 16, -s * 2.1 - r() * 8, 1.7, 0, Math.PI * 2); c.fill(); }
    const g = c.createLinearGradient(x - s, 0, x + s, 0); g.addColorStop(0, '#d2794a'); g.addColorStop(1, '#8e4220');
    c.fillStyle = g; c.beginPath(); c.moveTo(x - s, -s * 1.2); c.lineTo(x + s, -s * 1.2); c.lineTo(x + s * 0.7, 0); c.lineTo(x - s * 0.7, 0); c.closePath(); c.fill();
    c.fillStyle = '#b5552c'; c.fillRect(x - s - 1, -s * 1.3, s * 2 + 2, 2.5);
  };
  pot(-10, 7, '#e64f8a'); pot(10, 8, '#ffd45c');
  c.restore();
}

function tyres(c: C) {
  groundShadow(c, 15, 5, 4, 0.25);
  c.save(); c.scale(RES, RES);
  for (let i = 0; i < 3; i++) {
    const y = -5 - i * 7;
    c.fillStyle = i === 1 ? '#e9e6dc' : '#1b1b1f'; c.beginPath(); c.ellipse(0, y, 13, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = i === 1 ? '#bdbab0' : '#2e2e34'; c.beginPath(); c.ellipse(0, y - 1.5, 12, 4.5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0d0d10'; c.beginPath(); c.ellipse(0, y - 1.5, 6, 2.4, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

function umbrella(c: C) {
  groundShadow(c, 30, 10, 12, 0.22);
  c.save(); c.scale(RES, RES);
  c.fillStyle = '#c9ccd2'; c.fillRect(-1, -60, 2, 60);
  c.fillStyle = '#7a4f2c'; c.fillRect(-9, -14, 18, 3); c.fillRect(-7, -11, 2, 11); c.fillRect(5, -11, 2, 11); // stall table
  c.fillStyle = '#f2b632'; c.fillRect(-7, -18, 4, 4); c.fillStyle = '#d94b3a'; c.fillRect(-2, -18, 4, 4); c.fillStyle = '#12935a'; c.fillRect(3, -17, 4, 3);
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI + (i / segs) * Math.PI; const a1 = Math.PI + ((i + 1) / segs) * Math.PI;
    c.fillStyle = i % 2 ? '#fff6e5' : '#12935a';
    c.beginPath(); c.moveTo(0, -70); c.lineTo(Math.cos(a0) * 36, -56 + Math.sin(a0) * -4); c.lineTo(Math.cos(a1) * 36, -56 + Math.sin(a1) * -4); c.closePath(); c.fill();
  }
  c.fillStyle = rgba('#000', 0.15); c.beginPath(); c.moveTo(0, -70); c.lineTo(36, -56); c.lineTo(10, -57); c.closePath(); c.fill();
  c.restore();
}

function crates(ic: IsoCanvas) {
  isoShadow(ic, 16, 6, 4, 0.25);
  const cols = ['#d94b3a', '#f2b632', '#12935a'];
  box(ic, -0.3, -0.25, 0.5, 0.45, 9, cols[0]!);
  box(ic, -0.3, -0.25, 0.5, 0.45, 9, cols[1]!, 9);
  box(ic, -0.25, -0.2, 0.45, 0.4, 9, cols[2]!, 18);
  const c = ic.ctx; // bottle caps peeping out of the top crate
  for (let i = 0; i < 6; i++) { const [x, y] = ic.p(-0.2 + (i % 3) * 0.13, -0.12 + Math.floor(i / 3) * 0.16, 27); c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(x, y, 1.6 * RES, 0, Math.PI * 2); c.fill(); }
}

export const artKey = (k: ArtKind) => `osl-art-${k}`;

/** Paint every prop texture once per game. */
export function installProps(scene: Phaser.Scene) {
  (Object.keys(SIZES) as ArtKind[]).forEach((k, i) => {
    const key = artKey(k);
    if (scene.textures.exists(key)) return;
    const s = SIZES[k];
    paintTrimmed(scene, key, s.w, s.h, (c) => paintProp(c, k, s, i));
  });
}

function paintProp(c: CanvasRenderingContext2D, k: ArtKind, s: (typeof SIZES)[ArtKind], i: number) {
  {
    const ic = new IsoCanvas(c, -s.ax, -s.ay);
    const r = rng(500 + i * 13);
    c.save(); c.translate(s.ax * RES, s.ay * RES); // screen-space painters draw around (0, 0) = the feet
    switch (k) {
      case 'palm': palm(c, r); break;
      case 'tree': tree(c, r); break;
      case 'bush': bush(c, r); break;
      case 'okada': okada(c); break;
      case 'lamp': lamp(c); break;
      case 'chairs': chairs(c); break;
      case 'drum': drum(c); break;
      case 'pots': pots(c, r); break;
      case 'tyres': tyres(c); break;
      case 'umbrella': umbrella(c); break;
      default: break;
    }
    c.restore();
    switch (k) { // iso painters work in grid space through the IsoCanvas
      case 'generator': generator(ic); break;
      case 'board': board(ic, r); break;
      case 'bench': bench(ic); break;
      case 'crates': crates(ic); break;
      default: break;
    }
  }
}

/** Add a prop image with its feet at screen point (x, y). */
export function addProp(scene: Phaser.Scene, k: ArtKind, x: number, y: number): Phaser.GameObjects.Image {
  const s = SIZES[k]; const o = trimOffset(scene, artKey(k));
  const img = scene.add.image(x, y, artKey(k)).setScale(1 / RES);
  return img.setOrigin((s.ax - o.x) * RES / img.width, (s.ay - o.y) * RES / img.height);
}
