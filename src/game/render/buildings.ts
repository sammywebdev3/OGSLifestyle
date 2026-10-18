import type Phaser from 'phaser';
import type { BuildingDef, PropDef } from '../world/starterArea';
import { box, faceX, faceY, fillPoly, isoPoint, top } from './isoDraw';
import { hex } from './colors';

/** Draws a building as an isometric block with windows, door, roof and optional water tank. */
export function drawBuilding(scene: Phaser.Scene, b: BuildingDef): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const { x, y, w, d, h } = b;
  const x1 = x + w; const y1 = y + d;
  // walls
  faceX(g, x1, y, y1, 0, h, b.wallShade);
  faceY(g, y1, x, x1, 0, h, b.wall);
  // skirting
  faceX(g, x1, y, y1, 0, 6, '#7b5a45');
  faceY(g, y1, x, x1, 0, 6, '#8d6a52');
  // windows (blue louvres with dark frames), one row per ~44px of height
  const rows = Math.max(1, Math.floor(h / 44));
  for (let r = 0; r < rows; r++) {
    const z0 = 16 + r * 44; const z1 = z0 + 20;
    for (let i = 0; i < b.windows; i++) {
      const t = (i + 0.5) / b.windows;
      const wx = x + t * w; const wy = y + t * d;
      if (b.door !== undefined && r === 0 && Math.abs(wx - (x + b.door)) < 0.6) continue;
      faceY(g, y1 + 0.001, wx - 0.3, wx + 0.3, z0 - 2, z1 + 2, '#2a2b33');
      faceY(g, y1 + 0.002, wx - 0.25, wx + 0.25, z0, z1, '#8fd3f4');
      faceX(g, x1 + 0.001, wy - 0.25, wy + 0.25, z0 - 2, z1 + 2, '#2a2b33');
      faceX(g, x1 + 0.002, wy - 0.2, wy + 0.2, z0, z1, '#6bb8dc');
    }
  }
  // door
  if (b.door !== undefined) faceY(g, y1 + 0.003, x + b.door - 0.3, x + b.door + 0.3, 0, 34, '#6b4226');
  // roof
  if (b.roof === 'flat') {
    top(g, x, y, x1, y1, h, '#d9d2c3');
    box(g, x, y, w, 0.12, 8, b.roofColor, b.roofColor, b.roofColor, h);
    box(g, x, y1 - 0.12, w, 0.12, 8, b.roofColor, b.roofColor, b.roofColor, h);
    box(g, x1 - 0.12, y, 0.12, d, 8, b.roofColor, b.roofColor, b.roofColor, h);
    if (b.tank) {
      const c = isoPoint(x + w * 0.3, y + d * 0.35, h);
      g.fillStyle(hex('#1c1c1c')); g.fillRect(c.x - 9, c.y - 26, 18, 26); g.fillEllipse(c.x, c.y - 26, 18, 8);
      g.fillStyle(hex('#3a3a3a')); g.fillEllipse(c.x, c.y - 26, 14, 5);
    }
  } else {
    // zinc roof: slightly overhanging slab with corrugation lines
    const o = 0.25;
    fillPoly(g, b.roofColor, [isoPoint(x - o, y - o, h + 10), isoPoint(x1 + o, y - o, h + 10), isoPoint(x1 + o, y1 + o, h), isoPoint(x - o, y1 + o, h)]);
    g.lineStyle(1, 0x000000, 0.15);
    for (let i = 0; i <= w * 4; i++) {
      const a = isoPoint(x - o + i / 4, y - o, h + 10); const c2 = isoPoint(x - o + i / 4, y1 + o, h);
      g.lineBetween(a.x, a.y, c2.x, c2.y);
    }
    // rust patches
    g.fillStyle(hex('#a0522d'), 0.35);
    const rp = isoPoint(x + w * 0.6, y + d * 0.5, h + 5); g.fillEllipse(rp.x, rp.y, 18, 7);
  }
  const container = scene.add.container(0, 0, [g]);
  if (b.sign) {
    const p = isoPoint(x + (b.door ?? w / 2), y1, Math.min(h - 8, 50));
    const t = scene.add.text(p.x, p.y, b.sign.text, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', fontStyle: 'bold', color: b.sign.fg, backgroundColor: b.sign.bg, padding: { x: 5, y: 2 } }).setOrigin(0.5, 1);
    container.add(t);
  }
  return container;
}

/** Small props: palms, generator, okadas, notice board, bench. Drawn with their feet at (0,0). */
export function drawProp(scene: Phaser.Scene, p: PropDef): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  if (p.kind === 'palm') {
    g.fillStyle(0x000000, 0.18); g.fillEllipse(0, 0, 34, 12);
    g.fillStyle(hex('#7a5230')); g.fillRect(-3, -70, 6, 70);
    g.fillStyle(hex('#2f8a3a'));
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; g.fillEllipse(Math.cos(a) * 16, -72 + Math.sin(a) * 6, 34, 9); }
    g.fillStyle(hex('#3fae4f')); g.fillCircle(0, -74, 7);
  } else if (p.kind === 'generator') {
    box(g, -0.35, -0.35, 0.7, 0.7, 20, '#e74c3c', '#a93226', '#c0392b');
  } else if (p.kind === 'okada') {
    g.fillStyle(0x000000, 0.2); g.fillEllipse(0, 0, 40, 10);
    g.fillStyle(hex('#1c1c1c')); g.fillCircle(-12, -8, 7); g.fillCircle(12, -8, 7);
    g.fillStyle(hex('#c0392b')); g.fillRoundedRect(-14, -22, 28, 10, 4);
    g.fillStyle(hex('#222')); g.fillRect(-8, -28, 16, 6);
  } else if (p.kind === 'board') {
    g.fillStyle(hex('#5b3a1a')); g.fillRect(-14, -34, 3, 34); g.fillRect(11, -34, 3, 34);
    g.fillStyle(hex('#fff6e5')); g.fillRect(-18, -52, 36, 24);
    g.lineStyle(2, hex('#12935a')); g.strokeRect(-18, -52, 36, 24);
  } else {
    box(g, -0.6, -0.15, 1.2, 0.3, 10, '#a57746', '#7a5230', '#8d6340');
  }
  return g;
}
