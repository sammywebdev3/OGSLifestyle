import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAvatar, validateCharacterName, validateCreateCharacter } from './character.ts';

test('character names are trimmed and length-checked', () => {
  assert.deepEqual(validateCharacterName('  Ayo   Bakare '), { ok: true, value: 'Ayo Bakare' });
  assert.equal(validateCharacterName('Al').ok, false);
  assert.equal(validateCharacterName('x'.repeat(21)).ok, false);
  assert.equal(validateCharacterName(42).ok, false);
});

test('names only allow letters and simple punctuation', () => {
  assert.equal(validateCharacterName("Ọlá-O'Neil").ok, true);
  assert.equal(validateCharacterName('<script>').ok, false);
  assert.equal(validateCharacterName('1337 boy').ok, false);
});

test('avatar must use known options', () => {
  assert.equal(validateAvatar({ body: 'femme', skin: 'deep', headwear: 'gele', outfit: 'adire' }).ok, true);
  const bad = validateAvatar({ body: 'robot', skin: 'deep', headwear: 'gele', outfit: 'adire' });
  assert.equal(bad.ok, false);
  assert.equal(validateAvatar(null).ok, false);
});

test('create-character ignores client-supplied cash and ids', () => {
  const r = validateCreateCharacter({ characterName: 'Kemi', avatar: { body: 'femme', skin: 'warm', headwear: 'braids', outfit: 'palm' }, cash: 999999999, id: 'evil' });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(Object.keys(r.value).sort(), ['avatar', 'characterName']);
});
