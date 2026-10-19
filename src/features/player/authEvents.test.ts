import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldReloadOnAuthEvent } from './authEvents.ts';

test('repeated SIGNED_IN for the same user does not reload', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', 'u1', 'u1'), false);
  assert.equal(shouldReloadOnAuthEvent('TOKEN_REFRESHED', 'u1', 'u1'), false);
  assert.equal(shouldReloadOnAuthEvent('INITIAL_SESSION', 'u1', null), false);
});

test('a different user signing in, or signing out, reloads', () => {
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', 'u1', null), true);
  assert.equal(shouldReloadOnAuthEvent('SIGNED_IN', 'u2', 'u1'), true);
  assert.equal(shouldReloadOnAuthEvent('SIGNED_OUT', null, 'u1'), true);
  assert.equal(shouldReloadOnAuthEvent('SIGNED_OUT', null, null), false);
});
