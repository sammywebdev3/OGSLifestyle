import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAB_WALK, labAtlasUrls, labFrame, labQuality, pickDirection } from './prototype.ts';
import { DemoWalker, clearPath } from './demoWalker.ts';

test('character lab: screen movement picks the rendered facing direction', () => {
  assert.equal(pickDirection(0, 1), 0); // walking down the screen: facing the viewer
  assert.equal(pickDirection(-1, 0), 2); // left
  assert.equal(pickDirection(0, -1), 4); // away
  assert.equal(pickDirection(1, 0), 6); // right
  // Grid axes in 2:1 isometric are screen (32, 16) per tile: screen diagonals, 45 degrees apart on the ground.
  assert.equal(pickDirection(32, 16), 7);
  assert.equal(pickDirection(-32, 16), 1);
  assert.equal(pickDirection(-32, -16), 3);
  assert.equal(pickDirection(32, -16), 5);
  assert.equal(pickDirection(0, 0), null);
});

test('character lab: atlas frames are named by direction and column', () => {
  assert.equal(labFrame(0, 0), '0-walk0');
  assert.equal(labFrame(3, 7), '3-walk7');
  assert.equal(labFrame(7, LAB_WALK + 3), '7-idle3');
});

test('character lab: low-memory devices get the smaller atlases', () => {
  assert.equal(labQuality(8), 'hd');
  assert.equal(labQuality(undefined), 'hd');
  assert.equal(labQuality(4), 'sd');
  assert.equal(labQuality(2), 'sd');
  assert.equal(labQuality(8, 'sd'), 'sd');
  assert.equal(labQuality(2, 'hd'), 'hd');
  assert.equal(labQuality(2, 'bogus'), 'sd');
});

test('character lab: demo walkers never walk through blocked tiles', () => {
  const blocked = (x: number) => x === 5; // a wall along x = 5
  assert.equal(clearPath(1, 1, 3, 3, blocked), true);
  assert.equal(clearPath(1, 1, 8, 1, blocked), false);
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const w = new DemoWalker(2, 2, { x: 2, y: 2 }, rand);
  let moved = 0;
  for (let i = 0; i < 4000; i++) {
    const p = w.step(1 / 30, blocked);
    if (p.moving) moved++;
    assert.ok(Math.floor(p.x + 0.3) !== 5 && Math.floor(p.x - 0.3) !== 5);
  }
  assert.ok(moved > 1000);
});

test('character lab: atlas URLs are encoded and carry the quality', () => {
  assert.deepEqual(labAtlasUrls('outfit-femi.tunde', 'sd'), {
    image: '/prototype-characters/outfit-femi.tunde-sd.webp', json: '/prototype-characters/outfit-femi.tunde-sd.json',
  });
});

test('character lab: the demo cast has unique ids, mixes on request and repeats for stress tests', async () => {
  const { demoCast } = await import('./demoCast.ts');
  const { appearanceFor, resolveLook } = await import('./appearance.ts');
  // The base cast is exactly the four baked characters, reached through the same rules as real remote players.
  assert.deepEqual(demoCast().map((m) => resolveLook(appearanceFor(m.avatar)).look.atlases), [['tunde'], ['femi'], ['amaka'], ['zainab']]);
  const mixed = demoCast({ mix: true });
  assert.equal(mixed.length, 10);
  for (const m of mixed.slice(4)) {
    const r = resolveLook(appearanceFor(m.avatar));
    assert.equal(r.kind, 'layered', m.name);
    assert.equal(r.exact, true, m.name);
  }
  const big = demoCast({ count: 20 });
  assert.equal(big.length, 20);
  assert.equal(new Set(big.map((m) => m.id)).size, 20);
  assert.equal(big[4]!.name, 'Tunde 2');
  assert.equal(demoCast({ count: 1000 }).length, 60); // capped
});
