import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BubbleTracker, EMOTE_RANGE, INTERACT_RADIUS, bubbleDurationMs, clampBubble, nearestWithin, withinRange, wrapBubbleText } from './bubbles.ts';

test('bubble text wraps into short lines and long text is cut with an ellipsis', () => {
  assert.deepEqual(wrapBubbleText('hello there'), ['hello there']);
  const lines = wrapBubbleText('the quick brown fox jumps over the lazy dog and keeps on running far away', 20, 3);
  assert.equal(lines.length, 3);
  for (const l of lines) assert.ok(Array.from(l).length <= 20, l);
  assert.ok(lines[2]?.endsWith('…'));
  const longWord = wrapBubbleText('a'.repeat(60), 26, 4);
  assert.deepEqual(longWord.map((l) => l.length), [26, 26, 8], 'one very long word is split');
  assert.deepEqual(wrapBubbleText('😂'.repeat(30), 10, 4).map((l) => Array.from(l).length), [10, 10, 10], 'emoji are not cut in half');
});

test('chat bubbles last 4 to 9 s depending on length; emotes 2.5 s', () => {
  assert.equal(bubbleDurationMs('chat', 'hi'), 4_000);
  assert.equal(bubbleDurationMs('chat', 'x'.repeat(200)), 9_000);
  assert.equal(bubbleDurationMs('emote', '👋'), 2_500);
});

test('one bubble per character: a new message replaces the old one', () => {
  const t = new BubbleTracker();
  t.show('b', 'chat', 'first', 0);
  t.show('b', 'chat', 'second', 100);
  assert.equal(t.size, 1);
  assert.deepEqual(t.get('b')?.lines, ['second']);
});

test('expired bubbles are removed; leaving removes them at once', () => {
  const t = new BubbleTracker();
  t.show('b', 'chat', 'hi', 0);
  t.show('c', 'emote', '👋', 0);
  assert.deepEqual(t.expire(2_000), []);
  assert.deepEqual(t.expire(2_500), ['c']);
  assert.equal(t.remove('b'), true, 'player left');
  assert.equal(t.size, 0);
  assert.deepEqual(t.expire(99_999), []);
});

test('bubbles stay inside the visible area', () => {
  const view = { x: 0, y: 0, width: 400, height: 300 };
  assert.deepEqual(clampBubble(200, 150, 100, 40, view), { x: 200, y: 150 }, 'already inside');
  assert.deepEqual(clampBubble(-50, 10, 100, 40, view), { x: 58, y: 48 }, 'pulled in from the top-left');
  assert.deepEqual(clampBubble(999, 999, 100, 40, view), { x: 342, y: 292 }, 'pulled in from the bottom-right');
  assert.deepEqual(clampBubble(10, 10, 1000, 40, view).x, 200, 'wider than the view: centred');
});

test('proximity: nearest player within the interaction radius', () => {
  const me = { x: 5, y: 5 };
  const others = [{ id: 'far', x: 9, y: 9 }, { id: 'near', x: 6, y: 5 }, { id: 'nearer', x: 5.5, y: 5 }];
  assert.equal(nearestWithin(me, others, INTERACT_RADIUS)?.id, 'nearer');
  assert.equal(nearestWithin(me, [{ id: 'far', x: 9, y: 9 }], INTERACT_RADIUS), null);
  assert.equal(nearestWithin(me, [{ id: 'b', x: 6, y: 5 }, { id: 'a', x: 4, y: 5 }], INTERACT_RADIUS)?.id, 'a', 'ties are stable');
  assert.equal(withinRange(me, { x: 5 + EMOTE_RANGE, y: 5 }, EMOTE_RANGE), true);
  assert.equal(withinRange(me, { x: 5 + EMOTE_RANGE + 0.1, y: 5 }, EMOTE_RANGE), false);
});
