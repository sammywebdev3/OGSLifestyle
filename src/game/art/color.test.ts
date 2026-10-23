import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2, mix, rgb, rgba, rng, shade } from './color.ts';

test('colour helpers', () => {
  assert.deepEqual(rgb('#12935a'), [0x12, 0x93, 0x5a]);
  assert.equal(shade('#808080', 0), '#808080');
  assert.equal(shade('#808080', 1), '#ffffff');
  assert.equal(shade('#808080', -1), '#000000');
  assert.equal(shade('#000000', 0.5), '#808080');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(rgba('#ff0000', 0.5), 'rgba(255,0,0,0.5)');
});

test('the art is deterministic: same seed, same numbers', () => {
  const a = rng(42); const b = rng(42);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  assert.equal(hash2(3, 4), hash2(3, 4));
  assert.notEqual(hash2(3, 4), hash2(4, 3));
});
