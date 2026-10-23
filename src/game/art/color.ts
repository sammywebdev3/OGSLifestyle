/**
 * Colour and randomness helpers for the procedural art. Pure (no DOM, no Phaser), so they are
 * unit-tested directly.
 */

/** "#rrggbb" → [r, g, b]. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Lighten (amount > 0, towards white) or darken (amount < 0, towards black). amount in [-1, 1]. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = rgb(hex);
  const t = amount < 0 ? 0 : 255;
  const a = Math.min(1, Math.abs(amount));
  return toHex(r + (t - r) * a, g + (t - g) * a, b + (t - b) * a);
}

/** Linear mix of two colours, t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a); const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Small deterministic PRNG (mulberry32): the same seed always paints the same texture. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of two integers (tile coordinates) → 0..2^32-1. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
