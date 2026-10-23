import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterDepth, isBehind, staticRanks, type SortItem } from './depthSort.ts';
import { gridToScreen } from './isoMath.ts';

/** A static with a tile footprint and a screen box reaching `h` px above its front corner. */
function item(x0: number, y0: number, w: number, d: number, h: number, padX = 0): SortItem {
  const pts = [gridToScreen(x0, y0), gridToScreen(x0 + w, y0), gridToScreen(x0, y0 + d), gridToScreen(x0 + w, y0 + d)];
  const minX = Math.min(...pts.map((p) => p.x)); const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)) - h; const maxY = Math.max(...pts.map((p) => p.y));
  return { fp: { x0, y0, x1: x0 + w, y1: y0 + d }, box: { x: minX - padX, y: minY, w: maxX - minX + 2 * padX, h: maxY - minY } };
}
const charBox = (x: number, y: number) => { const s = gridToScreen(x, y); return { x: s.x - 12, y: s.y - 66, w: 24, h: 68 }; };

test('behind means entirely on the north-west side of the other footprint', () => {
  const storey = { x0: 9, y0: 13, x1: 14, y1: 16 };
  assert.ok(isBehind({ x0: 7, y0: 15, x1: 8, y1: 16 }, storey), 'the palm west of the storey building');
  assert.ok(isBehind({ x0: 10, y0: 11, x1: 11, y1: 12 }, storey), 'the lamp north of it');
  assert.ok(!isBehind({ x0: 8, y0: 17, x1: 9, y1: 18 }, storey), 'the tree south-west of its front corner');
  assert.ok(isBehind({ x0: 15, y0: 10, x1: 16, y1: 11 }, storey), 'something north-east of its back corner');
  assert.ok(!isBehind({ x0: 15, y0: 14, x1: 16, y1: 15 }, storey), 'something beside its east wall');
  assert.ok(!isBehind(storey, { x0: 7, y0: 15, x1: 8, y1: 16 }));
});

test('statics behind a building are drawn before it (the lamp and notice board no longer sit on the roof)', () => {
  const storey = item(9, 13, 5, 3, 88);
  // Prop pictures are wider than their tile (a palm's fronds, a tree's canopy).
  const lamp = item(10, 11, 1, 1, 90); const board = item(7, 12, 1, 1, 60); const palm = item(7, 15, 1, 1, 110, 25);
  const tree = item(12, 17, 1, 1, 120, 30); // right in front of its face
  const items = [tree, storey, lamp, board, palm];
  const r = staticRanks(items);
  assert.ok(r[2]! < r[1]! && r[3]! < r[1]! && r[4]! < r[1]!, `lamp/board/palm before the building: ${r}`);
  assert.ok(r[0]! > r[1]!, 'the tree in front of it after');
  assert.deepEqual([...r].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('a character is drawn in front of what they stand south-east of, and behind what they stand north-west of', () => {
  const storey = item(9, 13, 5, 3, 88);
  const items = [storey]; const r = staticRanks(items);
  assert.ok(characterDepth(11, 17, charBox(11, 17), items, r) > r[0]!, 'standing at the front door: in front');
  assert.ok(characterDepth(11, 12.5, charBox(11, 12.5), items, r) < r[0]!, 'standing behind it: hidden by it');
  assert.ok(characterDepth(14.5, 14, charBox(14.5, 14), items, r) > r[0]!, 'standing beside its east wall: in front');
});

test('characters order among themselves by position; far-away statics do not matter', () => {
  const a = characterDepth(3, 3, charBox(3, 3), [], []); const b = characterDepth(3, 4, charBox(3, 4), [], []);
  assert.ok(b > a);
  const far = item(30, 30, 1, 1, 40);
  assert.equal(characterDepth(3, 3, charBox(3, 3), [far], staticRanks([far])), a);
});

test('a cycle of overlaps still gives every item a distinct rank', () => {
  const items = [item(0, 0, 2, 1, 200), item(2, 0, 1, 2, 200), item(0, 1, 1, 2, 200)];
  assert.deepEqual(staticRanks(items).sort(), [0, 1, 2]);
});
