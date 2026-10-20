import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, isPlayerId, newSessionId, parseProfiles, parseState, playerTopic, presentPlayerIds, roomTopic } from './protocol.ts';

const BOUNDS = { width: 20, height: 18 };
const A = '0f0e0d0c-0b0a-4000-8000-00000000000a';
const B = '0f0e0d0c-0b0a-4000-8000-00000000000b';
const good = { v: 1, s: 'tabAAAAAAAAAAAAA', q: 3, x: 4.5, y: 6.25, f: 'l', m: 1 };

test('topics match the database policies and reject unsafe names', () => {
  assert.equal(roomTopic('kuto-street'), 'mp:kuto-street');
  assert.equal(playerTopic('kuto-street', A), `mp:kuto-street:${A}`);
  for (const bad of ['Kuto Street', 'kuto:street', '', 'x'.repeat(41), '../etc']) assert.throws(() => roomTopic(bad), bad);
  for (const bad of [A.toUpperCase(), A.replaceAll('-', ''), `${A}:x`, 'not-a-uuid']) assert.throws(() => playerTopic('kuto-street', bad), bad);
});

test('a valid movement message round-trips through encode/parse', () => {
  const state = { session: 'tabAAAAAAAAAAAAA', seq: 7, x: 4.567, y: 6.123, facing: 'left' as const, moving: true };
  const parsed = parseState(encodeState(state), BOUNDS);
  assert.deepEqual(parsed, { ...state, x: 4.57, y: 6.12 });
  assert.deepEqual(parseState(good, BOUNDS), { session: 'tabAAAAAAAAAAAAA', seq: 3, x: 4.5, y: 6.25, facing: 'left', moving: true });
});

test('invalid movement payloads are rejected', () => {
  const cases: [string, unknown][] = [
    ['null', null], ['array', [good]], ['string', 'hello'],
    ['wrong version', { ...good, v: 2 }], ['missing version', { ...good, v: undefined }],
    ['NaN x', { ...good, x: Number.NaN }], ['Infinity y', { ...good, y: Number.POSITIVE_INFINITY }],
    ['negative x', { ...good, x: -0.1 }], ['outside map', { ...good, x: 20.01 }], ['outside map y', { ...good, y: 99 }],
    ['string x', { ...good, x: '4' }], ['bad facing', { ...good, f: 'up' }], ['bad moving', { ...good, m: true }],
    ['negative seq', { ...good, q: -1 }], ['fractional seq', { ...good, q: 1.5 }], ['huge seq', { ...good, q: 2 ** 40 }],
    ['short session', { ...good, s: 'abc' }], ['session with symbols', { ...good, s: '<script>alert(1)' }],
    ['long session', { ...good, s: 'a'.repeat(33) }], ['missing session', { ...good, s: undefined }],
  ];
  for (const [label, payload] of cases) assert.equal(parseState(payload, BOUNDS), null, label);
});

test('extra fields cannot smuggle identity: the sender is decided by the topic, not the payload', () => {
  const parsed = parseState({ ...good, playerId: B, userId: B, name: 'Admin' }, BOUNDS);
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ['facing', 'moving', 'seq', 'session', 'x', 'y']);
});

test('presence ids: yourself, malformed keys and overflow are ignored', () => {
  const state = { [A]: [{}], [B]: [{}], 'not-a-uuid': [{}], [B.toUpperCase()]: [{}] };
  assert.deepEqual(presentPlayerIds(state, A), [B]);
  assert.deepEqual(presentPlayerIds(null, A), []);
  assert.deepEqual(presentPlayerIds([A, B], A), []);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`0f0e0d0c-0b0a-4000-8000-${String(i).padStart(12, '0')}`, [{}]]));
  assert.equal(presentPlayerIds(many, A, 30).length, 30);
});

test('profiles from the database are validated; bad rows are dropped', () => {
  const avatar = { body: 'femme', skin: 'deep', headwear: 'gele', outfit: 'adire' };
  const profiles = parseProfiles([
    { player_id: A, character_name: 'Adé Bello', avatar },
    { player_id: B, character_name: '<img src=x>', avatar },
    { player_id: 'nope', character_name: 'Valid Name', avatar },
    { player_id: B, character_name: 'Bayo', avatar: { ...avatar, outfit: 'gold' } },
    null,
  ]);
  assert.deepEqual([...profiles.keys()], [A]);
  assert.equal(profiles.get(A)?.name, 'Adé Bello');
  assert.equal(parseProfiles('rows').size, 0);
});

test('session ids are valid and differ between tabs', () => {
  const a = newSessionId(); const b = newSessionId();
  assert.ok(/^[A-Za-z0-9]{16}$/.test(a));
  assert.notEqual(a, b);
  assert.ok(isPlayerId(A));
  assert.equal(isPlayerId(A.toUpperCase()), false);
});
