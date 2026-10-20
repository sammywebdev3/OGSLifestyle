import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SendPolicy, Smoother } from './motion.ts';

const at = (x: number, moving = true) => ({ x, y: 5, facing: 'right' as const, moving });

test('sends immediately, then at most every 100 ms while moving (not every frame)', () => {
  const p = new SendPolicy(100, 2000);
  let sent = 0;
  // 60 fps for one second of continuous movement
  for (let frame = 0; frame < 60; frame++) if (p.tick(frame * (1000 / 60), at(frame * 0.05))) sent++;
  assert.ok(sent >= 9 && sent <= 11, `sent ${sent} messages in one second`);
});

test('standing still sends only a heartbeat every 2 s', () => {
  const p = new SendPolicy(100, 2000);
  assert.equal(p.tick(0, at(1, false)), true);
  let sent = 0;
  for (let t = 16; t < 6000; t += 16) if (p.tick(t, at(1, false))) sent++;
  assert.equal(sent, 2, 'heartbeats at ~2 s and ~4 s');
});

test('stopping or turning is sent promptly', () => {
  const p = new SendPolicy(100, 2000);
  p.tick(0, at(1));
  assert.equal(p.tick(50, at(1, false)), false, 'too soon');
  assert.equal(p.tick(120, at(1, false)), true, 'moving → stopped');
  assert.equal(p.tick(240, { ...at(1, false), facing: 'left' }), true, 'turned');
});

test('forceNext sends the current state on the next allowed tick (new player joined)', () => {
  const p = new SendPolicy(100, 2000);
  p.tick(0, at(1, false));
  p.forceNext();
  assert.equal(p.tick(50, at(1, false)), false, 'still respects the minimum interval');
  assert.equal(p.tick(100, at(1, false)), true);
});

test('remote movement is smoothed between updates', () => {
  const s = new Smoother(0, 0);
  s.setTarget(1, 0);
  const first = s.step(1 / 60).x;
  assert.ok(first > 0 && first < 1, 'moves part of the way each frame');
  for (let i = 0; i < 60; i++) s.step(1 / 60);
  assert.equal(s.x, 1, 'arrives');
});

test('large jumps (reconnect, teleport) snap instead of sliding across the map', () => {
  const s = new Smoother(0, 0);
  s.setTarget(10, 10);
  assert.deepEqual({ x: s.x, y: s.y }, { x: 10, y: 10 });
});
