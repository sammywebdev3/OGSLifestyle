import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFromSupabaseError, toAuthErrorCode } from './authErrors.ts';

test('only known codes are accepted from the URL', () => {
  assert.equal(toAuthErrorCode('callback'), 'callback');
  assert.equal(toAuthErrorCode('link-expired'), 'link-expired');
  assert.equal(toAuthErrorCode('<script>alert(1)</script>'), null);
  assert.equal(toAuthErrorCode(undefined), null);
});

test('Supabase redirect errors map to fixed codes', () => {
  assert.equal(codeFromSupabaseError('otp_expired', 'access_denied'), 'link-expired');
  assert.equal(codeFromSupabaseError(null, 'server_error'), 'callback');
  assert.equal(codeFromSupabaseError(null, null), null);
});
