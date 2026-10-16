const test = require('node:test');
const assert = require('node:assert');
require('../js/society.js');
const H = require('../js/hustle.js');
const L = require('../js/life.js');
const E = require('../js/engine.js');
const AB = require('../js/adboard.js');
const ST = require('../js/store.js');

function clearEvents(s) {
  let guard = 0;
  while (s.events.length && guard++ < 50) {
    const i = s.events[0].choices.findIndex((c) => !c.disabled);
    E.resolveEvent(s, i < 0 ? 0 : i);
  }
}
function toSaturday(s) {
  let guard = 0;
  while (s.clock.dow !== 5 && guard++ < 20) { clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); }
}

test('hustle mode starts in Abeokuta with ₦50,000 and a self-contain', () => {
  const s = H.newHustleGame({ seed: 1, first: 'Tobi', last: 'Bakare', village: 'ogbere' });
  assert.strictEqual(s.money, 50000);
  assert.strictEqual(s.town, 'abeokuta');
  assert.strictEqual(s.homeTown, 'ogbere');
  assert.strictEqual(s.hustle.house, 'selfcon');
  assert.ok(s.age >= 19 && s.age <= 23);
  assert.strictEqual(H.levelInfo(s).level <= 2, true);
  assert.deepStrictEqual(E.deserialize(E.serialize(s)), s, 'save round-trips');
});

test('adire: buy at Itoku, sell for profit, stock is tracked', () => {
  const s = H.newHustleGame({ seed: 2 });
  const p = H.adirePrices(s);
  assert.ok(p.buy < p.local && p.local < p.lagos, 'Itoku < local < Lagos');
  assert.ok(L.doAction(s, 'adire-buy').ok);
  assert.strictEqual(s.hustle.adire, 5);
  assert.strictEqual(s.money, 50000 - p.buy * 5);
  clearEvents(s);
  const before = s.money;
  assert.ok(L.doAction(s, 'adire-local').ok);
  assert.ok(s.hustle.adire < 5 && s.money > before);
});

test('okada pays per shift, and TRACE can impound the bike', () => {
  const s = H.newHustleGame({ seed: 3 });
  const before = s.money;
  assert.ok(L.doAction(s, 'okada-ride').ok);
  assert.ok(s.money > before);
  s.hustle.impound = 2;
  assert.strictEqual(L.doAction(s, 'okada-ride').ok, false);
});

test('influencer gains followers with diminishing returns', () => {
  const s = H.newHustleGame({ seed: 4 });
  s.hustle.followers = 1000000;
  s.clock.min = 8 * 60;
  L.doAction(s, 'content-skit');
  assert.ok(s.hustle.followers < 1200000, 'big accounts do not explode');
});

test('watch-ad doubles the last hustle once a day', () => {
  const s = H.newHustleGame({ seed: 5 });
  assert.ok(H.canDouble(s), 'nothing to double yet');
  L.doAction(s, 'okada-ride');
  clearEvents(s);
  const earned = s.hustle.lastEarn.amount;
  const before = s.money;
  assert.ok(H.doubleLast(s).ok);
  assert.strictEqual(s.money, before + earned);
  assert.strictEqual(H.doubleLast(s).ok, false);
});

test('missing rent twice gets you locked out; paying arrears lets you back in', () => {
  const s = H.newHustleGame({ seed: 6 });
  s.money = 0;
  toSaturday(s);
  // Saturday passed with no money
  assert.ok(s.hustle.owed >= H.HOUSES.selfcon.weekly);
  s.money = 0;
  L.fastForward(s, 'day'); clearEvents(s);
  toSaturday(s); s.money = 0;
  let guard = 0;
  while (!s.hustle.lockedOut && guard++ < 10) { s.money = 0; clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); }
  assert.ok(s.hustle.lockedOut, 'locked out');
  s.clock.min = 9 * 60;
  assert.match(L.listActions(s).find((a) => a.id === 'shower').why, /locked out/);
  s.money = s.hustle.owed + 1000;
  assert.ok(H.payArrears(s).ok);
  assert.strictEqual(s.hustle.lockedOut, false);
});

test('sapa blocks clubs; zones gate trips', () => {
  const s = H.newHustleGame({ seed: 7 });
  s.money = 0;
  s.clock.min = 21 * 60;
  assert.match(L.listActions(s).find((a) => a.id === 'club').why, /Sapa/i);
  s.money = 1000000;
  const r = L.trip(s, 'awujale', 'bus'); // Ijebu-Ode — locked at level 1
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /unlocks at level/);
  s.clock.min = 8 * 60;
  assert.ok(L.trip(s, 'olumo', 'trek').ok, 'can trek to Olumo for free');
});

test('Saturday owambe and choices you cannot afford are disabled', () => {
  const s = H.newHustleGame({ seed: 8 });
  s.money = 5000;
  let guard = 0;
  while (!s.events.some((e) => e.id === 'owambe-sat') && guard++ < 20) { clearEvents(s); L.fastForward(s, 'day'); }
  const ev = s.events.find((e) => e.id === 'owambe-sat');
  assert.ok(ev, 'owambe happened');
  for (const c of ev.choices) if (/₦1,000,000/.test(c.label)) assert.fail('should not offer spraying ₦1m when broke');
});

test('level rises with clout and money; building a house needs land', () => {
  const s = H.newHustleGame({ seed: 9 });
  const l1 = H.levelInfo(s).level;
  s.money = 30000000;
  s.hustle.clout = 60;
  assert.ok(H.levelInfo(s).level > l1 + 5);
  assert.strictEqual(H.buildHouse(s).ok, false);
  assert.ok(H.buyAsset(s, 'land-owode').ok);
  assert.ok(H.buildHouse(s).ok);
  assert.ok(s.hustle.houseBuilt);
});

test('auto-routine keeps a hustler alive for a year', () => {
  for (const seed of [10, 11]) {
    const s = H.newHustleGame({ seed });
    s.auto = true;
    L.doAction(s, 'okada-ride');
    const age = s.age;
    let guard = 0;
    while (s.alive && s.age === age && guard++ < 5000) { clearEvents(s); L.autoStep(s); }
    assert.ok(s.alive, `seed ${seed}: ${s.ended && s.ended.cause}`);
    assert.strictEqual(s.age, age + 1);
  }
});

test('ads board only shows ads inside their run; store charges nothing without payments', async () => {
  assert.ok(AB.active(new Date('2026-10-16')).length >= 1);
  assert.strictEqual(AB.active(new Date('2020-01-01')).length, 0);
  const s = H.newHustleGame({ seed: 12 });
  const r = await ST.purchase(s, 'ise-owo-200k');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.money, 50000);
});
