import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_FRAMES, OUTSKIRTS, grassiness, groundFrame, materialAt } from './groundLayout.ts';
import { MAP_H, MAP_W, tileAt } from '../world/starterArea.ts';

const OPEN = /^(laterite|grass|edge)-/;

test('inside the map the art always matches the logical ground (road stays road, open ground stays open)', () => {
  for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) {
    const kind = tileAt(x, y); const f = groundFrame(x, y);
    if (kind === 'laterite' || kind === 'grass') assert.match(f, OPEN, `${x},${y}`);
    else assert.ok(f.startsWith(kind), `${x},${y}: ${kind} drawn as ${f}`);
  }
});

test('every frame used exists, and the street carries on past both ends of the map', () => {
  for (let x = -OUTSKIRTS; x < MAP_W + OUTSKIRTS; x++) for (let y = -OUTSKIRTS; y < MAP_H + OUTSKIRTS; y++) {
    assert.ok(GROUND_FRAMES.includes(groundFrame(x, y)), `${x},${y}`);
  }
  for (const x of [-OUTSKIRTS, -1, MAP_W, MAP_W + OUTSKIRTS - 1]) {
    assert.equal(materialAt(x, 9), 'road'); assert.equal(materialAt(x, 10), 'road');
    assert.equal(materialAt(x, 8), 'pavement'); assert.equal(materialAt(x, 11), 'pavement');
    assert.equal(materialAt(x, 7), 'gutter');
  }
  assert.equal(materialAt(-3, -3), 'laterite');
});

test('lane dashes alternate and both halves of a dash line up across the centre line', () => {
  for (let x = 0; x < MAP_W; x++) {
    assert.equal(groundFrame(x, 9).includes('lane'), groundFrame(x, 10).includes('lane'));
    assert.equal(groundFrame(x, 9).includes('lane'), x % 2 === 0);
  }
});

test('grass grows in patches (smooth noise), with some of each', () => {
  for (let x = -5; x < 25; x++) for (let y = -5; y < 25; y++) { const g = grassiness(x, y); assert.ok(g >= 0 && g <= 1); }
  const frames = [];
  for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) frames.push(groundFrame(x, y));
  assert.ok(frames.some((f) => f.startsWith('grass')) && frames.some((f) => f.startsWith('laterite')));
});
