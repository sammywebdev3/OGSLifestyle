/**
 * Paints each building (walls, windows with burglar-proof bars, doors, roofs, water tanks,
 * awnings and signboards) into its own texture, plus a separate soft ground shadow.
 * Geometry comes from BuildingDef unchanged, so collision and depth sorting are untouched.
 */
import type Phaser from 'phaser';
import type { BuildingDef } from '../world/starterArea';
import { IsoCanvas, RES, paintTrimmed, roundRect, screenBounds, trimOffset, type Pt } from './canvasIso';
import { mix, rgba, rng, shade } from './color';
import { PAL, SIGN_FONT } from './palette';

/** Extra character per building (all optional, purely visual). */
export interface BuildingStyle {
  awning?: [string, string];
  /** A shop front: open doorway with a half-raised roller shutter. */
  shopfront?: boolean;
  /** A kiosk: a serving hatch instead of a door. */
  kiosk?: boolean;
  balcony?: boolean;
  clothesline?: boolean;
  ac?: boolean;
  /** Distant scenery: hazed, no sign. */
  backdrop?: boolean;
}

export const BUILDING_STYLES: Record<string, BuildingStyle> = {
  'kuto-court': { clothesline: true },
  buka: { awning: ['#d94b3a', '#fff6e5'], shopfront: true },
  pos: { awning: ['#12935a', '#fff6e5'], kiosk: true },
  storey: { balcony: true, ac: true },
  'shop-row': { awning: ['#3a4fb0', '#fff6e5'], shopfront: true },
};

const STOREY = 44;
const ZINC_RISE = 12;

/** Screen box (world px) a building's texture covers. */
export function buildingBox(b: BuildingDef) {
  const o = 0.7;
  const pts: [number, number, number][] = [];
  for (const gx of [b.x - o, b.x + b.w + o]) for (const gy of [b.y - o, b.y + b.d + o]) pts.push([gx, gy, 0], [gx, gy, b.h + 70]);
  return screenBounds(pts, 10);
}

/** Screen box of the building's ground shadow. */
export function shadowBox(b: BuildingDef) {
  const pts: [number, number, number][] = [];
  for (const gx of [b.x - 0.5, b.x + b.w + 2]) for (const gy of [b.y - 0.5, b.y + b.d + 0.5]) pts.push([gx, gy, 0]);
  return screenBounds(pts, 12);
}

type C = CanvasRenderingContext2D;

function window_(c: C, u: number, v: number, lit: boolean, r: () => number) {
  const w = 13; const h = 17;
  c.fillStyle = rgba('#000', 0.18); c.fillRect(u - w / 2 + 1, v + 1, w + 2, h + 2); // recess shadow
  c.fillStyle = PAL.frame; c.fillRect(u - w / 2 - 1.2, v - 1.2, w + 2.4, h + 2.4);
  const g = c.createLinearGradient(0, v, 0, v + h);
  g.addColorStop(0, lit ? '#bfe6f6' : '#7fb3cf'); g.addColorStop(1, lit ? '#5aa6cf' : '#2f6385');
  c.fillStyle = g; c.fillRect(u - w / 2, v, w, h);
  c.fillStyle = rgba('#fff', lit ? 0.35 : 0.18); // sky reflection
  c.beginPath(); c.moveTo(u - w / 2, v + h * 0.55); c.lineTo(u - w / 2 + w * 0.55, v); c.lineTo(u - w / 2 + w * 0.8, v); c.lineTo(u - w / 2, v + h * 0.9); c.closePath(); c.fill();
  if (r() < 0.35) { c.fillStyle = rgba(['#d94b3a', '#f2b632', '#12935a'][Math.floor(r() * 3)]!, 0.55); c.fillRect(u - w / 2, v, w * 0.4, h); } // a curtain
  c.strokeStyle = '#3b3b40'; c.lineWidth = 0.9; // burglar-proof bars
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(u - w / 2 + (w * i) / 4, v); c.lineTo(u - w / 2 + (w * i) / 4, v + h); c.stroke(); }
  c.beginPath(); c.moveTo(u - w / 2, v + h / 2); c.lineTo(u + w / 2, v + h / 2); c.stroke();
  c.fillStyle = '#efe6d2'; c.fillRect(u - w / 2 - 2.5, v + h + 1, w + 5, 2.2); // sill
  const s = c.createLinearGradient(0, v + h + 3, 0, v + h + 14); // rain streak under the sill
  s.addColorStop(0, rgba('#4a3a2a', 0.22)); s.addColorStop(1, rgba('#4a3a2a', 0));
  c.fillStyle = s; c.fillRect(u - w / 2, v + h + 3, w, 11);
}

function door(c: C, u: number, height: number, top: number) {
  const w = 16;
  c.fillStyle = PAL.frame; c.fillRect(u - w / 2 - 1.5, top - 1.5, w + 3, height + 1.5);
  const g = c.createLinearGradient(u - w / 2, 0, u + w / 2, 0);
  g.addColorStop(0, '#8a5a34'); g.addColorStop(1, '#5e3a20');
  c.fillStyle = g; c.fillRect(u - w / 2, top, w, height);
  c.strokeStyle = rgba('#2a160a', 0.6); c.lineWidth = 0.7;
  c.strokeRect(u - w / 2 + 2.5, top + 3, w - 5, height * 0.4); c.strokeRect(u - w / 2 + 2.5, top + height * 0.5, w - 5, height * 0.42);
  c.fillStyle = '#e8c46a'; c.beginPath(); c.arc(u + w / 2 - 3, top + height * 0.55, 0.9, 0, Math.PI * 2); c.fill();
}

function shopDoor(c: C, u: number, height: number, top: number) {
  const w = 24;
  c.fillStyle = PAL.frame; c.fillRect(u - w / 2 - 1.5, top - 1.5, w + 3, height + 1.5);
  const g = c.createLinearGradient(0, top, 0, top + height);
  g.addColorStop(0, '#1d1a1f'); g.addColorStop(1, '#3a2c26');
  c.fillStyle = g; c.fillRect(u - w / 2, top, w, height);
  c.fillStyle = '#8f8a84'; c.fillRect(u - w / 2, top, w, height * 0.32); // half-raised roller shutter
  c.strokeStyle = rgba('#4a4640', 0.7); c.lineWidth = 0.5;
  for (let y = top + 1.5; y < top + height * 0.32; y += 1.6) { c.beginPath(); c.moveTo(u - w / 2, y); c.lineTo(u + w / 2, y); c.stroke(); }
  c.fillStyle = '#c9a36a'; c.fillRect(u - w / 2 + 2, top + height * 0.62, w - 4, 3); // counter
  for (let i = 0; i < 4; i++) { c.fillStyle = ['#d94b3a', '#f2b632', '#12935a', '#fff6e5'][i]!; c.fillRect(u - w / 2 + 3 + i * 5, top + height * 0.5, 3.5, 4); } // goods
}

function hatch(c: C, u: number, top: number) {
  const w = 22; const h = 12;
  c.fillStyle = PAL.frame; c.fillRect(u - w / 2 - 1.5, top - 1.5, w + 3, h + 3);
  c.fillStyle = '#26222a'; c.fillRect(u - w / 2, top, w, h);
  c.fillStyle = '#c9a36a'; c.fillRect(u - w / 2 - 3, top + h, w + 6, 2.5);
  c.fillStyle = '#7cc7e8'; c.fillRect(u - 5, top + 3, 10, 6); // a phone screen glow
}

interface WallOpts { len: number; height: number; color: string; lit: boolean; windows: number; door?: number; style: BuildingStyle; seed: number; plinth: string }

function paintWall(c: C, o: WallOpts) {
  const r = rng(o.seed);
  const { len, height } = o;
  const g = c.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, shade(o.color, o.lit ? 0.08 : 0.02)); g.addColorStop(1, shade(o.color, o.lit ? -0.06 : -0.14));
  c.fillStyle = g; c.fillRect(-0.5, 0, len + 1, height);
  for (let i = 0; i < len * height * 0.05; i++) { // plaster texture
    c.fillStyle = rgba(r() < 0.5 ? '#ffffff' : '#5a4a3a', 0.06 + r() * 0.06);
    c.fillRect(r() * len, r() * height, 0.8, 0.8);
  }
  const storeys = Math.max(1, Math.round(height / STOREY));
  for (let s = 1; s < storeys; s++) { // floor slab band
    const v = height - s * (height / storeys);
    c.fillStyle = shade(o.color, -0.12); c.fillRect(-0.5, v - 1, len + 1, 3.5);
    c.fillStyle = rgba('#fff', 0.35); c.fillRect(-0.5, v - 1, len + 1, 0.8);
  }
  const dust = c.createLinearGradient(0, height - 18, 0, height); // red laterite dust splashed up the wall
  dust.addColorStop(0, rgba(PAL.laterite, 0)); dust.addColorStop(1, rgba(PAL.laterite, 0.28));
  c.fillStyle = dust; c.fillRect(-0.5, height - 18, len + 1, 18);
  c.fillStyle = o.plinth; c.fillRect(-0.5, height - 6, len + 1, 6);
  c.fillStyle = rgba('#000', 0.18); c.fillRect(-0.5, height - 6, len + 1, 0.8);

  const doorAt = o.door;
  const doorH = o.style.shopfront ? 30 : 31;
  if (o.windows > 0) for (let s = 0; s < storeys; s++) {
    const floorTop = height - (s + 1) * (height / storeys);
    for (let i = 0; i < o.windows; i++) {
      const u = ((i + 0.5) / o.windows) * len;
      if (s === 0 && doorAt !== undefined && Math.abs(u - doorAt) < (o.style.shopfront ? 22 : 16)) continue;
      window_(c, u, floorTop + Math.max(6, (height / storeys) * 0.22), o.lit, r);
    }
  }
  if (doorAt !== undefined) {
    if (o.style.kiosk) hatch(c, doorAt, height - 26);
    else if (o.style.shopfront) shopDoor(c, doorAt, doorH, height - doorH);
    else door(c, doorAt, doorH, height - doorH);
  }
  if (o.style.ac && !o.lit) { // split unit on the shaded side
    c.fillStyle = '#e9e9ec'; roundRect(c, len * 0.55, height * 0.32, 14, 8, 1.5); c.fill();
    c.strokeStyle = rgba('#666', 0.6); c.lineWidth = 0.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(len * 0.55 + 2, height * 0.32 + 2 + i * 1.5); c.lineTo(len * 0.55 + 12, height * 0.32 + 2 + i * 1.5); c.stroke(); }
  }
}

function sign(c: C, centerU: number, top: number, text: string, bg: string, fg: string) {
  c.font = `bold 9px ${SIGN_FONT}`;
  const w = Math.ceil(c.measureText(text).width) + 14; const h = 14;
  const x = centerU - w / 2;
  c.fillStyle = rgba('#000', 0.28); roundRect(c, x + 1.5, top + 2, w, h, 2); c.fill();
  const g = c.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, shade(bg, 0.12)); g.addColorStop(1, shade(bg, -0.1));
  c.fillStyle = g; roundRect(c, x, top, w, h, 2); c.fill();
  c.strokeStyle = shade(bg, -0.35); c.lineWidth = 1; roundRect(c, x + 0.5, top + 0.5, w - 1, h - 1, 2); c.stroke();
  c.fillStyle = rgba('#fff', 0.25); c.fillRect(x + 2, top + 1.5, w - 4, 1);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, centerU, top + h / 2 + 0.5);
  c.fillStyle = rgba('#000', 0.35); for (const bx of [x + 3, x + w - 3]) { c.beginPath(); c.arc(bx, top + h / 2, 0.7, 0, Math.PI * 2); c.fill(); }
  return w;
}

function tank(ic: IsoCanvas, gx: number, gy: number, z: number) {
  const c = ic.ctx;
  const [x, y] = ic.p(gx, gy, z);
  const R = 9 * RES; const H = 24 * RES;
  c.fillStyle = rgba('#000', 0.3); c.beginPath(); c.ellipse(x + 4 * RES, y + 1 * RES, R * 1.2, R * 0.55, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#55504a'; c.fillRect(x - R * 0.8, y - 4 * RES, R * 1.6, 4 * RES); // stand
  const g = c.createLinearGradient(x - R, 0, x + R, 0);
  g.addColorStop(0, '#3e3e45'); g.addColorStop(0.35, '#2a2a30'); g.addColorStop(1, '#141417');
  c.fillStyle = g; c.fillRect(x - R, y - 4 * RES - H, R * 2, H);
  c.beginPath(); c.ellipse(x, y - 4 * RES, R, R * 0.45, 0, 0, Math.PI); c.fill();
  c.strokeStyle = rgba('#5a5a64', 0.8); c.lineWidth = 0.8 * RES; // ribs
  for (let i = 1; i < 5; i++) { c.beginPath(); c.ellipse(x, y - 4 * RES - (H * i) / 5, R, R * 0.45, 0, 0, Math.PI); c.stroke(); }
  c.fillStyle = '#4a4a52'; c.beginPath(); c.ellipse(x, y - 4 * RES - H, R, R * 0.45, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#26262b'; c.beginPath(); c.ellipse(x, y - 4 * RES - H, R * 0.4, R * 0.18, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = rgba('#fff', 0.12); c.fillRect(x - R * 0.7, y - 4 * RES - H, R * 0.25, H);
}

function clothesline(ic: IsoCanvas, b: BuildingDef, z: number) {
  const c = ic.ctx;
  // Two poles along the roof's length, with a sagging line of washing between them.
  const a = ic.p(b.x + 1.6, b.y + 1.0, z); const d = ic.p(b.x + b.w - 0.5, b.y + 1.0, z);
  const poleH = 18 * RES;
  c.strokeStyle = '#6b6f78'; c.lineWidth = 1.2 * RES;
  for (const p of [a, d]) { c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - poleH); c.stroke(); }
  c.strokeStyle = rgba('#222', 0.7); c.lineWidth = 0.5 * RES;
  const mid: Pt = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2 - poleH + 4 * RES];
  c.beginPath(); c.moveTo(a[0], a[1] - poleH); c.quadraticCurveTo(mid[0], mid[1], d[0], d[1] - poleH); c.stroke();
  const cols = ['#d94b3a', '#f2b632', '#3a4fb0', '#12935a', '#fff6e5'];
  for (let i = 1; i <= 4; i++) {
    const t = i / 5; const x = a[0] + (d[0] - a[0]) * t; const y = (1 - t) * (1 - t) * (a[1] - poleH) + 2 * (1 - t) * t * mid[1] + t * t * (d[1] - poleH);
    c.fillStyle = cols[i % cols.length]!; c.fillRect(x - 3 * RES, y, 6 * RES, (6 + (i % 2) * 3) * RES);
    c.fillStyle = rgba('#000', 0.15); c.fillRect(x + 1 * RES, y, 2 * RES, (6 + (i % 2) * 3) * RES);
  }
}

/** A first-floor balcony: a slab with a solid balustrade pierced by a row of decorative openings. */
function balcony(ic: IsoCanvas, b: BuildingDef, z: number, color: string) {
  const x0 = b.x + b.w * 0.22; const x1 = b.x + b.w * 0.78; const y = b.y + b.d; const p = 0.38; const hh = 10;
  ic.fill(ic.faceY(y, x0, x1, z, z + hh + 6), rgba('#000', 0.12)); // its shadow on the wall
  ic.fill(ic.rect(x0, y, x1, y + p, z), shade(color, -0.12)); // floor
  ic.fill(ic.faceX(x1, y, y + p, z - 4, z + hh), shade(color, -0.28)); // side
  ic.fill(ic.faceY(y + p, x0, x1, z - 4, z + hh), shade(color, 0.02)); // front
  ic.onWallY(y + p, x0, z + hh, (c) => {
    const len = (x1 - x0) * 32; const n = Math.max(3, Math.round(len / 9));
    for (let i = 0; i < n; i++) { // breeze-block openings
      const u = 3 + (i * (len - 6)) / n;
      c.fillStyle = shade(color, -0.45); roundRect(c, u + 1, 3, (len - 6) / n - 2.5, 4.5, 1.5); c.fill();
    }
    c.fillStyle = shade(color, -0.25); c.fillRect(0, hh + 2, len, 2); // slab edge
  });
  ic.fill(ic.rect(x0, y + p - 0.06, x1, y + p, z + hh), shade(color, 0.18)); // coping
  ic.fill(ic.rect(x1 - 0.06, y, x1, y + p, z + hh), shade(color, 0.12));
  ic.stroke([ic.p(x0, y + p, z - 4), ic.p(x1, y + p, z - 4), ic.p(x1, y, z - 4), ic.p(x1, y, z + hh), ic.p(x1, y + p, z + hh), ic.p(x0, y + p, z + hh)], rgba(PAL.outline, 0.4), 0.6);
}

function awning(ic: IsoCanvas, b: BuildingDef, cols: [string, string]) {
  const y = b.y + b.d; const zt = b.h - 6; const drop = 9; const p = 0.55;
  const mid = b.x + (b.door ?? b.w / 2);
  const xa = Math.max(b.x + 0.05, mid - 0.95); const xb = Math.min(b.x + b.w - 0.05, mid + 0.95);
  ic.onWallY(y, xa, zt, (c) => { // its shadow on the wall
    const g = c.createLinearGradient(0, 0, 0, 14); g.addColorStop(0, rgba('#000', 0.3)); g.addColorStop(1, rgba('#000', 0));
    c.fillStyle = g; c.fillRect(0, 0, (xb - xa) * 32, 14);
  });
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = xa + ((xb - xa) * i) / n; const e = xa + ((xb - xa) * (i + 1)) / n;
    ic.fill([ic.p(a, y, zt), ic.p(e, y, zt), ic.p(e, y + p, zt - drop), ic.p(a, y + p, zt - drop)], i % 2 ? cols[1] : cols[0]);
  }
  const c = ic.ctx;
  const g = c.createLinearGradient(...ic.p(xa, y, zt), ...ic.p(xa, y + p, zt - drop));
  g.addColorStop(0, rgba('#000', 0.18)); g.addColorStop(1, rgba('#fff', 0.12));
  ic.fill([ic.p(xa, y, zt), ic.p(xb, y, zt), ic.p(xb, y + p, zt - drop), ic.p(xa, y + p, zt - drop)], g);
  ic.onWallY(y + p, xa, zt - drop, (cc) => { // scalloped valance
    const len = (xb - xa) * 32; const k = n * 2;
    for (let i = 0; i < k; i++) {
      cc.fillStyle = Math.floor(i / 2) % 2 ? cols[1] : cols[0];
      cc.beginPath(); cc.moveTo((len * i) / k, 0); cc.lineTo((len * (i + 1)) / k, 0); cc.arc((len * (i + 0.5)) / k, 2.5, len / k / 2, 0, Math.PI); cc.closePath(); cc.fill();
    }
    cc.fillStyle = rgba('#000', 0.15); cc.fillRect(0, 0, len, 1);
  });
  ic.fill([ic.p(xb, y, zt), ic.p(xb, y + p, zt - drop), ic.p(xb, y + p, zt - drop - 3)], shade(cols[0], -0.35));
}

function zincRoof(ic: IsoCanvas, b: BuildingDef, seed: number) {
  const r = rng(seed);
  const o = 0.25; const x0 = b.x - o; const x1 = b.x + b.w + o; const y0 = b.y - o; const y1 = b.y + b.d + o;
  const zb = b.h + ZINC_RISE; const zf = b.h - 2;
  const top = [ic.p(x0, y0, zb), ic.p(x1, y0, zb), ic.p(x1, y1, zf), ic.p(x0, y1, zf)];
  const c = ic.ctx;
  const g = c.createLinearGradient(...ic.p(x0, y0, zb), ...ic.p(x0, y1, zf));
  g.addColorStop(0, shade(b.roofColor, 0.18)); g.addColorStop(1, shade(b.roofColor, -0.08));
  ic.fill(top, g);
  const strips = Math.round((x1 - x0) * 5);
  for (let i = 0; i < strips; i++) { // corrugation
    const a = x0 + ((x1 - x0) * i) / strips; const e = a + (x1 - x0) / strips / 2;
    ic.fill([ic.p(a, y0, zb), ic.p(e, y0, zb), ic.p(e, y1, zf), ic.p(a, y1, zf)], rgba('#ffffff', 0.12));
    const [lx, ly] = ic.p(a, y0, zb); const [mx, my] = ic.p(a, y1, zf);
    c.strokeStyle = rgba('#1e2228', 0.22); c.lineWidth = 0.6 * RES; c.beginPath(); c.moveTo(lx, ly); c.lineTo(mx, my); c.stroke();
  }
  c.save(); ic.path(top); c.clip(); // rust
  for (let i = 0; i < 5; i++) {
    const [rx, ry] = ic.p(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), zb - (zb - zf) * r());
    const rg = c.createRadialGradient(rx, ry, 0, rx, ry, (6 + r() * 12) * RES);
    rg.addColorStop(0, rgba('#9c4a22', 0.45)); rg.addColorStop(1, rgba('#9c4a22', 0));
    c.fillStyle = rg; c.fillRect(rx - 20 * RES, ry - 20 * RES, 40 * RES, 40 * RES);
  }
  c.restore();
  // Edges: front fascia and the right-hand edge.
  ic.fill(ic.faceY(y1, x0, x1, zf - 3, zf), '#4b4f57');
  ic.fill([ic.p(x1, y0, zb), ic.p(x1, y1, zf), ic.p(x1, y1, zf - 3), ic.p(x1, y0, zb - 3)], '#5d636c');
  ic.stroke(top, rgba(PAL.outline, 0.5), 0.8);
}

function flatRoof(ic: IsoCanvas, b: BuildingDef, seed: number) {
  const r = rng(seed);
  const { x, y, w, d, h } = b; const x1 = x + w; const y1 = y + d; const t = 0.14; const ph = 8;
  ic.fill(ic.rect(x, y, x1, y1, h + ph), shade(b.roofColor, 0.12)); // parapet cap
  const slab = ic.rect(x + t, y + t, x1 - t, y1 - t, h + 2);
  ic.fill(slab, '#cfc7b6');
  const c = ic.ctx;
  c.save(); ic.path(slab); c.clip();
  for (let i = 0; i < 6; i++) { // water stains
    const [sx, sy] = ic.p(x + r() * w, y + r() * d, h + 2);
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, (8 + r() * 14) * RES);
    g.addColorStop(0, rgba('#7c7464', 0.3)); g.addColorStop(1, rgba('#7c7464', 0));
    c.fillStyle = g; c.fillRect(sx - 30 * RES, sy - 30 * RES, 60 * RES, 60 * RES);
  }
  c.restore();
  ic.fill(ic.faceY(y + t, x + t, x1 - t, h + 2, h + ph), shade(b.roofColor, -0.3)); // inner faces of the back parapets
  ic.fill(ic.faceX(x + t, y + t, y1 - t, h + 2, h + ph), shade(b.roofColor, -0.15));
  ic.fill(ic.rect(x, y1 - t, x1, y1, h + ph), shade(b.roofColor, 0.12));
  ic.fill(ic.rect(x1 - t, y, x1, y1, h + ph), shade(b.roofColor, 0.12));
  ic.fill(ic.faceY(y1, x, x1, h, h + ph), shade(b.roofColor, 0)); // outer parapet faces
  ic.fill(ic.faceX(x1, y, y1, h, h + ph), shade(b.roofColor, -0.22));
  ic.fill(ic.faceY(y1, x, x1, h + ph - 1, h + ph), rgba('#fff', 0.3));
}

/** Paint a building into an IsoCanvas whose origin is buildingBox(b). */
export function paintBuilding(ic: IsoCanvas, b: BuildingDef, style: BuildingStyle = BUILDING_STYLES[b.id] ?? {}) {
  const { x, y, w, d, h } = b; const x1 = x + w; const y1 = y + d;
  const seed = [...b.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7);
  const plinth = mix('#7b5a45', b.wallShade, 0.2);
  // Right (shaded) wall, with the gable under a sloping zinc roof.
  ic.fill(ic.faceX(x1, y, y1, 0, h), b.wallShade);
  ic.onWallX(x1, y1, h, (c) => paintWall(c, { len: d * 32, height: h, color: b.wallShade, lit: false, windows: Math.max(1, Math.round(b.windows * d / w)), style, seed: seed + 1, plinth: shade(plinth, -0.15) }));
  if (b.roof === 'zinc') ic.fill([ic.p(x1, y1, h), ic.p(x1, y, h), ic.p(x1, y, h + ZINC_RISE), ic.p(x1, y1, h - 2)], shade(b.wallShade, -0.05));
  // Front (lit) wall.
  ic.onWallY(y1, x, h, (c) => paintWall(c, { len: w * 32, height: h, color: b.wall, lit: true, windows: b.windows, door: b.door !== undefined ? b.door * 32 : undefined, style, seed: seed + 2, plinth }));
  // Corner highlight and silhouette outline.
  const c = ic.ctx;
  const [cx, cyb] = ic.p(x1, y1, 0); const [, cyt] = ic.p(x1, y1, h);
  c.strokeStyle = rgba('#ffffff', 0.35); c.lineWidth = 1 * RES; c.beginPath(); c.moveTo(cx, cyb); c.lineTo(cx, cyt); c.stroke();
  ic.stroke([ic.p(x, y1, 0), ic.p(x1, y1, 0), ic.p(x1, y, 0), ic.p(x1, y, h), ic.p(x, y1, h)], rgba(PAL.outline, 0.45), 0.9);

  if (style.balcony) for (let s = 1; s < Math.round(h / STOREY); s++) balcony(ic, b, (h / Math.round(h / STOREY)) * s, b.wall);
  if (b.roof === 'flat') {
    flatRoof(ic, b, seed + 3);
    if (b.tank) tank(ic, x + w * 0.3, y + d * 0.35, h + 2);
    if (style.clothesline) clothesline(ic, b, h + 2);
  } else {
    zincRoof(ic, b, seed + 4);
  }
  if (style.awning) awning(ic, b, style.awning);
  if (b.sign && !style.backdrop) {
    const u = (b.door ?? w / 2) * 32;
    if (b.roof === 'zinc') {
      // A signboard on two posts, standing on the front edge of the roof.
      ic.onWallY(y1 + 0.02, x, h + 18, (cc) => {
        cc.fillStyle = '#4a4440'; cc.fillRect(u - 16, 10, 2, 12); cc.fillRect(u + 14, 10, 2, 12);
        sign(cc, u, 0, b.sign!.text, b.sign!.bg, b.sign!.fg);
      });
    } else {
      ic.onWallY(y1, x, 47, (cc) => sign(cc, u, 0, b.sign!.text, b.sign!.bg, b.sign!.fg)); // just above the door, under the first-floor balcony
    }
  }
  if (style.backdrop) { // distant: soften into the haze
    c.save(); c.globalCompositeOperation = 'source-atop';
    c.fillStyle = rgba('#8a9bb0', 0.38); c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.restore();
  }
}

/** Soft shadow on the ground, falling to the lower right (light from the upper left). */
export function paintShadow(ic: IsoCanvas, b: BuildingDef) {
  const L = Math.min(b.h / 55, 1.5) + 0.15;
  const pts = [ic.p(b.x, b.y), ic.p(b.x + b.w + L, b.y), ic.p(b.x + b.w + L, b.y + b.d), ic.p(b.x, b.y + b.d)];
  const c = ic.ctx;
  c.save();
  c.shadowColor = rgba(PAL.shadow, 0.35); c.shadowBlur = 8 * RES;
  ic.fill(pts, rgba(PAL.shadow, 0.3));
  c.shadowBlur = 0;
  ic.fill([ic.p(b.x - 0.08, b.y - 0.08), ic.p(b.x + b.w + 0.12, b.y - 0.08), ic.p(b.x + b.w + 0.12, b.y + b.d + 0.12), ic.p(b.x - 0.08, b.y + b.d + 0.12)], rgba(PAL.shadow, 0.18));
  c.restore();
}

const keyOf = (b: BuildingDef) => `osl-bld-${b.id}`;

/** Paint (once) a building's texture and its ground-shadow texture, each trimmed to its visible pixels. */
export function installBuilding(scene: Phaser.Scene, b: BuildingDef, style?: BuildingStyle) {
  const key = keyOf(b);
  if (!scene.textures.exists(key)) {
    const box = buildingBox(b);
    paintTrimmed(scene, key, box.w, box.h, (ctx) => paintBuilding(new IsoCanvas(ctx, box.x, box.y), b, style));
  }
  if (!scene.textures.exists(`${key}-shadow`)) {
    const sbox = shadowBox(b);
    paintTrimmed(scene, `${key}-shadow`, sbox.w, sbox.h, (ctx) => paintShadow(new IsoCanvas(ctx, sbox.x, sbox.y), b));
  }
}

/** Where a building's shadow goes (world px of its texture's top-left), for painting into the ground. */
export function shadowStamp(scene: Phaser.Scene, b: BuildingDef) {
  const key = `${keyOf(b)}-shadow`; const sbox = shadowBox(b); const o = trimOffset(scene, key);
  return { key, x: sbox.x + o.x, y: sbox.y + o.y };
}

/** The shadow textures are only needed while the ground is painted; free them afterwards. */
export function releaseShadow(scene: Phaser.Scene, b: BuildingDef) {
  const key = `${keyOf(b)}-shadow`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
}

/** Add a building's image (installBuilding first). */
export function addBuilding(scene: Phaser.Scene, b: BuildingDef): Phaser.GameObjects.Image {
  const key = keyOf(b); const box = buildingBox(b); const o = trimOffset(scene, key);
  return scene.add.image(box.x + o.x, box.y + o.y, key).setOrigin(0).setScale(1 / RES);
}
