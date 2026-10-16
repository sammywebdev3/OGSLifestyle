const test = require('node:test');
const assert = require('node:assert');
const SO = require('../js/society.js');
const L = require('../js/life.js');
const E = require('../js/engine.js');

function clearEvents(s, choice = 0) {
  let guard = 0;
  while (s.events.length && guard++ < 50) E.resolveEvent(s, Math.min(choice, s.events[0].choices.length - 1));
}

function growUp(s, age) {
  let guard = 0;
  while (s.alive && s.age < age && guard++ < 200000) { clearEvents(s); L.autoStep(s); }
  clearEvents(s);
}

test('backgrounds: politician families get a parent with a title', () => {
  const s = E.newGame({ seed: 21, wealth: 'politician' });
  assert.ok(s.family.politician);
  const parent = s.relations.find((r) => r.role === s.family.politician.role);
  assert.ok(parent.title);
  for (const w of ['poor', 'average', 'comfortable', 'rich']) assert.strictEqual(E.newGame({ seed: 1, wealth: w }).family.wealth, w);
});

test('the calendar: 28 days make a year and a birthday', () => {
  const s = E.newGame({ seed: 2 });
  assert.strictEqual(s.age, 0);
  for (let d = 0; d < 28; d++) { clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); while (s.clock.day === d + 1 && s.age === 0) { clearEvents(s); L.autoStep(s); } }
  assert.strictEqual(s.age, 1);
  assert.strictEqual(s.clock.day <= 2, true);
});

test('needs decay over time and eating restores hunger', () => {
  const s = E.newGame({ seed: 3 });
  s.needs.hunger = 80;
  L.passTime(s, 4 * 60);
  assert.ok(s.needs.hunger < 70);
  const before = s.needs.hunger;
  const r = L.doAction(s, 'home-food');
  assert.ok(r.ok, r.msg);
  assert.ok(s.needs.hunger > before);
});

test('autopilot keeps a child alive, in school and out of debt', () => {
  for (const seed of [4, 5, 6]) {
    const s = E.newGame({ seed, wealth: 'poor' });
    growUp(s, 16);
    assert.ok(s.alive, `seed ${seed} died: ${s.ended && s.ended.cause}`);
    assert.strictEqual(s.edu.stage, 'secondary');
    assert.ok(s.money >= 0, `seed ${seed} money ${s.money}`);
  }
});

test('work pays on Saturday and rent is charged when living alone', () => {
  const s = E.newGame({ seed: 7, town: 'abeokuta' });
  growUp(s, 20);
  s.edu.stage = 'out'; s.edu.current = null;
  s.money = 5000000;
  E.hire(s, 'trader');
  assert.ok(E.moveOut(s, 'abeokuta').ok);
  // Fast-forward to Monday morning
  while (s.clock.dow !== 0) { clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); }
  const start = s.money;
  for (let i = 0; i < 7; i++) { clearEvents(s); L.fastForward(s, 'day'); clearEvents(s); }
  const pays = s.log.filter((l) => l.text.includes('Payday'));
  const rents = s.log.filter((l) => l.text.includes('Rent, food & bills'));
  assert.ok(pays.length >= 1, 'got paid');
  assert.ok(rents.length >= 1, 'paid rent');
  assert.notStrictEqual(s.money, start);
});

test('crime → arrest → court → prison → release', () => {
  const s = E.newGame({ seed: 8 });
  growUp(s, 18);
  s.heat = 100;
  let tries = 0;
  while (!s.events.some((e) => e.id === 'arrest') && tries++ < 50) {
    s.clock.min = 9 * 60;
    L.doAction(s, 'crime-shoplift');
    if (s.events.length && s.events[0].id !== 'arrest') clearEvents(s);
  }
  assert.strictEqual(s.events[0].id, 'arrest');
  const legalAid = s.events[0].choices.findIndex((c) => c.value === 'legalaid');
  E.resolveEvent(s, legalAid);
  assert.strictEqual(s.events[0].id, 'court');
  E.resolveEvent(s, 0); // plead guilty
  assert.ok(s.jail, 'in jail');
  assert.ok(s.record.length >= 1);
  assert.match(E.applyJob(s, 'trader').msg, /prison/);
  let guard = 0;
  while (s.jail && guard++ < 20000) { clearEvents(s, 1); L.autoStep(s); }
  assert.strictEqual(s.jail, null, 'released');
});

test('a politician parent can "make a call" for a job', () => {
  const s = E.newGame({ seed: 9, wealth: 'politician' });
  growUp(s, 18);
  s.edu.stage = 'out'; s.edu.current = null; s.edu.highest = 'SSCE';
  s.nysc = null;
  // IT support normally needs an ND in tech; connections bend the rules a little.
  assert.ok(E.jobEligibility(s, 'it-support'), 'not normally eligible');
  const r = SO.useConnection(s, 'it-support');
  assert.ok(r.ok, r.msg);
  assert.ok(s.job);
  assert.strictEqual(SO.useConnection(s, 'factory').ok, false, 'once a year');
});

test('politics: join, declare, win the primary and the election', () => {
  const s = E.newGame({ seed: 10 });
  growUp(s, 25);
  s.edu.highest = 'SSCE';
  s.money = 100000000;
  s.record = [];
  assert.ok(SO.joinParty(s, 'ppc').ok);
  assert.ok(SO.declare(s, 'councillor').ok);
  assert.strictEqual(s.events[0].id, 'primary');
  s.politics.popularity = 95;
  const settle = s.events[0].choices.findIndex((c) => c.value === 'settle');
  E.resolveEvent(s, settle);
  // The primary has some luck in it; retry deterministically if lost.
  let attempts = 0;
  while (!(s.politics.candidacy && s.politics.candidacy.primary) && attempts++ < 10) {
    clearEvents(s);
    s.yearActs = {};
    SO.declare(s, 'councillor');
    E.resolveEvent(s, settle);
  }
  assert.ok(s.politics.candidacy.primary, 'party candidate');
  const electionYear = s.politics.candidacy.year;
  s.politics.popularity = 100;
  s.politics.rigged = true;
  let guard = 0;
  while (s.year <= electionYear && s.alive && guard++ < 100000) { clearEvents(s); s.politics.popularity = 100; L.autoStep(s); }
  clearEvents(s);
  assert.strictEqual(s.politics.best, 'councillor', 'won the seat');
  assert.ok(s.log.some((l) => l.text.includes('sworn in as Ward Councillor')));
});

test('version 1 saves migrate to the daily format', () => {
  const s = E.newGame({ seed: 11 });
  const v1 = JSON.parse(E.serialize(s));
  v1.version = 1;
  for (const k of ['jail', 'heat', 'crimes', 'politics', 'daily', 'clock', 'needs', 'dayActs', 'auto']) delete v1[k];
  v1.prison = 2;
  const m = E.deserialize(JSON.stringify(v1));
  assert.strictEqual(m.version, 2);
  assert.ok(m.jail && m.jail.daysLeft === 2 * E.DAYS_PER_YEAR);
  assert.ok(m.clock && m.needs && m.politics);
  assert.strictEqual(m.prison, undefined);
});

test('a whole daily life is deterministic for a seed', () => {
  const run = () => { const s = E.newGame({ seed: 12, wealth: 'rich' }); growUp(s, 12); return E.serialize(s); };
  assert.strictEqual(run(), run());
});
