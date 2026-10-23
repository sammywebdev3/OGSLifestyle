/**
 * Paints every ground tile variant into one atlas texture (frames named by GroundFrame).
 * The world floor is then a single Blitter: one draw call, however many tiles.
 */
import type Phaser from 'phaser';
import { IsoCanvas, RES, roundRect } from './canvasIso';
import { rng, shade, rgba } from './color';
import { PAL } from './palette';
import { GROUND_FRAMES, type GroundFrame } from './groundLayout';

export const GROUND_KEY = 'osl-ground';
/** Atlas cell in texture px: a 64×32 tile at RES 2 plus a margin for tufts that overhang. */
const CELL_W = 144; const CELL_H = 80; const COLS = 6;
/** Where the tile's top corner sits inside its cell (texture px). */
const TOP_X = 72; const TOP_Y = 8;
/** Bob offset from the tile's top corner, in world px. */
export const GROUND_OFFSET = { x: -TOP_X / RES, y: -TOP_Y / RES };

type C = CanvasRenderingContext2D;
const EXPAND = 0.7; // overlap neighbours slightly so no seams show between tiles

function base(c: C, color: string) { c.fillStyle = color; c.fillRect(-EXPAND, -EXPAND, 32 + EXPAND * 2, 32 + EXPAND * 2); }
function blotches(c: C, r: () => number, n: number, colors: string[], alpha: [number, number], size: [number, number]) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rgba(colors[Math.floor(r() * colors.length)]!, alpha[0] + r() * (alpha[1] - alpha[0]));
    c.beginPath(); c.ellipse(1 + r() * 30, 1 + r() * 30, size[0] + r() * (size[1] - size[0]), size[0] + r() * (size[1] - size[0]) * 0.8, r() * 3, 0, Math.PI * 2); c.fill();
  }
}
function speckle(c: C, r: () => number, n: number, light: string, dark: string, alpha = 0.35) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = rgba(r() < 0.5 ? light : dark, alpha * (0.5 + r() * 0.5));
    c.fillRect(r() * 32, r() * 32, 0.5 + r() * 0.6, 0.5 + r() * 0.6);
  }
}
/** Short vertical strokes in screen space (grass blades), rooted at random ground points. */
function blades(ic: IsoCanvas, r: () => number, n: number, colors: string[], len: [number, number], inset = 0) {
  const c = ic.ctx;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const [x, y] = ic.p(inset + r() * (1 - 2 * inset), inset + r() * (1 - 2 * inset));
    const l = (len[0] + r() * (len[1] - len[0])) * RES;
    c.strokeStyle = colors[Math.floor(r() * colors.length)]!;
    c.lineWidth = 0.7 * RES;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 2 * RES, y - l); c.stroke();
  }
}

function laterite(ic: IsoCanvas, seed: number) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, shade(PAL.laterite, (r() - 0.5) * 0.04));
    blotches(c, r, 10, [PAL.lateriteLight, PAL.lateriteDark, '#b85f37'], [0.12, 0.28], [2, 6]);
    speckle(c, r, 90, '#efc09a', '#7d3a1e', 0.4);
    // Pebbles with a little shadow.
    for (let i = 0; i < 6; i++) {
      const u = 2 + r() * 28; const v = 2 + r() * 28; const s = 0.6 + r() * 0.8;
      c.fillStyle = rgba('#6e3218', 0.35); c.beginPath(); c.ellipse(u + 0.4, v + 0.4, s, s * 0.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e6b58f'; c.beginPath(); c.ellipse(u, v, s, s * 0.8, 0, 0, Math.PI * 2); c.fill();
    }
    if (r() < 0.5) { // a dry crack
      c.strokeStyle = rgba('#6e3218', 0.3); c.lineWidth = 0.35;
      c.beginPath(); let u = 4 + r() * 24; let v = 4 + r() * 24; c.moveTo(u, v);
      for (let i = 0; i < 4; i++) { u += (r() - 0.5) * 8; v += (r() - 0.3) * 6; c.lineTo(u, v); }
      c.stroke();
    }
  });
}

function grass(ic: IsoCanvas, seed: number) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, shade(PAL.grass, (r() - 0.5) * 0.05));
    blotches(c, r, 12, [PAL.grassDark, PAL.grassLight, '#5aa346'], [0.18, 0.35], [2, 6]);
    speckle(c, r, 60, '#b7e08a', '#2f6e2a', 0.4);
  });
  blades(ic, r, 34, [PAL.grassDark, '#3f8236', PAL.grassLight, '#a6d96f'], [2, 4.5], 0.04);
  // A few wild flowers.
  for (let i = 0; i < 3; i++) {
    const [x, y] = ic.p(0.15 + r() * 0.7, 0.15 + r() * 0.7);
    ic.ctx.fillStyle = r() < 0.5 ? '#fff6e5' : '#ffd45c';
    ic.ctx.beginPath(); ic.ctx.arc(x, y - 3 * RES, 1 * RES, 0, Math.PI * 2); ic.ctx.fill();
  }
}

function edge(ic: IsoCanvas, seed: number) {
  laterite(ic, seed);
  const r = rng(seed + 7);
  ic.onGround(0, 0, 0, (c) => blotches(c, r, 5, [PAL.grass, PAL.grassDark], [0.55, 0.8], [2.5, 5]));
  blades(ic, r, 16, [PAL.grassDark, PAL.grass, PAL.grassLight], [1.5, 3.5], 0.08);
}

function road(ic: IsoCanvas, seed: number, edgeAt: 'north' | 'south' | null, lane: boolean) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, PAL.asphalt);
    speckle(c, r, 160, '#6a6c78', '#25262d', 0.45);
    blotches(c, r, 4, ['#33353e', '#474a55'], [0.25, 0.45], [3, 7]);
    if (r() < 0.35) { c.fillStyle = rgba('#30323a', 0.6); c.fillRect(6 + r() * 10, 6 + r() * 10, 8 + r() * 6, 5 + r() * 4); } // patched pothole
    if (edgeAt === 'north') { const g = c.createLinearGradient(0, 0, 0, 5); g.addColorStop(0, rgba('#1d1e24', 0.7)); g.addColorStop(1, rgba('#1d1e24', 0)); c.fillStyle = g; c.fillRect(-EXPAND, -EXPAND, 32 + 2 * EXPAND, 5 + EXPAND); }
    if (edgeAt === 'south') { const g = c.createLinearGradient(0, 27, 0, 32); g.addColorStop(0, rgba('#1d1e24', 0)); g.addColorStop(1, rgba('#1d1e24', 0.6)); c.fillStyle = g; c.fillRect(-EXPAND, 27, 32 + 2 * EXPAND, 5 + EXPAND); }
    if (lane) {
      c.fillStyle = '#f5c445';
      if (edgeAt === 'north') c.fillRect(7, 30.2, 18, 1.8 + EXPAND); else c.fillRect(7, -EXPAND, 18, 1.8 + EXPAND);
    }
  });
}

function pavement(ic: IsoCanvas, seed: number, kerb: 'south' | 'north' | null) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, PAL.paverDark);
    const rows = 6; const h = 32 / rows;
    for (let i = 0; i < rows; i++) {
      const off = i % 2 ? 4 : 0;
      for (let u = -off; u < 32; u += 8) {
        c.fillStyle = shade(PAL.paver, (r() - 0.5) * 0.1);
        roundRect(c, u + 0.45, i * h + 0.45, 7.1, h - 0.9, 1); c.fill();
      }
    }
    speckle(c, r, 50, '#ffffff', '#5e574b', 0.25);
    const band = (v0: number) => {
      for (let u = 0; u < 32; u += 8) { c.fillStyle = (u / 8) % 2 ? '#e9e4d8' : '#34343b'; c.fillRect(u - EXPAND / 2, v0, 8 + EXPAND, 4.5); }
      c.fillStyle = rgba('#ffffff', 0.35); c.fillRect(-EXPAND, v0, 32 + 2 * EXPAND, 0.8);
    };
    if (kerb === 'south') { band(27.5); c.fillStyle = rgba('#111', 0.45); c.fillRect(-EXPAND, 31.4, 32 + 2 * EXPAND, 0.6 + EXPAND); }
    if (kerb === 'north') { band(0); }
  });
}

function gutter(ic: IsoCanvas, seed: number) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, PAL.concrete);
    speckle(c, r, 60, '#d8d2c6', '#5e5a52', 0.35);
    // The far inner wall of the open drain (faces the viewer), then the murky water.
    c.fillStyle = '#7a756c'; c.fillRect(-EXPAND, 6, 32 + 2 * EXPAND, 6);
    const g = c.createLinearGradient(0, 12, 0, 26);
    g.addColorStop(0, '#26302b'); g.addColorStop(1, '#3a4a3e');
    c.fillStyle = g; c.fillRect(-EXPAND, 12, 32 + 2 * EXPAND, 14);
    c.strokeStyle = rgba('#9fb8a6', 0.35); c.lineWidth = 0.4;
    for (let i = 0; i < 3; i++) { const v = 14 + r() * 10; const u = r() * 20; c.beginPath(); c.moveTo(u, v); c.lineTo(u + 6 + r() * 6, v); c.stroke(); }
    c.fillStyle = rgba('#000', 0.35); c.fillRect(-EXPAND, 5.4, 32 + 2 * EXPAND, 0.8); c.fillRect(-EXPAND, 25.6, 32 + 2 * EXPAND, 0.6);
    c.fillStyle = rgba('#fff', 0.25); c.fillRect(-EXPAND, 26.2, 32 + 2 * EXPAND, 0.6);
  });
}

function slab(ic: IsoCanvas, seed: number) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, PAL.concrete);
    c.fillStyle = '#b3ada2'; c.fillRect(1.5, 3, 29, 26);
    speckle(c, r, 80, '#e6e0d4', '#5e5a52', 0.35);
    c.strokeStyle = rgba('#4a463f', 0.5); c.lineWidth = 0.4; c.strokeRect(1.5, 3, 29, 26);
    c.strokeStyle = rgba('#4a463f', 0.3); c.beginPath(); c.moveTo(6, 8); c.lineTo(14, 15); c.lineTo(12, 24); c.stroke();
    c.fillStyle = rgba('#fff', 0.3); c.fillRect(1.5, 3, 29, 0.7);
  });
}

function courtyard(ic: IsoCanvas, seed: number) {
  const r = rng(seed);
  ic.onGround(0, 0, 0, (c) => {
    base(c, shade(PAL.courtyard, -0.12));
    for (let u = 0; u < 32; u += 8) for (let v = 0; v < 32; v += 8) {
      c.fillStyle = shade(PAL.courtyard, (r() - 0.5) * 0.08);
      c.fillRect(u + 0.4, v + 0.4, 7.2, 7.2);
    }
    speckle(c, r, 40, '#ffffff', '#8b7b5c', 0.3);
  });
}

function paintFrame(ic: IsoCanvas, f: GroundFrame, seed: number) {
  const [kind, variant] = f.split(/-(?=\d$)/);
  switch (kind) {
    case 'laterite': return laterite(ic, seed);
    case 'grass': return grass(ic, seed);
    case 'edge': return edge(ic, seed);
    case 'road': return road(ic, seed, null, false);
    case 'road-north': return road(ic, seed, 'north', false);
    case 'road-south': return road(ic, seed, 'south', false);
    case 'road-lane-north': return road(ic, seed, 'north', true);
    case 'road-lane-south': return road(ic, seed, 'south', true);
    case 'pavement': return pavement(ic, seed, null);
    case 'pavement-kerb-south': return pavement(ic, seed, 'south');
    case 'pavement-kerb-north': return pavement(ic, seed, 'north');
    case 'gutter': return gutter(ic, seed);
    case 'slab': return slab(ic, seed);
    case 'courtyard': return courtyard(ic, seed);
    default: throw new Error(`no painter for ground frame ${f} (${variant})`);
  }
}

/** Paint the ground atlas once per game (later scenes reuse it). */
export function installGround(scene: Phaser.Scene) {
  if (scene.textures.exists(GROUND_KEY)) return;
  const rows = Math.ceil(GROUND_FRAMES.length / COLS);
  const tex = scene.textures.createCanvas(GROUND_KEY, CELL_W * COLS, CELL_H * rows)!;
  const ctx = tex.getContext();
  GROUND_FRAMES.forEach((f, i) => {
    const cx = (i % COLS) * CELL_W; const cy = Math.floor(i / COLS) * CELL_H;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, CELL_W, CELL_H); ctx.clip(); // never paint into a neighbouring frame
    paintFrame(new IsoCanvas(ctx, -(cx + TOP_X) / RES, -(cy + TOP_Y) / RES), f, 1000 + i * 17);
    ctx.restore();
    tex.add(f, 0, cx, cy, CELL_W, CELL_H);
  });
  tex.refresh();
}
