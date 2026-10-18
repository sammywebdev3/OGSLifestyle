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

// Same cases as supabase/tests/phase1_players.test.sql — the two rules must agree.
test('Nigerian names with accents pass, exactly like the database rule', () => {
  for (const name of ['Ọlá Adéyẹmí', 'Ɗanjuma Ƙaura', "Emeka O'Neil-Ụzọ", 'Ṣadé Àlàbí']) {
    assert.equal(validateCharacterName(name).ok, true, name);
  }
});

test('decomposed accents are normalised to NFC', () => {
  const r = validateCharacterName('O\u0323la\u0301 Bello');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 'O\u0323la\u0301 Bello'.normalize('NFC'));
});

test('emoji, symbols, invisible characters and other scripts are rejected like in the database', () => {
  for (const name of ['Kemi 😀', 'Ke\u200Bmi', 'Ola×Ade', '-Kemi', 'Иван Петров', 'Abcdefghijklmnopqrstu']) {
    assert.equal(validateCharacterName(name).ok, false, name);
  }
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
