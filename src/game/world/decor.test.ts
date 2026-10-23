/**
 * The decoration added for the visual pass must not change how Kuto plays: nothing on a plot, a
 * door approach, an interaction spot, the road or the spawn, and every plot, door and interaction
 * spot still reachable on foot. Distant scenery must stay outside the playable map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, DECOR, INTERACTABLES, MAP_H, MAP_W, PROPS, SPAWN, buildBlockedSet, isBlockedFn, tileAt } from './starterArea.ts';
import { BACKDROP_BUILDINGS, OUTSKIRT_SCENERY } from './scenery.ts';
import { KUTO_PLOTS } from '../../features/land/plots.ts';
import { doorTile } from '../../features/land/placement.ts';
import { collides } from '../iso/isoMath.ts';

const RADIUS = 0.28; // the player's collision radius (StarterAreaScene)
const key = (x: number, y: number) => `${x},${y}`;

/** Tiles the player can stand in the middle of, flood-filled from the spawn (4-neighbour steps). */
function reachable(blocked = buildBlockedSet()): Set<string> {
  const isBlocked = isBlockedFn(blocked);
  const start = { x: Math.floor(SPAWN.x), y: Math.floor(SPAWN.y) };
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx; const ny = y + dy;
      if (seen.has(key(nx, ny)) || collides(nx + 0.5, ny + 0.5, RADIUS, isBlocked)) continue;
      seen.add(key(nx, ny)); queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

test('decor stands on open ground or pavement, never on a plot, door, prop, building, interaction spot or the spawn', () => {
  const seen = new Set<string>();
  for (const d of DECOR) {
    const where = `${d.kind} at ${d.x},${d.y}`;
    assert.ok(d.x >= 0 && d.y >= 0 && d.x < MAP_W && d.y < MAP_H, `${where} is outside the map`);
    assert.ok(!seen.has(key(d.x, d.y)), `${where} doubles up`); seen.add(key(d.x, d.y));
    assert.ok(['laterite', 'grass', 'pavement', 'courtyard'].includes(tileAt(d.x, d.y)), `${where} is on ${tileAt(d.x, d.y)}`);
    for (const p of KUTO_PLOTS) assert.ok(!(d.x >= p.x && d.x < p.x + p.w && d.y >= p.y && d.y < p.y + p.d), `${where} is on ${p.key}`);
    for (const b of BUILDINGS) {
      assert.ok(!(d.x >= b.x && d.x < b.x + b.w && d.y >= b.y && d.y < b.y + b.d), `${where} is inside ${b.id}`);
      const door = doorTile(b); assert.ok(!(door && door.x === d.x && door.y === d.y), `${where} blocks the ${b.id} door`);
    }
    for (const p of PROPS) assert.ok(!(p.x === d.x && p.y === d.y), `${where} is on a ${p.kind}`);
    for (const it of INTERACTABLES) assert.ok(!(Math.floor(it.x) === d.x && Math.floor(it.y) === d.y), `${where} is on ${it.id}`);
    assert.ok(!(Math.floor(SPAWN.x) === d.x && Math.floor(SPAWN.y) === d.y), `${where} is on the spawn`);
  }
});

test('every plot tile, door and interaction spot can still be reached on foot from the spawn', () => {
  const ok = reachable();
  for (const p of KUTO_PLOTS) for (let x = p.x; x < p.x + p.w; x++) for (let y = p.y; y < p.y + p.d; y++) assert.ok(ok.has(key(x, y)), `${p.key} tile ${x},${y}`);
  for (const b of BUILDINGS) { const d = doorTile(b); if (d) assert.ok(ok.has(key(d.x, d.y)), `${b.id} door`); }
  for (const it of INTERACTABLES) assert.ok(ok.has(key(Math.floor(it.x), Math.floor(it.y))), it.id);
  // The whole road is still a through route.
  for (let x = 0; x < MAP_W; x++) { assert.ok(ok.has(key(x, 9)), `road ${x},9`); assert.ok(ok.has(key(x, 10)), `road ${x},10`); }
});

test('the reachability check fails when something is walled off (so the test above means something)', () => {
  const blocked = buildBlockedSet();
  for (let x = 0; x < MAP_W; x++) blocked.add(key(x, 7)); // a wall along the gutter cuts the spawn off from the road
  const ok = reachable(blocked);
  assert.equal(ok.has(key(4, 9)), false);
  assert.equal(ok.has(key(4, 6)), true);
});

test('distant scenery is outside the playable map, and distant buildings only beyond the north and west edges', () => {
  for (const b of BACKDROP_BUILDINGS) {
    assert.ok(b.x + b.w <= 0 || b.y + b.d <= 0, `${b.id} overlaps the map or sits in front of it`);
    assert.ok(b.y + b.d <= 7 || b.y >= 12, `${b.id} sits on the street as it carries on past the map`);
  }
  for (const s of OUTSKIRT_SCENERY) {
    assert.ok(s.x < 0 || s.y < 0 || s.x >= MAP_W || s.y >= MAP_H, `${s.kind} at ${s.x},${s.y} is inside the map`);
    assert.ok(s.y < 7 || s.y > 11, `${s.kind} at ${s.x},${s.y} is on the street`);
  }
});
