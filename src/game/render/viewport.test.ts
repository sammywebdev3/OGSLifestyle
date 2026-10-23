import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseZoom, renderScale } from './viewport.ts';

test('render scale follows the device pixel ratio, capped for performance', () => {
  assert.equal(renderScale(1), 1);
  assert.equal(renderScale(2), 2);
  assert.equal(renderScale(3), 2);
  assert.equal(renderScale(2.75, 4), 1.5, 'few cores');
  assert.equal(renderScale(3, 8, 2), 1.5, 'little memory');
  assert.equal(renderScale(1.25, 4), 1.25);
  for (const bad of [0, -1, Number.NaN, Infinity]) assert.equal(renderScale(bad), 1);
});

test('zoom is a little closer on wider screens', () => {
  assert.ok(baseZoom(390) < baseZoom(800));
  assert.ok(baseZoom(800) < baseZoom(1440));
});
