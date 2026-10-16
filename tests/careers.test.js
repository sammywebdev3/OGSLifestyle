const test = require('node:test');
const assert = require('node:assert');
require('../js/society.js');
const H = require('../js/hustle.js');
const C = require('../js/careers.js');
const L = require('../js/life.js');
const E = require('../js/engine.js');

function clearEvents(s) {
  let guard = 0;
  while (s.events.length && guard++ < 50) {
    const i = s.events[0].choices.findIndex((c) => !c.disabled);
    E.resolveEvent(s, i < 0 ? 0 : i);
  }
}
function nextWorkday(s) {
  let guard = 0;
  do { clearEvents(s); L.sleep(s); clearEvents(s); } while ((s.clock.dow >= 5 || L.hour(s) >= 12) && guard++ < 10);
}

test('character creation: two traits boost their skills, a dream and a look', () => {
  const s = H.newHustleGame({ seed: 4, start: 'village', traits: ['techie', 'musical', 'gymrat'], dream: 'star', look: { skin: 2, top: '#c0392b' } });
  assert.deepStrictEqual(s.hustle.traits, ['techie', 'musical'], 'only two traits');
  assert.strictEqual(C.skillLevel(s, 'coding'), 1);
  assert.strictEqual(C.skillLevel(s, 'music'), 1);
  assert.strictEqual(C.skillLevel(s, 'fitness'), 0);
  assert.strictEqual(s.hustle.dream, 'star');
  assert.deepStrictEqual(s.look, { skin: 2, top: '#c0392b' });
  // trait skills learn 50% faster
  const before = s.hustle.skills.coding;
  C.addXp(s, 'coding', 10);
  assert.strictEqual(s.hustle.skills.coding - before, 15);
});

test('skills level up from training and cap at 10', () => {
  const s = H.newHustleGame({ seed: 5 });
  assert.strictEqual(C.skillLevel(s, 'cooking'), 0);
  C.addXp(s, 'cooking', C.xpFor(3));
  assert.strictEqual(C.skillLevel(s, 'cooking'), 3);
  C.addXp(s, 'cooking', 99999);
  assert.strictEqual(C.skillLevel(s, 'cooking'), 10);
  s.clock.min = 10 * 60;
  const xp = s.hustle.skills.fitness || 0;
  assert.ok(L.doAction(s, 'gym').ok || true);
  if ((s.hustle.skills.fitness || 0) === xp) assert.fail('gym should train fitness');
});

test('jobs: apply, work shifts for pay, climb grades, and need skill for the next level', () => {
  const s = H.newHustleGame({ seed: 6 });
  assert.ok(C.apply(s, 'tech').ok);
  assert.strictEqual(C.careerTitle(s), 'Tech Intern I');
  nextWorkday(s);
  const m = s.money;
  const r = L.doAction(s, 'shift');
  assert.ok(r.ok, r.msg);
  assert.ok(s.money > m, 'paid for the shift');
  assert.ok(!L.listActions(s).find((a) => a.id === 'shift').why === false, 'one shift a day');
  // Full performance moves you up a grade; grade IV needs Coding 1 for the next level.
  const c = s.hustle.career;
  for (let g = 1; g < 4; g++) { c.perf = 100; C.promote(s); }
  assert.strictEqual(C.careerTitle(s), 'Tech Intern IV');
  c.perf = 100;
  const msg = C.promote(s);
  assert.match(msg, /Coding 1/);
  assert.strictEqual(c.level, 1);
  C.addXp(s, 'coding', C.xpFor(1));
  C.promote(s);
  assert.strictEqual(c.level, 2);
  assert.strictEqual(C.careerTitle(s), 'Junior Developer I');
  assert.ok(C.shiftPay(c) > C.CAREERS.tech.pay[0]);
});

test('weekend and late rules for shifts; music works nights', () => {
  const s = H.newHustleGame({ seed: 7 });
  C.apply(s, 'banking');
  s.clock.dow = 5; s.clock.min = 8 * 60;
  assert.match(C.shiftWhy(s), /weekend/);
  s.clock.dow = 1; s.clock.min = 14 * 60;
  assert.match(C.shiftWhy(s), /between 6am and noon/);
  C.apply(s, 'music');
  s.clock.min = 19 * 60;
  assert.strictEqual(C.shiftWhy(s), null);
});

test('dreams come true', () => {
  const s = H.newHustleGame({ seed: 8, dream: 'chairman' });
  C.apply(s, 'food');
  s.hustle.career.level = 5;
  assert.ok(C.checkDream(s));
  assert.ok(s.hustle.dreamDone);
  assert.ok(s.log.some((l) => l.text.includes('DREAM COME TRUE')));
});

test('autopilot goes to work on workdays', () => {
  const s = H.newHustleGame({ seed: 9 });
  s.auto = true;
  C.apply(s, 'civil');
  for (let d = 0; d < 7; d++) { clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); }
  assert.ok(s.hustle.career.shifts >= 3, `worked ${s.hustle.career.shifts} shifts`);
});
