const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/data.js');
const E = require('../js/engine.js');

function clearEvents(s) {
  while (s.events.length) E.resolveEvent(s, 0);
}

function ageTo(s, age) {
  while (s.age < age && s.alive) { clearEvents(s); E.ageUp(s); }
  clearEvents(s);
}

test('data integrity: every reference points at something real', () => {
  const towns = new Set(D.TOWNS.map((t) => t.id));
  const places = new Set(D.PLACES.map((p) => p.id));
  const lgas = new Set(D.LGAS.map((l) => l.id));
  assert.strictEqual(D.LGAS.length, 20, 'Ogun State has 20 LGAs');
  for (const t of D.TOWNS) assert.ok(lgas.has(t.lga), `town ${t.id} lga`);
  for (const i of D.INSTITUTIONS) {
    assert.ok(towns.has(i.town), `institution ${i.id} town`);
    for (const c of i.courses) assert.ok(D.COURSES[c], `institution ${i.id} course ${c}`);
  }
  for (const sc of D.SECONDARY) assert.ok(towns.has(sc.town), `school ${sc.id} town`);
  for (const p of D.PLACES) assert.ok(towns.has(p.town), `place ${p.id} town`);
  for (const j of D.JOBS) {
    if (j.place) assert.ok(places.has(j.place), `job ${j.id} place`);
    assert.ok(D.LEVEL_RANK[j.req.level] != null, `job ${j.id} level`);
  }
  // Everything should sit inside (roughly) Ogun State.
  const [[s, w], [n, e]] = D.OGUN_BOUNDS;
  for (const x of [...D.TOWNS, ...D.INSTITUTIONS, ...D.SECONDARY, ...D.PLACES]) {
    assert.ok(x.lat > s && x.lat < n && x.lng > w && x.lng < e, `${x.id} inside Ogun bounds`);
  }
});

test('same seed replays the same life', () => {
  const a = E.newGame({ seed: 99, town: 'sagamu' });
  const b = E.newGame({ seed: 99, town: 'sagamu' });
  ageTo(a, 30);
  ageTo(b, 30);
  assert.deepStrictEqual(a, b);
});

test('save files round-trip', () => {
  const s = E.newGame({ seed: 5 });
  ageTo(s, 12);
  const copy = E.deserialize(E.serialize(s));
  assert.deepStrictEqual(copy, s);
  assert.throws(() => E.deserialize('{"version":0}'));
});

test('a child goes through primary and secondary school on schedule', () => {
  const s = E.newGame({ seed: 11, town: 'ijebu-ode', wealth: 'average' });
  ageTo(s, 5);
  assert.strictEqual(s.edu.stage, 'primary');
  ageTo(s, 11);
  assert.strictEqual(s.edu.stage, 'secondary');
  assert.strictEqual(s.edu.highest, 'FSLC');
  ageTo(s, 17);
  assert.strictEqual(s.edu.stage, 'out');
  assert.ok(s.edu.waec && s.edu.jamb, 'has WAEC and JAMB results');
});

test('minors do not go into debt from life events', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const s = E.newGame({ seed, wealth: 'poor' });
    ageTo(s, 15);
    if (s.alive) assert.ok(s.money >= 0, `seed ${seed}: money ${s.money}`);
  }
});

test('admission, graduation and NYSC unlock graduate jobs', () => {
  const s = E.newGame({ seed: 3, town: 'abeokuta', wealth: 'rich' });
  ageTo(s, 17);
  // Make this deterministic: a strong student.
  s.stats.smarts = 90; s.stats.health = 100;
  s.edu.waec = { credits: 8, year: s.year };
  s.edu.jamb = { score: 300, year: s.year };
  let r;
  for (let i = 0; i < 5 && s.edu.stage !== 'tertiary'; i++) {
    r = E.applyTertiary(s, 'funaab', 'compsci');
    if (s.edu.stage !== 'tertiary') { clearEvents(s); E.ageUp(s); clearEvents(s); }
  }
  assert.strictEqual(s.edu.stage, 'tertiary', r && r.msg);
  assert.ok(E.jobEligibility(s, 'banker'), 'cannot be a banker while studying');
  let guard = 0;
  while (s.edu.stage === 'tertiary' && guard++ < 15) { clearEvents(s); E.ageUp(s); }
  assert.strictEqual(s.edu.highest, 'BSc');
  assert.ok(s.edu.fields.includes('tech'));
  // The NYSC call-up should be waiting; accept the posting.
  assert.strictEqual(s.events[0].id, 'nysc-call');
  E.resolveEvent(s, 0);
  assert.strictEqual(s.nysc.status, 'serving');
  assert.match(E.jobEligibility(s, 'banker'), /NYSC/);
  E.ageUp(s);
  clearEvents(s);
  assert.strictEqual(s.nysc.status, 'done');
  assert.strictEqual(E.jobEligibility(s, 'banker'), null);
});

test('JAMB below cut-off is rejected', () => {
  const s = E.newGame({ seed: 8, wealth: 'rich' });
  ageTo(s, 17);
  s.edu.waec = { credits: 7, year: s.year };
  s.edu.jamb = { score: 150, year: s.year };
  const r = E.applyTertiary(s, 'oou', 'medicine');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(s.edu.stage, 'out');
});

test('trips cost money and transport limits apply', () => {
  const s = E.newGame({ seed: 4, town: 'abeokuta' });
  ageTo(s, 18);
  s.money = 1000000;
  const far = E.PLACE['awujale'];
  assert.strictEqual(E.tripQuote(s, far, 'keke').ok, false, 'keke will not go to Ijebu-Ode from Abeokuta');
  assert.strictEqual(E.tripQuote(s, far, 'car').ok, false, 'no car owned');
  const before = s.money;
  const r = E.visitPlace(s, 'olumo', 'bus');
  assert.ok(r.ok, r.msg);
  assert.ok(s.money < before);
  assert.strictEqual(E.visitPlace(s, 'olumo', 'bus').ok, false, 'once per year');
});

test('a whole life always ends', () => {
  for (const seed of [1, 2, 3]) {
    const s = E.newGame({ seed });
    let guard = 0;
    while (s.alive && guard++ < 150) { clearEvents(s); E.ageUp(s); }
    assert.strictEqual(s.alive, false);
    assert.strictEqual(s.ended.type, 'death');
  }
});
