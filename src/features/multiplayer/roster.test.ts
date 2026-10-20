import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Roster } from './roster.ts';
import type { PlayerState } from './protocol.ts';

const B = '0f0e0d0c-0b0a-4000-8000-00000000000b';
const C = '0f0e0d0c-0b0a-4000-8000-00000000000c';
const profile = (name: string) => ({ name, avatar: { body: 'masc' as const, skin: 'brown' as const, headwear: 'cap' as const, outfit: 'ogun' as const } });
const st = (seq: number, x = 5, session = 'tabBBBBBBBBBBBBB'): PlayerState => ({ session, seq, x, y: 6, facing: 'right', moving: true });

test('a player joins only once both the profile and a first movement message have arrived', () => {
  const r = new Roster();
  assert.deepEqual(r.setPresent([B], 0).added, [B]);
  assert.deepEqual(r.takeProfileRequests(), [B]);
  assert.deepEqual(r.takeProfileRequests(), [], 'profile is requested once');
  assert.deepEqual(r.receiveState(B, st(1), 10), [], 'no profile yet: not shown');
  const events = r.setProfile(B, profile('Bayo'));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'join');
  if (events[0]?.type === 'join') assert.deepEqual(events[0].player, { id: B, name: 'Bayo', avatar: profile('Bayo').avatar, x: 5, y: 6, facing: 'right', moving: true });
  assert.equal(r.visibleCount, 1);
});

test('a presence entry without any movement message (e.g. a forged presence key) is never shown', () => {
  const r = new Roster();
  r.setPresent([B], 0);
  assert.deepEqual(r.setProfile(B, profile('Bayo')), []);
  assert.equal(r.visibleCount, 0);
});

test('movement updates become move events; duplicates and out-of-order messages are dropped', () => {
  const r = new Roster();
  r.setPresent([B], 0); r.setProfile(B, profile('Bayo')); r.receiveState(B, st(1), 0);
  assert.deepEqual(r.receiveState(B, st(2, 7), 100), [{ type: 'move', id: B, x: 7, y: 6, facing: 'right', moving: true }]);
  assert.deepEqual(r.receiveState(B, st(2, 9), 150), [], 'duplicate seq');
  assert.deepEqual(r.receiveState(B, st(1, 3), 160), [], 'older seq');
});

test('messages for players who are not in the room are ignored', () => {
  const r = new Roster();
  r.setPresent([B], 0);
  assert.deepEqual(r.receiveState(C, st(1), 0), []);
});

test('leaving the room removes the sprite exactly once', () => {
  const r = new Roster();
  r.setPresent([B, C], 0); r.setProfile(B, profile('Bayo')); r.receiveState(B, st(1), 0);
  const { removed, events } = r.setPresent([C], 500);
  assert.deepEqual(removed, [B]);
  assert.deepEqual(events, [{ type: 'leave', id: B }]);
  assert.deepEqual(r.setPresent([C], 600).events, [], 'repeated presence sync does nothing');
  assert.equal(r.visibleCount, 0);
});

test('duplicate presence events for the same player never create a second sprite', () => {
  const r = new Roster();
  r.setPresent([B], 0); r.setProfile(B, profile('Bayo')); r.receiveState(B, st(1), 0);
  assert.deepEqual(r.setPresent([B, B], 10), { added: [], removed: [], events: [] });
  assert.deepEqual(r.setPresent([B], 20).added, []);
  assert.equal(r.receiveState(B, st(2), 30)[0]?.type, 'move', 'still the same entry: move, not join');
  assert.equal(r.visibleCount, 1);
});

test('reconnect: leave then rejoin shows the player again once (new tab session, seq restarts)', () => {
  const r = new Roster();
  r.setPresent([B], 0); r.setProfile(B, profile('Bayo')); r.receiveState(B, st(50), 0);
  r.setPresent([], 1000);
  r.setPresent([B], 2000);
  assert.deepEqual(r.takeProfileRequests(), [B], 'fresh entry asks for the profile again');
  r.setProfile(B, profile('Bayo'));
  const events = r.receiveState(B, st(1, 4, 'tabNEWNEWNEWNEW1'), 2100);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'join');
});

test('same player in two tabs: follow one tab, switch only after it goes quiet', () => {
  const r = new Roster({ sessionHoldMs: 3000 });
  r.setPresent([B], 0); r.setProfile(B, profile('Bayo'));
  r.receiveState(B, st(1, 5, 'tabONEONEONEONE1'), 0);
  assert.deepEqual(r.receiveState(B, st(1, 9, 'tabTWOTWOTWOTWO2'), 1000), [], 'second tab ignored while the first is active');
  r.receiveState(B, st(2, 5, 'tabONEONEONEONE1'), 2000);
  const switched = r.receiveState(B, st(5, 9, 'tabTWOTWOTWOTWO2'), 5500);
  assert.deepEqual(switched, [{ type: 'move', id: B, x: 9, y: 6, facing: 'right', moving: true }], 'switches after the first tab is silent');
});

test('a silent player is hidden, and shown again when they speak', () => {
  const r = new Roster({ staleMs: 10_000 });
  r.setPresent([B], 0); r.setProfile(B, profile('Bayo')); r.receiveState(B, st(1), 0);
  assert.deepEqual(r.prune(9_000), []);
  assert.deepEqual(r.prune(10_001), [{ type: 'leave', id: B }]);
  assert.deepEqual(r.prune(20_000), [], 'hidden only once');
  assert.equal(r.receiveState(B, st(2), 21_000)[0]?.type, 'join');
});

test('a failed profile request can be retried; clear() hides everyone', () => {
  const r = new Roster();
  r.setPresent([B, C], 0);
  assert.deepEqual(r.takeProfileRequests().sort(), [B, C].sort());
  r.profileRequestFailed([B]);
  assert.deepEqual(r.takeProfileRequests(), [B]);
  r.setProfile(B, profile('Bayo')); r.receiveState(B, st(1), 0);
  assert.deepEqual(r.clear(), [{ type: 'leave', id: B }]);
  assert.equal(r.visibleCount, 0);
});
