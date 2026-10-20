import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_HISTORY_LIMIT, CHAT_MAX_CHARS, ChatLog, EMOTE_IDS, InboundGate, RateLimiter, encodeChat, encodeEmote, isEmoteId, parseChat, parseEmote, sanitizeChatText } from './chat.ts';

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const S = 'tabAAAAAAAAAAAAA';

test('message length: 1 to 200 characters, counted as characters not bytes', () => {
  assert.equal(sanitizeChatText('a'.repeat(CHAT_MAX_CHARS)), 'a'.repeat(200));
  assert.equal(sanitizeChatText('a'.repeat(CHAT_MAX_CHARS + 1)), null);
  assert.equal(sanitizeChatText('😂'.repeat(200))?.length, 400, '200 emoji (2 UTF-16 units each) are allowed');
  assert.equal(sanitizeChatText('😂'.repeat(201)), null);
  for (const empty of ['', '   ', cp(0x200b, 0x200b), '\t\n']) assert.equal(sanitizeChatText(empty), null, JSON.stringify(empty));
  assert.equal(sanitizeChatText(42), null);
  assert.equal(sanitizeChatText(null), null);
});

test('text cleaning: whitespace, control, invisible and bidi characters', () => {
  assert.equal(sanitizeChatText('  hello   there \n friend\t!  '), 'hello there friend !');
  assert.equal(sanitizeChatText('a' + cp(0x0000) + 'b' + cp(0x0007) + 'c' + cp(0x009b) + 'd'), 'abcd');
  assert.equal(sanitizeChatText('evil' + cp(0x202e) + 'txt.exe'), 'eviltxt.exe', 'right-to-left override removed');
  assert.equal(sanitizeChatText('x' + cp(0x2066) + 'y' + cp(0x2069) + cp(0xfeff) + cp(0x200d) + 'z'), 'xyz');
});

test('Yoruba tone marks survive; "zalgo" stacks of combining marks are capped', () => {
  assert.equal(sanitizeChatText('Ẹ ku àárọ̀'), 'Ẹ ku àárọ̀'.normalize('NFC'));
  const zalgo = 'a' + cp(0x0301, 0x0302, 0x0303, 0x0304, 0x0305, 0x0306);
  // NFC first merges a + U+0301 into "á"; then at most 2 more marks may follow it.
  assert.equal(sanitizeChatText(zalgo), ('a' + cp(0x0301)).normalize('NFC') + cp(0x0302, 0x0303));
  assert.equal(Array.from(sanitizeChatText('x' + cp(0x0300).repeat(500)) ?? '').length, 3, '500 stacked marks become 2');
});

test('HTML and script-like text is kept as literal text (it is never rendered as HTML)', () => {
  assert.equal(sanitizeChatText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  assert.equal(sanitizeChatText('<script>alert("hi")</script>'), '<script>alert("hi")</script>');
});

test('chat wire format round-trips; invalid payloads are rejected', () => {
  assert.deepEqual(parseChat(encodeChat(S, 3, 'Báwo ni?')), { session: S, n: 3, text: 'Báwo ni?' });
  const good = encodeChat(S, 1, 'hi');
  const bad: [string, unknown][] = [
    ['null', null], ['array', [good]], ['wrong version', { ...good, v: 2 }], ['bad session', { ...good, s: 'x' }],
    ['negative n', { ...good, n: -1 }], ['fraction n', { ...good, n: 1.5 }], ['text not string', { ...good, t: 5 }],
    ['empty text', { ...good, t: '   ' }], ['too long', { ...good, t: 'a'.repeat(201) }], ['huge payload', { ...good, t: 'a'.repeat(5000) }],
  ];
  for (const [label, p] of bad) assert.equal(parseChat(p), null, label);
  assert.deepEqual(Object.keys(parseChat({ ...good, name: 'Admin', playerId: 'someone-else' }) ?? {}).sort(), ['n', 'session', 'text'], 'no name or id can be smuggled in');
});

test('emote validation: only wave, greet, laugh and heart', () => {
  assert.deepEqual(EMOTE_IDS, ['wave', 'greet', 'laugh', 'heart']);
  for (const e of EMOTE_IDS) assert.deepEqual(parseEmote(encodeEmote(S, 1, e)), { session: S, n: 1, emote: e });
  for (const bad of ['dance', 'WAVE', '', '__proto__', 'constructor', 'toString', 1, null]) {
    assert.equal(isEmoteId(bad), false, String(bad));
    assert.equal(parseEmote({ v: 1, s: S, n: 1, e: bad }), null, String(bad));
  }
});

test('rate limiter: a burst up to capacity, then one per refill period', () => {
  const r = new RateLimiter(5, 2000);
  for (let i = 0; i < 5; i++) assert.equal(r.tryTake(0), true, `burst ${i}`);
  assert.equal(r.tryTake(10), false, 'sixth message held back');
  assert.equal(r.tryTake(1999), false);
  assert.equal(r.tryTake(2010), true, 'one more after 2 s');
  assert.equal(r.tryTake(2020), false);
  assert.equal(new RateLimiter(5, 2000).tryTake(0), true);
});

test('receiving: per-sender rate limit and duplicate / out-of-order drop', () => {
  const g = new InboundGate();
  const B = 'b'; const C = 'c';
  let shown = 0;
  for (let n = 1; n <= 20; n++) if (g.accept('chat', B, S, n, 0)) shown++;
  assert.equal(shown, 8, 'a flood of 20 messages at once shows only 8');
  assert.equal(g.accept('chat', C, S, 1, 0), true, 'another sender is not affected');
  assert.equal(g.accept('chat', C, S, 1, 5000), false, 'duplicate dropped');
  assert.equal(g.accept('chat', C, S, 0, 5000), false, 'older message dropped');
  assert.equal(g.accept('chat', C, 'tabOTHEROTHER123', 1, 5000), true, 'a new tab session starts its own numbering');
  assert.equal(g.accept('emote', C, S, 1, 5000), true, 'emotes are counted separately from chat');
  g.forget(C);
  assert.equal(g.accept('chat', C, S, 1, 6000), true, 'after leaving, a rejoining player starts fresh');
});

test('chat history is bounded and ignores repeats', () => {
  const log = new ChatLog();
  for (let i = 0; i < CHAT_HISTORY_LIMIT + 25; i++) log.add({ id: `p|${S}|${i}`, playerId: 'p', name: 'Bayo', text: `m${i}`, at: i, self: false });
  assert.equal(log.entries().length, CHAT_HISTORY_LIMIT);
  assert.equal(log.entries()[0]?.text, 'm25', 'oldest dropped first');
  assert.equal(log.entries().at(-1)?.text, `m${CHAT_HISTORY_LIMIT + 24}`);
  const before = log.entries();
  assert.equal(log.add({ id: `p|${S}|74`, playerId: 'p', name: 'Bayo', text: 'again', at: 0, self: false }), false);
  assert.equal(log.entries(), before, 'unchanged array when nothing was added');
});
