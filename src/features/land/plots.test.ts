import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KUTO_PLOTS, LAND_PRICES, PLOT_KEY_PATTERN, isPlotKey } from './plots.ts';
import { plotProblems, rectsOverlap, hiddenBehind } from './placement.ts';
import { BUILDINGS, INTERACTABLES, MAP_H, MAP_W, PROPS, SPAWN, buildBlockedSet } from '../../game/world/starterArea.ts';

const MIGRATION = fileURLToPath(new URL('../../../supabase/migrations/20261020000000_phase3_3a_land.sql', import.meta.url));

/** The seeded rows, parsed from the migration's INSERT. */
function seededPlots() {
  const sql = readFileSync(MIGRATION, 'utf8');
  const block = sql.slice(sql.indexOf('insert into public.land_plots'), sql.indexOf(';', sql.indexOf('insert into public.land_plots')));
  return [...block.matchAll(/\('([a-z0-9-]+)', '([a-z-]+)', '([a-z]+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g)].map((m) => ({
    key: m[1]!, location: m[2]!, tier: m[3]!, price: Number(m[4]), x: Number(m[5]), y: Number(m[6]), w: Number(m[7]), d: Number(m[8]),
  }));
}

test('exactly 12 plots, keys kuto-01 … kuto-12, valid key format', () => {
  assert.equal(KUTO_PLOTS.length, 12);
  assert.deepEqual(KUTO_PLOTS.map((p) => p.key), Array.from({ length: 12 }, (_, i) => `kuto-${String(i + 1).padStart(2, '0')}`));
  for (const p of KUTO_PLOTS) assert.ok(isPlotKey(p.key), p.key);
  for (const bad of ['', 'KUTO-01', 'kuto-1', 'kuto-001', 'kuto_01', 'kuto-01 ', 'a'.repeat(13) + '-01', null, 1, {}]) assert.equal(isPlotKey(bad), false, String(bad));
  // Same rule as the database CHECK and buy_land_plot.
  assert.match(readFileSync(MIGRATION, 'utf8'), new RegExp(PLOT_KEY_PATTERN.source.replace(/[\\^$[\]{}]/g, (c) => `\\${c}`)));
});

test('the migration seeds exactly these plots, with the approved prices', () => {
  const seeded = seededPlots();
  assert.equal(seeded.length, 12);
  assert.deepEqual(seeded.map((s) => ({ key: s.key, tier: s.tier, x: s.x, y: s.y, w: s.w, d: s.d })),
    KUTO_PLOTS.map((p) => ({ key: p.key, tier: p.tier, x: p.x, y: p.y, w: p.w, d: p.d })));
  for (const s of seeded) {
    assert.equal(s.location, 'kuto-street');
    assert.equal(s.price, LAND_PRICES[s.tier as keyof typeof LAND_PRICES], s.key);
  }
  assert.deepEqual(LAND_PRICES, { basic: 25_000, standard: 50_000, premium: 100_000 });
});

test('every plot is inside the map', () => {
  for (const p of KUTO_PLOTS) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= MAP_W && p.y + p.d <= MAP_H, p.key);
  }
});

test('no plot overlaps a building, a blocked tile, a prop, the spawn, an interaction spot or another plot', () => {
  const blocked = buildBlockedSet();
  KUTO_PLOTS.forEach((p, i) => {
    assert.deepEqual(plotProblems(p, KUTO_PLOTS.filter((_, j) => j !== i)), [], p.key);
    for (let x = p.x; x < p.x + p.w; x++) for (let y = p.y; y < p.y + p.d; y++) {
      assert.equal(blocked.has(`${x},${y}`), false, `${p.key} tile ${x},${y} is blocked`);
      for (const b of BUILDINGS) assert.ok(!(x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d), `${p.key} inside ${b.id}`);
      for (const prop of PROPS) assert.ok(!(prop.x === x && prop.y === y), `${p.key} on a ${prop.kind}`);
    }
    for (const it of INTERACTABLES) assert.ok(!(it.x >= p.x && it.x < p.x + p.w && it.y >= p.y && it.y < p.y + p.d), `${p.key} contains ${it.id}`);
    assert.ok(!(SPAWN.x >= p.x && SPAWN.x < p.x + p.w && SPAWN.y >= p.y && SPAWN.y < p.y + p.d), `${p.key} contains the spawn`);
  });
  for (let i = 0; i < KUTO_PLOTS.length; i++) for (let j = i + 1; j < KUTO_PLOTS.length; j++) assert.equal(rectsOverlap(KUTO_PLOTS[i]!, KUTO_PLOTS[j]!), false);
});

test('the placement rules reject bad spots (so the check above means something)', () => {
  const has = (r: { x: number; y: number; w: number; d: number }, text: string, others: { x: number; y: number; w: number; d: number }[] = []) =>
    assert.ok(plotProblems(r, others).some((p) => p.includes(text)), `${JSON.stringify(r)} should report "${text}"`);
  has({ x: 2, y: 1, w: 2, d: 2 }, 'inside building kuto-court');
  has({ x: 14, y: 4, w: 1, d: 1 }, 'inside building pos');
  has({ x: 8, y: 2, w: 1, d: 1 }, 'has a palm');
  has({ x: 12, y: 6, w: 1, d: 1 }, 'has a bench');
  has({ x: 0, y: 9, w: 2, d: 1 }, 'is road');
  has({ x: 0, y: 8, w: 1, d: 1 }, 'is pavement');
  has({ x: 0, y: 7, w: 1, d: 1 }, 'is gutter');
  has({ x: 2, y: 5, w: 1, d: 1 }, 'is courtyard');
  has({ x: 4, y: 6, w: 1, d: 1 }, 'spawn point');
  has({ x: 10, y: 6, w: 1, d: 1 }, 'in reach of buka');
  has({ x: 11, y: 16, w: 1, d: 1 }, 'in front of the storey door');
  has({ x: 0, y: 0, w: 2, d: 2 }, 'hidden behind building kuto-court');
  has({ x: 19, y: 17, w: 2, d: 1 }, 'outside the map');
  has({ x: -1, y: 0, w: 1, d: 1 }, 'outside the map');
  has({ x: 0, y: 17, w: 1, d: 2 }, 'outside the map');
  has({ x: 1.5, y: 0, w: 1, d: 1 }, 'whole-tile');
  has({ x: 16, y: 0, w: 2, d: 2 }, 'overlaps the plot', [{ x: 15, y: 0, w: 2, d: 2 }]);
  assert.equal(hiddenBehind(BUILDINGS[0]!, 7, 5), false, 'tiles in front of a building are never hidden');
});
