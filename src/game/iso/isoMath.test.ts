import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collides, gridToScreen, moveWithCollision, screenDirToGrid, screenToGrid } from './isoMath.ts';

test('grid and screen conversions round-trip', () => {
  for (const [gx, gy] of [[0, 0], [3, 7], [10.5, 2.25], [-4, 6]] as const) {
    const s = gridToScreen(gx, gy);
    const g = screenToGrid(s.x, s.y);
    assert.ok(Math.abs(g.x - gx) < 1e-9 && Math.abs(g.y - gy) < 1e-9);
  }
  assert.deepEqual(gridToScreen(1, 0), { x: 32, y: 16 });
  assert.deepEqual(gridToScreen(0, 1), { x: -32, y: 16 });
});

test('keyboard "up" moves up the screen', () => {
  const d = screenDirToGrid(0, -1);
  const s = gridToScreen(d.x, d.y);
  assert.ok(s.y < 0 && Math.abs(s.x) < 1e-9);
  const r = screenDirToGrid(1, 0);
  const sr = gridToScreen(r.x, r.y);
  assert.ok(sr.x > 0 && Math.abs(sr.y) < 1e-9);
  assert.deepEqual(screenDirToGrid(0, 0), { x: 0, y: 0 });
});

test('collision blocks walls and lets you slide along them', () => {
  const wall = (tx: number, ty: number) => tx === 5; // a wall along column 5
  assert.equal(collides(4.5, 2, 0.3, wall), false);
  assert.equal(collides(4.8, 2, 0.3, wall), true);
  const p = moveWithCollision({ x: 4.6, y: 2 }, { x: 0.3, y: 0.5 }, 0.3, wall);
  assert.equal(p.x, 4.6); // blocked in x
  assert.equal(p.y, 2.5); // slides in y
});
