import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeEmail, validateNewPassword } from './password.ts';

test('a good new password typed twice is accepted', () => {
  assert.deepEqual(validateNewPassword('correct horse 9', 'correct horse 9'), { ok: true });
  assert.deepEqual(validateNewPassword('ẹ̀kọ́-Ọlá-2026', 'ẹ̀kọ́-Ọlá-2026'), { ok: true });
});

test('short, mismatched, blank, oversized or missing passwords are refused', () => {
  assert.equal(validateNewPassword('short', 'short').ok, false);
  assert.equal(validateNewPassword('long enough 1', 'long enough 2').ok, false);
  assert.equal(validateNewPassword('         ', '         ').ok, false);
  assert.equal(validateNewPassword('a'.repeat(73), 'a'.repeat(73)).ok, false);
  assert.equal(validateNewPassword('ọ'.repeat(30), 'ọ'.repeat(30)).ok, false, '30 × 3-byte letters = 90 bytes > 72');
  assert.equal(validateNewPassword(undefined, undefined).ok, false);
  const r = validateNewPassword('long enough 1', 'long enough 2');
  assert.equal(!r.ok && r.error, 'The two passwords do not match.');
});

test('email shape check', () => {
  assert.ok(looksLikeEmail('ada@example.com'));
  for (const bad of ['', 'ada', 'ada@', '@x.com', 'a b@x.com', 'ada@x', null, 'x'.repeat(250) + '@x.com']) assert.equal(looksLikeEmail(bad), false, String(bad));
});
