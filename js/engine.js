/*
 * OGS Lifestyle — game engine.
 *
 * Pure game logic with no DOM access, so it runs in the browser and in Node
 * (see tests/). The whole game is one plain JSON-serialisable state object;
 * randomness comes from a seeded PRNG stored inside that state, so a save
 * file always replays the same way.
 */
(function (root, factory) {
  const data = (root.OGS && root.OGS.Data) || (typeof require === 'function' ? require('./data.js') : null);
  const mod = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Engine = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  const START_YEAR = 2026;
  const SAVE_VERSION = 1;
  const PRIMARY_START_AGE = 5;
  const NYSC_ALLOWANCE = 77000;

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const TOWN = byId(D.TOWNS);
  const INST = byId(D.INSTITUTIONS);
  const SEC = byId(D.SECONDARY);
  const PLACE = byId(D.PLACES);
  const JOB = byId(D.JOBS);
  const SKILL = byId(D.SKILLS);
  const ASSET = byId(D.ASSETS);

  // ---------- helpers ----------

  function rand(s) {
    // mulberry32
    let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
  const chance = (s, p) => rand(s) < p;
  const pick = (s, arr) => arr[Math.floor(rand(s) * arr.length)];
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const round1k = (n) => Math.round(n / 1000) * 1000;

  function naira(n) {
    const sign = n < 0 ? '-' : '';
    return sign + '₦' + Math.abs(Math.round(n)).toLocaleString('en-US');
  }

  function distanceKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    // Roads wind: multiply straight-line distance by 1.3.
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
  }

  function log(s, text, kind = 'info') {
    s.log.push({ age: s.age, year: s.year, text, kind });
    if (s.log.length > 600) s.log.splice(0, s.log.length - 600);
  }

  function stat(s, key, delta) {
    s.stats[key] = clamp(s.stats[key] + delta);
  }

  function hasAssetKind(s, kind) {
    return s.assets.some((a) => ASSET[a.id] && ASSET[a.id].kind === kind);
  }

  function relation(s, id) {
    return s.relations.find((r) => r.id === id);
  }

  function genName(s, gender) {
    return pick(s, D.NAMES[gender]);
  }

  function newPerson(s, role, gender, age, extra = {}) {
    const p = {
      id: 'p' + s.nextId++,
      first: genName(s, gender),
      last: extra.last || pick(s, D.NAMES.surname),
      role, gender, age,
      closeness: extra.closeness != null ? extra.closeness : randInt(s, 40, 90),
      alive: true,
    };
    return Object.assign(p, extra);
  }

  function fullName(p) { return p.first + ' ' + p.last; }

  function oncePerYear(s, key) {
    if (s.yearActs[key]) return false;
    s.yearActs[key] = true;
    return true;
  }

  function canAct(s) {
    if (!s.alive) return 'Game over.';
    if (s.ended) return 'This life has ended.';
    if (s.prison > 0) return 'You are in prison.';
    if (s.events.length) return 'Respond to the current event first.';
    return null;
  }

  // ---------- family wealth ----------

  const WEALTH = {
    poor: { label: 'Struggling', pocket: 20000, feeCap: 120000, inherit: 200000 },
    average: { label: 'Average', pocket: 60000, feeCap: 450000, inherit: 1500000 },
    comfortable: { label: 'Comfortable', pocket: 200000, feeCap: 2000000, inherit: 10000000 },
    rich: { label: 'Wealthy', pocket: 1000000, feeCap: 10000000, inherit: 60000000 },
  };

  function parentsAlive(s) {
    return s.relations.some((r) => (r.role === 'mother' || r.role === 'father') && r.alive);
  }

  // How much of a fee the parents will cover this year.
  function parentFeeShare(s, fee) {
    if (!parentsAlive(s) || s.age > 28) return 0;
    return Math.min(fee, WEALTH[s.family.wealth].feeCap);
  }

  function payFee(s, fee, what) {
    const parents = parentFeeShare(s, fee);
    const own = fee - parents;
    s.money -= own;
    if (parents && own) log(s, `Your parents paid ${naira(parents)} of the ${naira(fee)} ${what}; you paid ${naira(own)}.`, 'money');
    else if (parents) log(s, `Your parents paid the ${naira(fee)} ${what}.`, 'money');
    else log(s, `You paid ${naira(fee)} for ${what}.`, 'money');
  }

  // Costs from life events: parents cover them while you are a minor at home.
  function spend(s, amount) {
    if (s.age < 18 && s.livingWithParents && parentsAlive(s)) return;
    s.money -= amount;
  }

  function canAfford(s, fee) {
    return parentFeeShare(s, fee) + Math.max(0, s.money) >= fee;
  }

  // ---------- new game ----------

  function newGame(opts = {}) {
    const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31)) >>> 0;
    const s = {
      version: SAVE_VERSION,
      seed, rng: seed, nextId: 1,
      first: opts.first || 'Ade',
      last: opts.last || 'Ogunleye',
      gender: opts.gender === 'female' ? 'female' : 'male',
      age: 0, year: START_YEAR, alive: true, ended: null,
      stats: { health: 0, happiness: 0, smarts: 0, looks: 0 },
      karma: 50,
      money: 0,
      homeTown: TOWN[opts.town] ? opts.town : 'abeokuta',
      town: null,
      livingWithParents: true,
      rentMult: 1,
      family: { wealth: 'average' },
      edu: { stage: 'none', current: null, history: [], highest: 'none', fields: [], waec: null, jamb: null, effort: 0, nextSchool: null },
      nysc: null,
      skills: [], training: null,
      job: null, jobHistory: [], pension: 0,
      relations: [], assets: [], visited: [],
      flags: {}, yearActs: {},
      prison: 0, record: [],
      events: [],
      log: [],
    };
    s.town = s.homeTown;
    s.visited.push(s.town);
    s.stats.health = randInt(s, 70, 100);
    s.stats.happiness = randInt(s, 60, 95);
    s.stats.smarts = randInt(s, 15, 90);
    s.stats.looks = randInt(s, 20, 90);

    const w = opts.wealth && WEALTH[opts.wealth] ? opts.wealth : pick(s, ['poor', 'poor', 'average', 'average', 'average', 'comfortable', 'comfortable', 'rich']);
    s.family.wealth = w;

    s.relations.push(newPerson(s, 'father', 'male', randInt(s, 26, 48), { last: s.last }));
    s.relations.push(newPerson(s, 'mother', 'female', randInt(s, 21, 40), { last: s.last }));
    const sibs = randInt(s, 0, 3);
    for (let i = 0; i < sibs; i++) {
      const g = pick(s, ['male', 'female']);
      s.relations.push(newPerson(s, 'sibling', g, randInt(s, 1, 12), { last: s.last }));
    }

    const town = TOWN[s.town];
    log(s, `You were born in ${town.name}, ${lgaName(town.lga)} LGA, Ogun State, in ${s.year}. Your name is ${s.first} ${s.last}.`, 'milestone');
    log(s, `Your family is ${WEALTH[w].label.toLowerCase()}. Welcome to the Gateway State!`, 'info');
    return s;
  }

  function lgaName(id) {
    const l = D.LGAS.find((x) => x.id === id);
    return l ? l.name : id;
  }

  // ---------- age up ----------

  function ageUp(s) {
    if (!s.alive || s.ended) return false;
    if (s.events.length) return false;

    s.age++;
    s.year++;
    s.yearActs = {};
    log(s, `Age ${s.age} · ${s.year}`, 'year');

    yearRelations(s);
    if (s.prison > 0) {
      yearPrison(s);
    } else {
      yearEducation(s);
      yearTraining(s);
      yearNysc(s);
      yearJob(s);
    }
    yearFinance(s);
    yearAssets(s);
    yearHealth(s);
    if (deathCheck(s)) return true;

    if (s.prison <= 0) {
      scriptedEvents(s);
      if (!s.events.length && chance(s, 0.7)) randomEvent(s);
    }
    return true;
  }

  function yearRelations(s) {
    for (const r of s.relations) {
      if (!r.alive) continue;
      r.age++;
      r.closeness = clamp(r.closeness - 2);
      let p = r.age > 65 ? ((r.age - 60) ** 2) / 3000 : 0.002;
      if (r.role === 'child' && r.age < 5) p = 0.003;
      if (chance(s, p)) {
        r.alive = false;
        const rel = r.role === 'father' || r.role === 'mother' ? `Your ${r.role}` : r.role === 'spouse' ? 'Your spouse' : r.role === 'child' ? 'Your child' : r.role === 'sibling' ? 'Your sibling' : 'Your ' + r.role;
        log(s, `${rel}, ${fullName(r)}, passed away at ${r.age}. Rest in peace.`, 'bad');
        stat(s, 'happiness', -(r.closeness / 4 + 5));
        if ((r.role === 'father' || r.role === 'mother') && !parentsAlive(s)) {
          const inherit = round1k(WEALTH[s.family.wealth].inherit * (0.5 + rand(s)));
          s.money += inherit;
          log(s, `You inherited ${naira(inherit)} from your parents.`, 'money');
          if (s.livingWithParents && s.age >= 18) log(s, 'The family house is now yours to share with your siblings.', 'info');
        }
        if (r.role === 'spouse') r.role = 'late spouse';
      }
    }
    // Pocket money from parents
    if (s.livingWithParents && s.age >= 6 && s.age <= 22 && parentsAlive(s)) {
      const pocket = round1k(WEALTH[s.family.wealth].pocket * (0.6 + rand(s) * 0.8));
      s.money += pocket;
    }
    // Pressure to marry
    if (s.age >= 30 && s.age <= 40 && !s.relations.some((r) => r.role === 'spouse' && r.alive) && chance(s, 0.3)) {
      log(s, 'Your aunties asked at a family gathering, "When are we eating your rice?"', 'info');
      stat(s, 'happiness', -2);
    }
  }

  function yearPrison(s) {
    s.prison--;
    stat(s, 'happiness', -10);
    stat(s, 'health', -randInt(s, 2, 6));
    if (s.prison <= 0) {
      s.prison = 0;
      log(s, 'You have been released from prison. A fresh start awaits.', 'milestone');
      stat(s, 'happiness', 10);
    } else {
      log(s, `Another year in Ibara Prison, Abeokuta. ${s.prison} year(s) left.`, 'bad');
    }
  }

  // ---------- education ----------

  const SEC_YEARS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];

  function primarySchoolName(s) {
    const town = TOWN[s.town];
    if (s.family.wealth === 'rich' || s.family.wealth === 'comfortable') {
      return `${pick(s, ['Grace', 'Royal Crown', 'Bright Future', 'Corona', 'Kings & Queens'])} Nursery & Primary School, ${town.name}`;
    }
    return `${pick(s, ['Community', 'Baptist', 'Methodist', 'Ansar-Ud-Deen', "St. Peter's", 'Local Government', 'African Church'])} Primary School, ${town.name}`;
  }

  function yearEducation(s) {
    const e = s.edu;
    if (e.stage === 'none' && s.age === PRIMARY_START_AGE) {
      const name = primarySchoolName(s);
      const fees = s.family.wealth === 'rich' ? 600000 : s.family.wealth === 'comfortable' ? 250000 : 0;
      e.stage = 'primary';
      e.current = { kind: 'primary', name, year: 1, years: 6, fees };
      log(s, `You started Primary 1 at ${name}.`, 'milestone');
      if (fees) payFee(s, fees, 'school fees');
      return;
    }
    const c = e.current;
    if (!c) return;

    if (c.kind === 'primary') {
      if (c.year >= c.years) {
        e.history.push({ name: c.name, qualification: 'First School Leaving Certificate', year: s.year });
        e.highest = higher(e.highest, 'FSLC');
        log(s, `You graduated from ${c.name}.`, 'milestone');
        enrolSecondary(s);
      } else {
        c.year++;
        if (c.fees) payFee(s, c.fees, 'school fees');
        stat(s, 'smarts', randInt(s, 0, 2));
      }
      return;
    }

    if (c.kind === 'secondary') {
      if (c.year >= c.years) {
        graduateSecondary(s);
      } else {
        c.year++;
        if (c.fees) payFee(s, c.fees, 'school fees');
        stat(s, 'smarts', randInt(s, 0, 2));
        e.effort = Math.max(0, e.effort - 1);
      }
      return;
    }

    if (c.kind === 'tertiary') yearTertiary(s);
  }

  function enrolSecondary(s) {
    const e = s.edu;
    let school = e.nextSchool && SEC[e.nextSchool];
    let name, fees;
    if (school) {
      name = school.name; fees = school.fees;
      if (school.town !== s.town) log(s, `You moved into the boarding house at ${school.name}.`, 'info');
    } else {
      name = `${pick(s, ['Community', 'Comprehensive', 'Model', 'Muslim', 'Anglican'])} High School, ${TOWN[s.town].name}`;
      fees = 15000;
    }
    e.stage = 'secondary';
    e.current = { kind: 'secondary', name, schoolId: school ? school.id : null, year: 1, years: 6, fees };
    e.nextSchool = null;
    log(s, `You started JSS1 at ${name}.`, 'milestone');
    payFee(s, fees, 'school fees');
  }

  function waecScore(s, cheat) {
    const base = (s.stats.smarts + s.edu.effort * 2) / 11;
    return clamp(Math.round(base + rand(s) * 3 - 1.5 + (cheat ? 2 : 0)), 0, 9);
  }

  function jambScore(s) {
    return clamp(Math.round(70 + s.stats.smarts * 2.5 + s.edu.effort * 3 + (rand(s) * 70 - 35)), 0, 400);
  }

  function graduateSecondary(s) {
    const e = s.edu;
    const c = e.current;
    let credits = waecScore(s, s.flags.expo);
    let withheld = false;
    if (s.flags.expo && chance(s, 0.3)) { withheld = true; credits = 0; }
    e.waec = { credits, year: s.year, withheld };
    e.jamb = { score: jambScore(s), year: s.year };
    e.history.push({ name: c.name, qualification: credits >= 5 ? 'WAEC SSCE' : 'WAEC SSCE (incomplete)', year: s.year });
    if (credits >= 5) e.highest = higher(e.highest, 'SSCE');
    e.stage = 'out';
    e.current = null;
    s.flags.expo = false;
    log(s, `You finished SS3 at ${c.name}.`, 'milestone');
    if (withheld) log(s, 'WAEC withheld your results for examination malpractice! You will need to resit.', 'bad');
    else log(s, `WAEC result: ${credits} credit(s) out of 9${credits >= 5 ? ' — including English and Maths. You passed!' : '. Not enough for admission; consider a resit.'}`, credits >= 5 ? 'good' : 'bad');
    log(s, `JAMB UTME score: ${e.jamb.score}/400.`, e.jamb.score >= 200 ? 'good' : 'info');
    log(s, 'Open the Education tab to apply to universities, polytechnics or colleges of education.', 'info');
  }

  function higher(a, b) {
    return D.LEVEL_RANK[b] > D.LEVEL_RANK[a] ? b : a;
  }

  function classOfDegree(cgpa, level) {
    if (level === 'ND' || level === 'HND' || level === 'NCE') {
      if (cgpa >= 3.5 * 1.25) return 'Distinction';
      if (cgpa >= 3.0 * 1.25) return 'Upper Credit';
      if (cgpa >= 2.5 * 1.25) return 'Lower Credit';
      return 'Pass';
    }
    if (cgpa >= 4.5) return 'First Class';
    if (cgpa >= 3.5) return 'Second Class Upper';
    if (cgpa >= 2.4) return 'Second Class Lower';
    if (cgpa >= 1.5) return 'Third Class';
    return 'Pass';
  }

  function yearTertiary(s) {
    const e = s.edu;
    const c = e.current;
    const inst = INST[c.instId];
    // ASUU / ASUP strikes at public institutions
    if (inst.owner !== 'private' && chance(s, 0.15)) {
      const who = inst.kind === 'university' ? 'ASUU' : inst.kind === 'polytechnic' ? 'ASUP' : 'COEASU';
      log(s, `${who} went on strike for most of the year. Your session was extended.`, 'bad');
      stat(s, 'happiness', -6);
      return;
    }
    // grade for the year just completed
    const gp = clamp(0.8 + s.stats.smarts / 26 + e.effort * 0.08 + (rand(s) * 1.2 - 0.6) - (s.flags.cultist ? 0.6 : 0), 0, 5);
    c.gpSum += gp; c.gpN++;
    e.effort = Math.max(0, e.effort - 2);
    if (c.year >= c.years) {
      const cgpa = Math.round((c.gpSum / c.gpN) * 100) / 100;
      const cls = classOfDegree(cgpa, c.level);
      e.history.push({ name: inst.name, qualification: `${c.level} ${D.COURSES[c.courseId].name.replace(/ \(.*\)$/, '')}`, grade: `${cls} (${cgpa.toFixed(2)})`, year: s.year, level: c.level, field: D.COURSES[c.courseId].field, cgpa, instId: inst.id, courseId: c.courseId });
      e.highest = higher(e.highest, c.level);
      if (!e.fields.includes(D.COURSES[c.courseId].field)) e.fields.push(D.COURSES[c.courseId].field);
      e.stage = 'out';
      e.current = null;
      stat(s, 'happiness', 12);
      log(s, `🎓 You graduated from ${inst.short} with a ${c.level}, ${cls} (CGPA ${cgpa.toFixed(2)}).`, 'milestone');
      if ((c.level === 'BSc' || c.level === 'HND') && !s.nysc) {
        if (s.age <= 30) queueEvent(s, 'nysc-call');
        else { s.nysc = { status: 'exempt' }; log(s, 'You are over 30, so you received an NYSC exemption certificate.', 'info'); }
      }
      return;
    }
    c.year++;
    if (!c.scholarship) payFee(s, c.fees, `${inst.short} fees`);
    else log(s, 'Your scholarship covered this year\'s fees.', 'good');
  }

  // Programmes the player can apply to at an institution right now.
  function programmesAt(s, instId) {
    const inst = INST[instId];
    const out = [];
    for (const cid of inst.courses) {
      const course = D.COURSES[cid];
      out.push({ courseId: cid, mode: 'regular', level: course.level, years: course.years, name: course.name, req: inst.cutoff + course.jambBonus });
      // HND for ND holders in the same field
      if (course.level === 'ND' && s.edu.history.some((h) => h.level === 'ND' && h.field === course.field)) {
        out.push({ courseId: cid, mode: 'hnd', level: 'HND', years: 2, name: course.name.replace('(ND)', '(HND)'), req: 0 });
      }
      // Masters for degree holders in the same field
      if (inst.kind === 'university' && course.level === 'BSc' && s.edu.history.some((h) => h.level === 'BSc' && h.field === course.field && h.cgpa >= 2.4)) {
        out.push({ courseId: cid, mode: 'msc', level: 'MSc', years: 2, name: 'M.Sc ' + course.name.replace(/ \(.*\)$/, ''), req: 0 });
      }
    }
    return out;
  }

  function tertiaryFees(inst, mode) {
    return mode === 'msc' ? Math.round(inst.fees * 1.4) : mode === 'hnd' ? Math.round(inst.fees * 1.2) : inst.fees;
  }

  function applyTertiary(s, instId, courseId, mode = 'regular') {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const inst = INST[instId];
    const course = D.COURSES[courseId];
    const e = s.edu;
    if (!inst || !course || !inst.courses.includes(courseId)) return { ok: false, msg: 'That programme is not offered there.' };
    if (e.stage !== 'out') return { ok: false, msg: e.stage === 'tertiary' ? 'You are already enrolled in a programme.' : 'Finish secondary school first.' };
    const prog = programmesAt(s, instId).find((p) => p.courseId === courseId && p.mode === mode);
    if (!prog) return { ok: false, msg: 'You do not meet the entry requirement for that programme.' };
    if (mode === 'regular') {
      if (!e.waec || e.waec.credits < 5) return { ok: false, msg: 'You need at least 5 WAEC credits including English & Maths.' };
      if (!e.jamb) return { ok: false, msg: 'You need a JAMB UTME score.' };
      if (e.history.some((h) => h.level === course.level && h.courseId === courseId)) return { ok: false, msg: 'You already have that qualification.' };
    }
    const fees = tertiaryFees(inst, mode);
    if (!canAfford(s, fees)) return { ok: false, msg: `You cannot afford the ${naira(fees)} yearly fees right now.` };
    if (!oncePerYear(s, 'apply-' + instId)) return { ok: false, msg: `You already applied to ${inst.short} this year.` };

    let p;
    if (mode === 'regular') {
      const need = prog.req;
      if (e.jamb.score < need) {
        log(s, `${inst.short} rejected your application for ${course.name}: JAMB ${e.jamb.score} < cut-off ${need}.`, 'bad');
        return { ok: false, msg: `Your JAMB score (${e.jamb.score}) is below the ${need} cut-off.` };
      }
      p = inst.owner === 'private' ? 0.9 : 0.55 + (e.jamb.score - need) / 150 + (s.stats.smarts - course.smarts) / 120;
      if (inst.kind !== 'university') p += 0.25;
    } else {
      p = 0.75 + (s.stats.smarts - 50) / 200;
    }
    if (!chance(s, clamp(p, 0.05, 0.97))) {
      log(s, `${inst.short} did not offer you admission for ${prog.name}. Try again next year or try another school.`, 'bad');
      stat(s, 'happiness', -4);
      return { ok: false, msg: 'Admission not offered this time.' };
    }
    e.stage = 'tertiary';
    e.current = { kind: 'tertiary', instId, courseId, mode, level: prog.level, year: 1, years: prog.years, gpSum: 0, gpN: 0, fees, name: inst.name };
    s.flags.cultAsked = false;
    log(s, `🎉 Admission! You are now studying ${prog.name} at ${inst.name}.`, 'milestone');
    payFee(s, fees, `${inst.short} fees`);
    stat(s, 'happiness', 10);
    return { ok: true, msg: `Admitted to ${inst.short}!` };
  }

  function retakeJamb(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (s.edu.stage !== 'out' || !s.edu.waec) return { ok: false, msg: 'You can only write UTME after secondary school.' };
    const cost = 7700;
    if (s.money < cost) return { ok: false, msg: 'You cannot afford the UTME form.' };
    if (!oncePerYear(s, 'jamb')) return { ok: false, msg: 'UTME holds once a year.' };
    s.money -= cost;
    const score = jambScore(s);
    const prev = s.edu.jamb ? s.edu.jamb.score : 0;
    s.edu.jamb = { score: Math.max(score, prev), year: s.year };
    log(s, `You wrote JAMB UTME again and scored ${score}/400.`, score > prev ? 'good' : 'info');
    return { ok: true, msg: `UTME score: ${score}` };
  }

  function resitWaec(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (s.edu.stage !== 'out' || !s.edu.waec) return { ok: false, msg: 'You can only resit after secondary school.' };
    const cost = 28000;
    if (s.money < cost) return { ok: false, msg: 'You cannot afford the GCE/NECO registration.' };
    if (!oncePerYear(s, 'waec')) return { ok: false, msg: 'You already sat a resit this year.' };
    s.money -= cost;
    const credits = waecScore(s, false);
    s.edu.waec = { credits: Math.max(credits, s.edu.waec.withheld ? 0 : s.edu.waec.credits), year: s.year };
    if (s.edu.waec.credits >= 5) s.edu.highest = higher(s.edu.highest, 'SSCE');
    log(s, `You sat the NECO/GCE and got ${credits} credit(s).`, credits >= 5 ? 'good' : 'bad');
    return { ok: true, msg: `${credits} credits` };
  }

  function dropOut(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const c = s.edu.current;
    if (!c || c.kind !== 'tertiary') return { ok: false, msg: 'You can only drop out of tertiary education.' };
    log(s, `You dropped out of ${INST[c.instId].short}.`, 'bad');
    s.edu.history.push({ name: INST[c.instId].name, qualification: 'Dropped out', year: s.year });
    s.edu.stage = 'out';
    s.edu.current = null;
    stat(s, 'happiness', -5);
    return { ok: true, msg: 'You dropped out.' };
  }

  // ---------- skills & NYSC ----------

  function startTraining(s, skillId) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const sk = SKILL[skillId];
    if (!sk) return { ok: false, msg: 'Unknown skill.' };
    if (s.age < 14) return { ok: false, msg: 'You are too young for an apprenticeship.' };
    if (s.skills.includes(skillId)) return { ok: false, msg: 'You already have that skill.' };
    if (s.training) return { ok: false, msg: 'You are already in training.' };
    if (sk.requires && !s.edu.fields.includes(sk.requires.field)) return { ok: false, msg: 'You need a Law degree first.' };
    if (s.money < sk.cost) return { ok: false, msg: `You need ${naira(sk.cost)}.` };
    s.money -= sk.cost;
    s.training = { id: skillId, yearsLeft: sk.years };
    log(s, `You enrolled in ${sk.name} for ${naira(sk.cost)}.`, 'info');
    return { ok: true, msg: 'Training started.' };
  }

  function yearTraining(s) {
    if (!s.training) return;
    s.training.yearsLeft--;
    if (s.training.yearsLeft <= 0) {
      const sk = SKILL[s.training.id];
      s.skills.push(sk.id);
      if (sk.smarts) stat(s, 'smarts', sk.smarts);
      log(s, `You completed ${sk.name}! ${sk.id === 'lawschool' ? 'You have been called to the Nigerian Bar.' : ''}`.trim(), 'milestone');
      if (sk.id === 'coding' && !s.edu.fields.includes('tech')) s.edu.fields.push('tech');
      s.training = null;
    }
  }

  function yearNysc(s) {
    if (!s.nysc || s.nysc.status !== 'serving') return;
    const pay = NYSC_ALLOWANCE * 12;
    s.money += pay;
    log(s, `You finished your NYSC service year in ${s.nysc.state} and collected ${naira(pay)} in allowances. You received your discharge certificate!`, 'milestone');
    s.nysc.status = 'done';
    stat(s, 'happiness', 5);
  }

  function nyscCleared(s) {
    return !!s.nysc && (s.nysc.status === 'done' || s.nysc.status === 'exempt');
  }

  // ---------- jobs ----------

  function jobEligibility(s, jobId) {
    const j = JOB[jobId];
    if (!j) return 'Unknown job.';
    const r = j.req;
    if (s.age < (r.minAge || 18)) return `Minimum age ${r.minAge || 18}.`;
    const inSchool = s.edu.stage === 'primary' || s.edu.stage === 'secondary' || s.edu.stage === 'tertiary';
    if (inSchool && r.level !== 'none') return 'You can only take part-time hustles while in school.';
    if (s.nysc && s.nysc.status === 'serving') return 'You are serving with NYSC this year.';
    if (D.LEVEL_RANK[s.edu.highest] < D.LEVEL_RANK[r.level]) return `Requires ${r.level}.`;
    if (r.fields && r.level !== 'none' && !r.fields.some((f) => s.edu.fields.includes(f))) return `Requires a qualification in ${r.fields.join(' / ')}.`;
    if (r.nysc && !nyscCleared(s)) return 'Requires NYSC discharge or exemption certificate.';
    if (r.skill && !s.skills.includes(r.skill)) return `Requires skill: ${SKILL[r.skill].name}.`;
    if (r.minSmarts && s.stats.smarts < r.minSmarts) return `Requires smarts ${r.minSmarts}+.`;
    if (j.needsAsset && !hasAssetKind(s, j.needsAsset)) return `You need your own ${j.needsAsset}.`;
    if (s.job && s.job.id === jobId) return 'You already work here.';
    return null;
  }

  function jobTown(s, j) {
    if (j.place) return PLACE[j.place].town;
    return s.town;
  }

  function bestPrestige(s) {
    return s.edu.history.reduce((m, h) => (h.instId ? Math.max(m, INST[h.instId].prestige) : m), 0);
  }

  function applyJob(s, jobId) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const why = jobEligibility(s, jobId);
    if (why) return { ok: false, msg: why };
    if (!oncePerYear(s, 'job-' + jobId)) return { ok: false, msg: 'You already applied there this year.' };
    const j = JOB[jobId];
    let p = j.req.level === 'none' ? 0.85 : 0.35 + (s.stats.smarts - 50) / 150 + (s.stats.looks - 50) / 400 + bestPrestige(s) / 300;
    const best = s.edu.history.filter((h) => h.cgpa).map((h) => h.cgpa).sort((a, b) => b - a)[0];
    if (best >= 4.5) p += 0.15; else if (best && best < 2.4) p -= 0.1;
    if (!chance(s, clamp(p, 0.1, 0.95))) {
      log(s, `You applied to be a ${j.title} but didn't get the job.`, 'bad');
      stat(s, 'happiness', -3);
      return { ok: false, msg: 'Application unsuccessful.' };
    }
    if (s.job) leaveJob(s, 'resigned');
    let employer = j.place ? PLACE[j.place].name : TOWN[s.town].name;
    let town = jobTown(s, j);
    if (j.institution) {
      const unis = D.INSTITUTIONS.filter((i) => i.kind === 'university');
      const u = pick(s, unis);
      employer = u.name; town = u.town;
    }
    s.job = { id: jobId, title: j.levels[0], level: 0, salary: round1k(j.salary * (0.9 + rand(s) * 0.25)), years: 0, perf: 55, employer, town };
    log(s, `💼 You got a job as ${s.job.title} at ${employer} earning ${naira(s.job.salary)}/month.`, 'milestone');
    stat(s, 'happiness', 8);
    if (town !== s.town) {
      const d = Math.round(distanceKm(TOWN[s.town], TOWN[town]));
      log(s, `The job is in ${TOWN[town].name}, about ${d} km from where you live. Consider relocating to cut commuting costs.`, 'info');
    }
    return { ok: true, msg: `Hired as ${s.job.title}!` };
  }

  function leaveJob(s, how) {
    if (!s.job) return;
    s.jobHistory.push({ title: s.job.title, employer: s.job.employer, years: s.job.years, how, endYear: s.year });
    s.job = null;
  }

  function quitJob(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (!s.job) return { ok: false, msg: 'You have no job.' };
    log(s, `You resigned from your job as ${s.job.title}.`, 'info');
    leaveJob(s, 'resigned');
    return { ok: true, msg: 'Resigned.' };
  }

  function retire(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (!s.job) return { ok: false, msg: 'You have no job to retire from.' };
    if (s.age < 50) return { ok: false, msg: 'You can retire from age 50.' };
    s.pension = round1k(s.job.salary * 12 * Math.min(0.6, 0.02 * s.job.years + 0.1));
    log(s, `You retired as ${s.job.title}. Pension: ${naira(s.pension)}/year.`, 'milestone');
    leaveJob(s, 'retired');
    stat(s, 'happiness', 8);
    return { ok: true, msg: 'Retired.' };
  }

  function workHard(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (!s.job) return { ok: false, msg: 'You have no job.' };
    if (!oncePerYear(s, 'workhard')) return { ok: false, msg: 'You already put in extra effort this year.' };
    s.job.perf = clamp(s.job.perf + randInt(s, 8, 18));
    stat(s, 'happiness', -2);
    stat(s, 'health', -1);
    log(s, 'You worked extra hard this year. Your boss noticed.', 'good');
    return { ok: true, msg: 'Performance improved.' };
  }

  function askRaise(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (!s.job) return { ok: false, msg: 'You have no job.' };
    if (!oncePerYear(s, 'raise')) return { ok: false, msg: 'You already asked this year.' };
    if (chance(s, (s.job.perf - 30) / 100)) {
      s.job.salary = round1k(s.job.salary * 1.12);
      log(s, `You got a raise! New salary: ${naira(s.job.salary)}/month.`, 'good');
      return { ok: true, msg: 'Raise approved.' };
    }
    s.job.perf = clamp(s.job.perf - 8);
    log(s, 'Your boss said "the economy is hard" and refused your raise.', 'bad');
    return { ok: false, msg: 'Raise refused.' };
  }

  function yearJob(s) {
    if (!s.job) return;
    const j = JOB[s.job.id];
    const income = s.job.salary * 12;
    s.money += income;
    s.job.years++;
    s.job.perf = clamp(s.job.perf + randInt(s, -10, 8) + Math.round((s.stats.smarts - 50) / 15));
    if (j.risk && chance(s, j.risk * 0.03)) {
      stat(s, 'health', -randInt(s, 10, 25));
      log(s, `You had an accident on the job as ${s.job.title}.`, 'bad');
    }
    if (s.job.perf >= 70 && s.job.level < j.levels.length - 1 && chance(s, 0.4)) {
      s.job.level++;
      s.job.title = j.levels[s.job.level];
      s.job.salary = round1k(s.job.salary * (1.25 + rand(s) * 0.2));
      s.job.perf = 55;
      log(s, `📈 Promotion! You are now ${s.job.title}, earning ${naira(s.job.salary)}/month.`, 'milestone');
      stat(s, 'happiness', 8);
    } else if (s.job.perf < 20 && chance(s, 0.5)) {
      log(s, `You were sacked from your job as ${s.job.title}.`, 'bad');
      leaveJob(s, 'fired');
      stat(s, 'happiness', -12);
      return;
    }
    // Yearly cost-of-living increment
    if (chance(s, 0.4)) s.job.salary = round1k(s.job.salary * 1.05);
    // Commute
    if (s.job.town !== s.town) {
      const d = distanceKm(TOWN[s.town], TOWN[s.job.town]);
      const cost = round1k(d * 2 * D.TRANSPORT[hasAssetKind(s, 'car') ? 'car' : 'bus'].perKm * 230);
      s.money -= cost;
      if (d > 20) stat(s, 'happiness', -3);
      log(s, `Commuting ${Math.round(d)} km to ${TOWN[s.job.town].name} cost you ${naira(cost)} this year.`, 'money');
    }
  }

  // ---------- finance, assets, health ----------

  function livingCost(s) {
    if (s.livingWithParents) return 0;
    const t = TOWN[s.town];
    return Math.round(t.rent * s.rentMult) + 1100000;
  }

  function yearFinance(s) {
    if (s.prison > 0) return;
    const cost = livingCost(s);
    if (cost) {
      s.money -= cost;
      log(s, `Rent, food and bills in ${TOWN[s.town].name}: ${naira(cost)}.`, 'money');
    }
    const kids = s.relations.filter((r) => r.role === 'child' && r.alive && r.age < 18).length;
    if (kids) {
      const kc = kids * 450000;
      s.money -= kc;
      log(s, `Raising ${kids} child(ren) cost ${naira(kc)}.`, 'money');
    }
    if (s.pension) s.money += s.pension;
    if (s.flags.yahoo) {
      const loot = round1k(randInt(s, 2, 9) * 1000000);
      s.money += loot;
      log(s, `Your "online business" made ${naira(loot)} this year.`, 'money');
      if (chance(s, 0.25)) arrest(s, 'EFCC arrested you for internet fraud', randInt(s, 2, 5), true);
    }
    if (s.flags.cultist && chance(s, 0.12)) {
      arrest(s, 'Police raided a cult meeting and arrested you', randInt(s, 1, 3), false);
    }
    if (s.livingWithParents && s.age >= 23 && parentsAlive(s)) {
      const share = 300000;
      s.money -= share;
      log(s, `You contributed ${naira(share)} to household bills at your parents' house.`, 'money');
    }
    if (s.money < 0 && s.age >= 16) {
      const interest = round1k(-s.money * 0.25);
      s.money -= interest;
      stat(s, 'happiness', -5);
      log(s, `You are in debt. Loan apps charged ${naira(interest)} interest and keep calling your contacts.`, 'bad');
    }
  }

  function arrest(s, why, years, seize) {
    s.prison = years;
    s.record.push({ year: s.year, crime: why });
    if (seize && s.money > 0) s.money = Math.round(s.money * 0.1);
    if (s.job) leaveJob(s, 'arrested');
    s.flags.yahoo = false;
    s.flags.cultist = false;
    if (s.edu.current && s.edu.current.kind === 'tertiary') {
      s.edu.history.push({ name: s.edu.current.name, qualification: 'Expelled', year: s.year });
      s.edu.current = null;
      s.edu.stage = 'out';
    }
    log(s, `🚔 ${why}. You were sentenced to ${years} year(s) in prison.`, 'bad');
    stat(s, 'happiness', -25);
  }

  function yearAssets(s) {
    for (const a of s.assets) {
      const def = ASSET[a.id];
      if (def.depreciation) a.value = Math.round(a.value * (1 - def.depreciation));
      if (def.appreciation) a.value = Math.round(a.value * (1 + def.appreciation * (0.5 + rand(s))));
      if (def.rentIncome && !a.living) {
        s.money += def.rentIncome;
        log(s, `Tenants at your ${def.name} paid ${naira(def.rentIncome)} rent.`, 'money');
      }
    }
  }

  function yearHealth(s) {
    if (s.age > 40) stat(s, 'health', -randInt(s, 0, 2));
    if (s.age > 60) stat(s, 'health', -randInt(s, 1, 4));
    if (s.age < 25) stat(s, 'looks', randInt(s, -1, 2));
    if (s.age > 45) stat(s, 'looks', -randInt(s, 0, 2));
    // happiness drifts toward 55
    s.stats.happiness = clamp(Math.round(s.stats.happiness + (55 - s.stats.happiness) * 0.08));
    if (s.stats.happiness < 15) stat(s, 'health', -3);
  }

  function deathCheck(s) {
    let cause = null;
    if (s.stats.health <= 0) cause = 'poor health';
    else {
      let p = s.age < 18 ? 0.0002 : 0.0008;
      if (s.age >= 60) p += ((s.age - 55) ** 2 / 3000) * (1.5 - s.stats.health / 100);
      if (chance(s, p)) cause = s.age > 60 ? 'old age' : pick(s, ['a sudden illness', 'a road accident on the expressway', 'complications from malaria']);
    }
    if (!cause) return false;
    die(s, cause);
    return true;
  }

  function die(s, cause) {
    s.alive = false;
    s.ended = { type: 'death', cause, age: s.age, year: s.year };
    s.events = [];
    log(s, `🕊️ You died at age ${s.age} from ${cause}.`, 'bad');
  }

  // ---------- activities ----------

  const ACTIVITIES = [
    { id: 'study', name: 'Study hard', desc: 'Burn the midnight oil — better grades and exam scores.', minAge: 5, cost: 0 },
    { id: 'library', name: 'Read at the library', desc: 'Boost your smarts.', minAge: 8, cost: 0 },
    { id: 'gym', name: 'Hit the gym', desc: 'Get fit. ₦10,000 membership.', minAge: 14, cost: 10000 },
    { id: 'jog', name: 'Morning jog', desc: 'Free cardio round your area.', minAge: 10, cost: 0 },
    { id: 'worship', name: 'Church / Mosque', desc: 'Find peace and community.', minAge: 4, cost: 0 },
    { id: 'owambe', name: 'Owambe Saturday', desc: 'Dance, eat jollof, spray money. ₦30,000.', minAge: 16, cost: 30000 },
    { id: 'lounge', name: 'Hang out at a lounge', desc: 'Suya, drinks and music. ₦40,000.', minAge: 18, cost: 40000 },
    { id: 'bet', name: 'Sports betting', desc: 'Stake ₦20,000 on a 5-odds ticket.', minAge: 18, cost: 20000 },
    { id: 'hustle', name: 'Weekend side hustle', desc: 'Run errands, sell recharge cards, do small jobs.', minAge: 13, cost: 0 },
    { id: 'doctor', name: 'Visit a clinic', desc: 'Check-up and treatment. ₦25,000.', minAge: 0, cost: 25000 },
    { id: 'rest', name: 'Rest & sleep well', desc: 'Small health and happiness boost.', minAge: 0, cost: 0 },
    { id: 'salon', name: 'Salon / barbing', desc: 'Fresh look. ₦15,000.', minAge: 12, cost: 15000 },
    { id: 'findlove', name: 'Find love', desc: 'Go out and meet someone.', minAge: 16, cost: 0 },
  ];

  function doActivity(s, id) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const a = ACTIVITIES.find((x) => x.id === id);
    if (!a) return { ok: false, msg: 'Unknown activity.' };
    if (s.age < a.minAge) return { ok: false, msg: `Available from age ${a.minAge}.` };
    if (a.cost && s.money < a.cost) return { ok: false, msg: `You need ${naira(a.cost)}.` };
    if (id === 'findlove') return findLove(s);
    if (id === 'study' && !['primary', 'secondary', 'tertiary'].includes(s.edu.stage)) return { ok: false, msg: 'You are not in school.' };
    if (!oncePerYear(s, 'act-' + id)) return { ok: false, msg: 'You already did that this year.' };
    s.money -= a.cost;
    let msg = '';
    switch (id) {
      case 'study': s.edu.effort = Math.min(15, s.edu.effort + 4); stat(s, 'smarts', randInt(s, 1, 3)); stat(s, 'happiness', -1); msg = 'You studied hard all year.'; break;
      case 'library': stat(s, 'smarts', randInt(s, 1, 4)); msg = 'You read loads of books. Your mind is sharper.'; break;
      case 'gym': stat(s, 'health', randInt(s, 3, 7)); stat(s, 'looks', randInt(s, 1, 3)); msg = 'You trained consistently at the gym.'; break;
      case 'jog': stat(s, 'health', randInt(s, 1, 4)); msg = 'You jogged most mornings.'; break;
      case 'worship': stat(s, 'happiness', randInt(s, 2, 6)); s.karma = clamp(s.karma + 2); msg = 'You attended services faithfully.'; break;
      case 'owambe': stat(s, 'happiness', randInt(s, 5, 10)); msg = 'You danced at an owambe till evening. The jollof was elite.'; break;
      case 'lounge': stat(s, 'happiness', randInt(s, 4, 9)); stat(s, 'health', -1); msg = 'You enjoyed the night life.'; break;
      case 'bet': {
        if (chance(s, 0.18)) { s.money += 100000; stat(s, 'happiness', 8); msg = 'Your ticket cut... no wait, it CAME! You won ₦100,000.'; }
        else { stat(s, 'happiness', -4); msg = 'One game cut your ticket. You lost ₦20,000.'; }
        break;
      }
      case 'hustle': {
        const earn = round1k(randInt(s, 15, 60) * 1000 * (s.age >= 18 ? 2 : 1));
        s.money += earn; stat(s, 'happiness', -1); msg = `You hustled and made ${naira(earn)}.`; break;
      }
      case 'doctor': stat(s, 'health', randInt(s, 5, 12)); msg = 'The doctor treated you and told you to "reduce stress".'; break;
      case 'rest': stat(s, 'health', 1); stat(s, 'happiness', 2); msg = 'You rested well.'; break;
      case 'salon': stat(s, 'looks', randInt(s, 1, 4)); stat(s, 'happiness', 2); msg = 'You are looking fresh!'; break;
    }
    log(s, msg, 'good');
    return { ok: true, msg };
  }

  // ---------- relationships ----------

  function partner(s) {
    return s.relations.find((r) => (r.role === 'partner' || r.role === 'fiancé(e)' || r.role === 'spouse') && r.alive);
  }

  function findLove(s) {
    if (partner(s)) return { ok: false, msg: 'You are already in a relationship.' };
    if (!oncePerYear(s, 'findlove')) return { ok: false, msg: 'You already tried this year.' };
    if (!chance(s, 0.3 + s.stats.looks / 150)) {
      log(s, 'You went out looking for love but nobody caught your eye.', 'info');
      return { ok: false, msg: 'No luck this time.' };
    }
    const g = s.gender === 'male' ? 'female' : 'male';
    const p = newPerson(s, 'partner', g, clamp(s.age + randInt(s, -3, 4), 16, 99), { closeness: randInt(s, 50, 75), town: pick(s, D.TOWNS).id });
    s.relations.push(p);
    log(s, `❤️ You started dating ${fullName(p)} (${p.age}) from ${TOWN[p.town].name}.`, 'good');
    stat(s, 'happiness', 8);
    return { ok: true, msg: `You are dating ${p.first}!` };
  }

  const INTERACTIONS = {
    time: { name: 'Spend time', roles: '*' },
    gift: { name: 'Give a gift (₦20,000)', roles: '*' },
    money: { name: 'Ask for money', roles: ['mother', 'father', 'sibling', 'spouse'] },
    argue: { name: 'Argue', roles: '*' },
    propose: { name: 'Propose marriage', roles: ['partner'] },
    wedding: { name: 'Plan the wedding', roles: ['fiancé(e)'] },
    baby: { name: 'Try for a baby', roles: ['spouse'] },
    breakup: { name: 'Break up', roles: ['partner', 'fiancé(e)'] },
    divorce: { name: 'Divorce', roles: ['spouse'] },
  };

  function interactionsFor(r) {
    if (!r.alive) return [];
    return Object.entries(INTERACTIONS).filter(([, v]) => v.roles === '*' || v.roles.includes(r.role)).map(([k, v]) => ({ id: k, name: v.name }));
  }

  function interact(s, personId, action) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const r = relation(s, personId);
    if (!r || !r.alive) return { ok: false, msg: 'They are not available.' };
    if (!interactionsFor(r).some((x) => x.id === action)) return { ok: false, msg: 'Not possible.' };
    if (!oncePerYear(s, `rel-${personId}-${action}`)) return { ok: false, msg: 'You already did that this year.' };
    const n = r.first;
    let msg;
    switch (action) {
      case 'time':
        r.closeness = clamp(r.closeness + randInt(s, 5, 12)); stat(s, 'happiness', 3);
        msg = `You spent quality time with ${n}.`; break;
      case 'gift':
        if (s.money < 20000) { s.yearActs[`rel-${personId}-${action}`] = false; return { ok: false, msg: 'You need ₦20,000.' }; }
        s.money -= 20000; r.closeness = clamp(r.closeness + randInt(s, 8, 15));
        msg = `You bought ${n} a gift. They loved it.`; break;
      case 'money': {
        const parent = r.role === 'mother' || r.role === 'father';
        const base = parent ? WEALTH[s.family.wealth].pocket : 50000;
        if (chance(s, r.closeness / 140)) {
          const amt = round1k(base * (0.3 + rand(s)));
          s.money += amt; r.closeness = clamp(r.closeness - 3);
          msg = `${n} gave you ${naira(amt)}.`;
        } else { r.closeness = clamp(r.closeness - 6); msg = `${n} said "Money no dey" and gave you a lecture instead.`; }
        break;
      }
      case 'argue':
        r.closeness = clamp(r.closeness - randInt(s, 8, 20)); stat(s, 'happiness', -3);
        msg = `You had a heated argument with ${n}.`; break;
      case 'propose':
        if (s.age < 18) return { ok: false, msg: 'You are too young to marry.' };
        if (chance(s, r.closeness / 110)) {
          r.role = 'fiancé(e)'; stat(s, 'happiness', 12);
          msg = `💍 ${n} said YES! Now plan the wedding.`;
        } else { r.closeness = clamp(r.closeness - 15); msg = `${n} said they are not ready.`; }
        break;
      case 'wedding':
        queueEvent(s, 'wedding', { personId });
        s.yearActs[`rel-${personId}-${action}`] = false;
        return { ok: true, msg: 'Choose your wedding style.' };
      case 'baby': {
        if (s.age > 50 && s.gender === 'female') return { ok: false, msg: 'That ship has sailed.' };
        if (chance(s, 0.55)) {
          const g = pick(s, ['male', 'female']);
          const kid = newPerson(s, 'child', g, 0, { last: s.gender === 'male' ? s.last : r.last, closeness: 90 });
          s.relations.push(kid);
          stat(s, 'happiness', 12);
          msg = `👶 You welcomed a baby ${g === 'male' ? 'boy' : 'girl'}, ${kid.first}! The naming ceremony was a big party.`;
        } else msg = 'No baby this year. Keep trying.';
        break;
      }
      case 'breakup':
        r.role = 'ex'; stat(s, 'happiness', -8); msg = `You broke up with ${n}.`; break;
      case 'divorce': {
        const loss = Math.max(0, Math.round(s.money * 0.4));
        s.money -= loss; r.role = 'ex-spouse'; stat(s, 'happiness', -15);
        msg = `You divorced ${n}. Lawyers and settlement cost you ${naira(loss)}.`; break;
      }
    }
    log(s, msg, action === 'argue' || action === 'breakup' || action === 'divorce' ? 'bad' : 'good');
    return { ok: true, msg };
  }

  // ---------- assets & housing ----------

  function buyAsset(s, assetId) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const a = ASSET[assetId];
    if (!a) return { ok: false, msg: 'Unknown item.' };
    if (s.age < 16) return { ok: false, msg: 'You are too young to buy that.' };
    if (s.money < a.price) return { ok: false, msg: `You need ${naira(a.price)}.` };
    s.money -= a.price;
    s.assets.push({ uid: 'a' + s.nextId++, id: assetId, value: a.price, boughtYear: s.year });
    if (a.happiness) stat(s, 'happiness', a.happiness);
    if (a.looks) stat(s, 'looks', a.looks);
    log(s, `You bought a ${a.name} for ${naira(a.price)}.`, 'money');
    return { ok: true, msg: `Bought ${a.name}.` };
  }

  function sellAsset(s, uid) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const i = s.assets.findIndex((a) => a.uid === uid);
    if (i < 0) return { ok: false, msg: 'Not found.' };
    const a = s.assets[i];
    const price = Math.round(a.value * 0.9);
    s.money += price;
    s.assets.splice(i, 1);
    log(s, `You sold your ${ASSET[a.id].name} for ${naira(price)}.`, 'money');
    return { ok: true, msg: 'Sold.' };
  }

  function moveOut(s, townId) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const t = TOWN[townId];
    if (!t) return { ok: false, msg: 'Unknown town.' };
    if (s.age < 16) return { ok: false, msg: 'You are too young to live alone.' };
    if (!s.livingWithParents && townId === s.town) return { ok: false, msg: `You already live in ${t.name}.` };
    const d = distanceKm(TOWN[s.town], t);
    const cost = round1k(t.rent * 0.35 + d * 400 + 50000); // agent + caution fee + moving truck
    if (s.money < cost) return { ok: false, msg: `Moving needs ${naira(cost)} (agent, caution fee & transport).` };
    s.money -= cost;
    s.town = townId;
    s.livingWithParents = false;
    s.rentMult = 1;
    if (!s.visited.includes(townId)) s.visited.push(townId);
    log(s, `🏠 You moved into your own place in ${t.name} (${naira(cost)} agent & moving fees, rent ${naira(t.rent)}/yr).`, 'milestone');
    stat(s, 'happiness', 6);
    return { ok: true, msg: `Moved to ${t.name}.` };
  }

  function moveBackHome(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    if (s.livingWithParents) return { ok: false, msg: 'You already live with your parents.' };
    if (!parentsAlive(s)) return { ok: false, msg: 'Your parents are no longer alive.' };
    s.town = s.homeTown;
    s.livingWithParents = true;
    log(s, `You moved back into your parents' house in ${TOWN[s.homeTown].name}.`, 'info');
    stat(s, 'happiness', -3);
    return { ok: true, msg: 'Moved back home.' };
  }

  // ---------- map trips ----------

  function tripQuote(s, target, mode) {
    const from = TOWN[s.town];
    const d = distanceKm(from, target);
    const t = D.TRANSPORT[mode];
    if (!t) return { ok: false, msg: 'Unknown transport.' };
    if (t.needsAsset && !hasAssetKind(s, t.needsAsset)) return { ok: false, msg: `You don't own a ${t.needsAsset}.`, km: d };
    if (t.maxKm && d > t.maxKm) return { ok: false, msg: `${t.name} won't go that far (${Math.round(d)} km).`, km: d };
    const cost = round1k(Math.max(500, d * 2 * t.perKm));
    return { ok: true, km: d, cost };
  }

  function placeVisitable(p) {
    return ['landmark', 'market', 'worship', 'hospital', 'leisure'].includes(p.kind);
  }

  function visitPlace(s, placeId, mode = 'bus') {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const p = PLACE[placeId];
    if (!p || !placeVisitable(p)) return { ok: false, msg: 'You cannot visit that place.' };
    if (s.age < 8) return { ok: false, msg: 'Your parents won\'t let you travel alone yet.' };
    const q = tripQuote(s, p, mode);
    if (!q.ok) return q;
    const total = q.cost + (p.fee || 0);
    if (s.money < total) return { ok: false, msg: `The trip costs ${naira(total)}.` };
    if (!oncePerYear(s, 'visit-' + placeId)) return { ok: false, msg: `You already visited ${p.name} this year.` };
    s.money -= total;
    if (!s.visited.includes(p.town)) s.visited.push(p.town);
    const parts = [`You went to ${p.name} by ${D.TRANSPORT[mode].name.toLowerCase()} (${naira(total)}).`];
    // Road mishap
    if (chance(s, (q.km * 2 / 100) * D.TRANSPORT[mode].danger / 100)) {
      stat(s, 'health', -randInt(s, 8, 25));
      parts.push('On the way there was an accident and you got injured.');
    }
    switch (p.kind) {
      case 'landmark':
        stat(s, 'happiness', randInt(s, 5, 10)); stat(s, 'smarts', randInt(s, 0, 2));
        parts.push(p.id === 'olumo' ? 'You climbed Olumo Rock and saw all of Abeokuta below you.' : 'It was a memorable experience.');
        break;
      case 'market':
        if (p.id === 'itoku') { stat(s, 'looks', randInt(s, 1, 3)); s.money -= 15000; parts.push('You bought beautiful adire fabric (₦15,000).'); }
        else { stat(s, 'happiness', randInt(s, 1, 4)); parts.push('You haggled like a pro and found great deals.'); }
        break;
      case 'worship':
        stat(s, 'happiness', randInt(s, 5, 9)); s.karma = clamp(s.karma + 3);
        parts.push('The service lifted your spirit.');
        break;
      case 'hospital':
        stat(s, 'health', randInt(s, 10, 25));
        if (p.id === 'aro') stat(s, 'happiness', randInt(s, 8, 15));
        parts.push('The doctors treated you properly.');
        break;
      case 'leisure':
        stat(s, 'happiness', randInt(s, 4, 8));
        parts.push(p.id === 'sagamu-interchange' ? 'You ate peppered bushmeat at the interchange.' : 'You had a great time.');
        break;
    }
    const msg = parts.join(' ');
    log(s, msg, 'good');
    return { ok: true, msg };
  }

  // ---------- japa (emigrate) ----------

  function japaRequirement(s) {
    const need = 25000000;
    if (s.age < 21) return { ok: false, msg: 'You must be at least 21.', need };
    if (D.LEVEL_RANK[s.edu.highest] < D.LEVEL_RANK.BSc && !s.skills.includes('coding')) return { ok: false, msg: 'You need a degree/HND or a tech skill for a visa.', need };
    if (s.money < need) return { ok: false, msg: `You need proof of funds of ${naira(need)}.`, need };
    return { ok: true, need };
  }

  function japa(s) {
    const block = canAct(s);
    if (block) return { ok: false, msg: block };
    const r = japaRequirement(s);
    if (!r.ok) return r;
    const dest = pick(s, ['Canada', 'the United Kingdom', 'Germany', 'Ireland', 'the United States']);
    s.money -= 8000000;
    s.ended = { type: 'japa', dest, age: s.age, year: s.year };
    log(s, `✈️ You relocated to ${dest}! Your Ogun story ends here — for now.`, 'milestone');
    return { ok: true, msg: `You japa'd to ${dest}!` };
  }

  // ---------- events ----------

  function queueEvent(s, id, data = {}) {
    const def = EVENTS[id];
    const built = def.build(s, data);
    if (!built) return;
    s.events.push({ id, data, title: built.title, text: built.text, choices: built.choices.map((c) => ({ label: c.label, value: c.value })) });
  }

  function resolveEvent(s, choiceIndex) {
    const ev = s.events[0];
    if (!ev) return { ok: false, msg: 'No event.' };
    const choice = ev.choices[choiceIndex];
    if (!choice) return { ok: false, msg: 'Invalid choice.' };
    s.events.shift();
    const msg = EVENTS[ev.id].resolve(s, choice.value, ev.data) || '';
    if (msg) log(s, msg, 'event');
    if (s.stats.health <= 0 && s.alive) die(s, 'injuries');
    return { ok: true, msg };
  }

  function scriptedEvents(s) {
    if (s.edu.current && s.edu.current.kind === 'primary' && s.edu.current.year === 6 && !s.edu.nextSchool && !s.flags.ceDone) {
      s.flags.ceDone = true;
      queueEvent(s, 'common-entrance');
    }
  }

  function randomEvent(s) {
    s.eventAges = s.eventAges || {};
    // Each random event has a 3-year cooldown so years don't feel repetitive.
    const pool = Object.entries(EVENTS).filter(([id, e]) => e.weight && s.age - (s.eventAges[id] ?? -99) >= 3 && (!e.when || e.when(s)));
    const total = pool.reduce((t, [, e]) => t + e.weight, 0);
    if (!total) return;
    let r = rand(s) * total;
    for (const [id, e] of pool) {
      r -= e.weight;
      if (r <= 0) { s.eventAges[id] = s.age; queueEvent(s, id); return; }
    }
  }

  const IJEBU = ['ijebu-ode', 'ago-iwoye', 'ijebu-igbo', 'odogbolu', 'okun-owa', 'ogbere', 'abigi'];
  const EGBA = ['abeokuta', 'odeda', 'owode-egba'];
  const FLOOD = ['abeokuta', 'ota', 'ifo', 'mowe', 'ibafo', 'agbara'];

  const EVENTS = {
    'common-entrance': {
      build(s) {
        const score = clamp(Math.round(s.stats.smarts + s.edu.effort * 2 + rand(s) * 20 - 10));
        s.flags.ceScore = score;
        const choices = [];
        for (const sc of D.SECONDARY) {
          if (sc.gender !== 'any' && sc.gender !== s.gender) continue;
          if (sc.tier === 'unity' && score < 55) continue;
          if ((sc.tier === 'private' || sc.tier === 'model') && !canAfford(s, sc.fees)) continue;
          choices.push({ label: `${sc.name} — ${sc.tier}, ${naira(sc.fees)}/yr`, value: sc.id });
        }
        choices.push({ label: `Local community high school in ${TOWN[s.town].name} — ₦15,000/yr`, value: 'local' });
        return {
          title: 'Common Entrance results',
          text: `You scored ${score}% in the National Common Entrance exam. ${score >= 55 ? 'Federal unity schools are open to you!' : 'Your score was too low for federal unity schools.'} Where will you go for secondary school?`,
          choices,
        };
      },
      resolve(s, v) {
        s.edu.nextSchool = v === 'local' ? null : v;
        return v === 'local' ? 'You will attend a local secondary school.' : `You secured admission to ${SEC[v].name}.`;
      },
    },
    'nysc-call': {
      build(s) {
        const st = pick(s, D.NIGERIAN_STATES);
        return {
          title: 'NYSC call-up letter',
          text: `Your NYSC call-up letter is out! You have been posted to ${st} State for your service year (allowance ${naira(NYSC_ALLOWANCE)}/month).`,
          choices: [{ label: `Go and serve in ${st}`, value: 'go:' + st }, { label: 'Pull strings to redeploy to Ogun', value: 'redeploy' }, { label: 'Skip NYSC (risky for jobs)', value: 'skip' }],
        };
      },
      resolve(s, v) {
        if (v === 'skip') { s.nysc = { status: 'skipped' }; return 'You skipped NYSC. Many employers will ask for your certificate.'; }
        let st = v.startsWith('go:') ? v.slice(3) : 'Ogun';
        if (v === 'redeploy') {
          spend(s, 50000);
          if (!chance(s, 0.6)) st = pick(s, D.NIGERIAN_STATES);
        }
        s.nysc = { status: 'serving', state: st };
        if (s.job) leaveJob(s, 'left for NYSC');
        stat(s, 'happiness', 4);
        return `You went to orientation camp and began serving in ${st}${v === 'redeploy' && st === 'Ogun' ? ' after a successful redeployment' : ''}. "Corper wee!"`;
      },
    },
    wedding: {
      build(s, d) {
        const p = relation(s, d.personId);
        return {
          title: 'Wedding planning',
          text: `How do you want to marry ${p.first}?`,
          choices: [
            { label: 'Grand owambe — traditional + white wedding (₦8,000,000)', value: 'grand' },
            { label: 'Modest ceremony (₦1,500,000)', value: 'modest' },
            { label: 'Court registry wedding in Abeokuta (₦60,000)', value: 'court' },
            { label: 'Not now', value: 'later' },
          ],
        };
      },
      resolve(s, v, d) {
        const p = relation(s, d.personId);
        if (v === 'later' || !p || !p.alive) return 'You postponed the wedding.';
        const cost = { grand: 8000000, modest: 1500000, court: 60000 }[v];
        spend(s, cost);
        p.role = 'spouse';
        p.closeness = clamp(p.closeness + 10);
        stat(s, 'happiness', v === 'grand' ? 20 : v === 'modest' ? 14 : 10);
        if (s.money < 0) return `💒 You married ${p.first}! The ${naira(cost)} wedding put you in debt.`;
        return `💒 You married ${p.first} in a ${v === 'grand' ? 'grand owambe the whole of Ogun State is still talking about' : v === 'modest' ? 'beautiful modest ceremony' : 'simple court ceremony'}.`;
      },
    },
    nepa: {
      weight: 6, when: (s) => s.age >= 6,
      build(s) {
        if (hasAssetKind(s, 'generator')) return { title: 'NEPA took light', text: 'IBEDC took light for three weeks straight. Your backup power saved the day.', choices: [{ label: 'Up generator!', value: 'ok' }] };
        const choices = [{ label: 'Endure the darkness', value: 'endure' }];
        if (s.age >= 16) choices.unshift({ label: 'Buy a generator (₦280,000)', value: 'gen' });
        return { title: 'NEPA took light', text: 'There has been no power supply in your area for three weeks. The heat is unbearable.', choices };
      },
      resolve(s, v) {
        if (v === 'gen') { spend(s, 280000); s.assets.push({ uid: 'a' + s.nextId++, id: 'generator', value: 280000, boughtYear: s.year }); stat(s, 'happiness', 3); return 'You bought a generator. Your neighbours now hate the noise.'; }
        if (v === 'endure') { stat(s, 'happiness', -5); return 'You sweated through the nights without power.'; }
        return 'You stayed powered while the whole street was dark.';
      },
    },
    'power-bill': {
      weight: 3, when: (s) => !s.livingWithParents && s.age >= 18,
      build: () => ({ title: 'Crazy estimated bill', text: 'IBEDC sent you an estimated bill of ₦85,000 even though there was barely any light.', choices: [{ label: 'Pay to avoid disconnection', value: 'pay' }, { label: 'Protest at the IBEDC office', value: 'protest' }] }),
      resolve(s, v) {
        if (v === 'pay') { spend(s, 85000); return 'You paid the bill, grumbling.'; }
        if (chance(s, 0.5)) { spend(s, 20000); return 'After much argument they reduced it to ₦20,000.'; }
        stat(s, 'happiness', -4); spend(s, 85000); return 'They disconnected you anyway. You paid the full bill plus your time.';
      },
    },
    fuel: {
      weight: 3, when: (s) => s.age >= 18,
      build: () => ({ title: 'Fuel scarcity', text: 'Petrol stations across Ogun State have long queues and fuel prices have jumped.', choices: [{ label: 'Queue for hours', value: 'queue' }, { label: 'Buy black market (₦35,000)', value: 'black' }, { label: 'Stay home', value: 'home' }] }),
      resolve(s, v) {
        if (v === 'queue') { stat(s, 'health', -2); stat(s, 'happiness', -3); return 'You slept at a filling station in the queue.'; }
        if (v === 'black') { spend(s, 35000); return 'You bought fuel in jerrycans by the roadside.'; }
        stat(s, 'happiness', -2); return 'You stayed home until the scarcity eased.';
      },
    },
    owambe: {
      weight: 5, when: (s) => s.age >= 14,
      build: () => ({ title: 'Aso-ebi invitation', text: 'A family friend is having a big party in town and the aso-ebi is ₦45,000.', choices: [{ label: 'Buy the aso-ebi and slay', value: 'aso' }, { label: 'Go in your own clothes', value: 'plain' }, { label: 'Decline', value: 'no' }] }),
      resolve(s, v) {
        if (v === 'aso') {
          spend(s, 45000); stat(s, 'happiness', 8); stat(s, 'looks', 1);
          if (s.age >= 18 && !partner(s) && chance(s, 0.35)) {
            const g = s.gender === 'male' ? 'female' : 'male';
            const p = newPerson(s, 'partner', g, clamp(s.age + randInt(s, -3, 4), 18, 99), { closeness: 60, town: s.town });
            s.relations.push(p);
            return `You looked amazing and met ${fullName(p)} at the party. You are now dating!`;
          }
          return 'You were the best-dressed guest. Photographers loved you.';
        }
        if (v === 'plain') { stat(s, 'happiness', 3); return 'You went and enjoyed the food, even if you stood out.'; }
        return 'You stayed home.';
      },
    },
    flood: {
      weight: 3, when: (s) => FLOOD.includes(s.town),
      build: (s) => ({ title: 'Flood!', text: `Heavy rain caused flooding in parts of ${TOWN[s.town].name}. Water entered your house.`, choices: [{ label: 'Clean up and replace damaged items', value: 'clean' }] }),
      resolve(s) { const loss = round1k(Math.min(300000, Math.max(30000, s.money * 0.05))); spend(s, loss); stat(s, 'happiness', -5); return s.age < 18 ? 'The flood damaged your family\'s house. Your parents handled the repairs.' : `The flood cost you ${naira(loss)} in damages.`; },
    },
    yahoo: {
      weight: 3, when: (s) => s.age >= 17 && s.age <= 35 && !s.flags.yahoo && !s.flags.yahooNo,
      build: () => ({ title: 'Quick money', text: 'An old friend pulled up in a new Benz and offered to teach you "the format" for online scams.', choices: [{ label: 'Refuse — no be my portion', value: 'no' }, { label: 'Join the yahoo boys', value: 'yes' }] }),
      resolve(s, v) {
        if (v === 'yes') { s.flags.yahoo = true; s.karma = clamp(s.karma - 25); return 'You started doing internet fraud. The money is fast but EFCC is watching.'; }
        s.flags.yahooNo = true; s.karma = clamp(s.karma + 5); return 'You refused. Hard work pays, even if slowly.';
      },
    },
    malaria: {
      weight: 6,
      build: () => ({ title: 'Malaria', text: 'You came down with a high fever, headache and bitter taste in your mouth. Malaria!', choices: [{ label: 'Go to the hospital (₦25,000)', value: 'hosp' }, { label: 'Drink agbo / herbs (₦3,000)', value: 'agbo' }, { label: 'Ignore it', value: 'ignore' }] }),
      resolve(s, v) {
        if (v === 'hosp') { spend(s, 25000); stat(s, 'health', -2); return 'You got proper treatment and recovered quickly.'; }
        if (v === 'agbo') { spend(s, 3000); if (chance(s, 0.5)) { stat(s, 'health', -4); return 'The agbo worked. You recovered.'; } stat(s, 'health', -12); return 'The agbo did not work. You were ill for weeks.'; }
        stat(s, 'health', -randInt(s, 15, 30)); return 'You ignored it and it got much worse.';
      },
    },
    'okada-crash': {
      weight: 2, when: (s) => s.age >= 10,
      build: () => ({ title: 'Okada accident', text: 'The okada you boarded skidded on a pothole and you fell hard.', choices: [{ label: 'Go to the hospital (₦80,000)', value: 'hosp' }, { label: 'See a traditional bone-setter (₦15,000)', value: 'bone' }] }),
      resolve(s, v) {
        stat(s, 'health', -randInt(s, 10, 25));
        if (v === 'hosp') { spend(s, 80000); stat(s, 'health', 8); return 'The orthopaedic team patched you up.'; }
        spend(s, 15000);
        if (chance(s, 0.6)) return 'The bone-setter fixed you, surprisingly well.';
        stat(s, 'health', -10); return 'The bone did not set well. You now walk with a slight limp.';
      },
    },
    'black-tax': {
      weight: 4, when: (s) => s.age >= 22 && s.money > 200000,
      build(s) {
        const amt = round1k(Math.min(s.money * 0.15, 1500000));
        return { title: 'Black tax', text: `A relative from the village called: they need ${naira(amt)} for an "urgent family matter".`, choices: [{ label: `Send ${naira(amt)}`, value: amt }, { label: 'Say you are broke', value: 0 }] };
      },
      resolve(s, v) {
        if (v) { spend(s, v); s.karma = clamp(s.karma + 4); stat(s, 'happiness', 2); return 'You sent the money. The family is praying for you.'; }
        s.karma = clamp(s.karma - 2); return 'You claimed to be broke. They didn\'t believe you.';
      },
    },
    'found-money': {
      weight: 2, when: (s) => s.age >= 10,
      build: () => ({ title: 'Lost wallet', text: 'You found a wallet with ₦60,000 and an ID card on the road.', choices: [{ label: 'Keep it', value: 'keep' }, { label: 'Return it to the owner', value: 'return' }] }),
      resolve(s, v) {
        if (v === 'keep') { s.money += 60000; s.karma = clamp(s.karma - 8); return 'You kept the money.'; }
        s.karma = clamp(s.karma + 10); stat(s, 'happiness', 5);
        if (chance(s, 0.4)) { s.money += 20000; return 'You returned it and the grateful owner gave you ₦20,000.'; }
        return 'You returned the wallet. The owner prayed for you.';
      },
    },
    expo: {
      weight: 5, when: (s) => s.edu.current && s.edu.current.kind === 'secondary' && s.edu.current.year === 6 && !s.flags.expoAsked,
      build(s) { s.flags.expoAsked = true; return { title: 'WAEC "expo"', text: 'A classmate is selling leaked WAEC answers ("expo") for ₦20,000. Some teachers are even helping.', choices: [{ label: 'Refuse and study', value: 'no' }, { label: 'Buy the expo', value: 'yes' }] }; },
      resolve(s, v) {
        if (v === 'yes') { spend(s, 20000); s.flags.expo = true; s.karma = clamp(s.karma - 8); return 'You bought expo. Hopefully WAEC doesn\'t catch it...'; }
        s.edu.effort = Math.min(15, s.edu.effort + 2); return 'You refused and studied harder.';
      },
    },
    cult: {
      weight: 5, when: (s) => s.edu.current && s.edu.current.kind === 'tertiary' && !s.flags.cultAsked && !s.flags.cultist,
      build(s) { s.flags.cultAsked = true; return { title: 'Campus "brotherhood"', text: 'Some senior students invited you to join their "confraternity" for protection.', choices: [{ label: 'Refuse firmly', value: 'no' }, { label: 'Join them', value: 'yes' }] }; },
      resolve(s, v) {
        if (v === 'yes') { s.flags.cultist = true; s.karma = clamp(s.karma - 20); stat(s, 'health', -10); return 'You were initiated. The initiation beating left scars.'; }
        if (chance(s, 0.2)) { stat(s, 'health', -8); return 'They roughed you up for refusing, but you stood your ground.'; }
        return 'You refused and kept your head down.';
      },
    },
    scholarship: {
      weight: 3, when: (s) => s.edu.current && s.edu.current.kind === 'tertiary' && !s.edu.current.scholarship && s.stats.smarts >= 70,
      build: () => ({ title: 'Scholarship', text: 'Your excellent grades earned you a scholarship from a foundation in Ogun State!', choices: [{ label: 'Accept gratefully', value: 'ok' }] }),
      resolve(s) { s.edu.current.scholarship = true; s.money += 200000; stat(s, 'happiness', 10); return 'Your remaining tuition is covered, plus a ₦200,000 stipend.'; },
    },
    'rent-hike': {
      weight: 3, when: (s) => !s.livingWithParents && s.age >= 18,
      build: (s) => ({ title: 'Landlord palava', text: `Your landlord in ${TOWN[s.town].name} announced a 30% rent increase.`, choices: [{ label: 'Accept and pay', value: 'pay' }, { label: 'Negotiate', value: 'neg' }] }),
      resolve(s, v) {
        if (v === 'pay' || !chance(s, 0.5)) { s.rentMult *= 1.3; return 'Your rent went up by 30%.'; }
        s.rentMult *= 1.1; return 'You begged and negotiated it down to a 10% increase.';
      },
    },
    'ojude-oba': {
      weight: 4, when: (s) => IJEBU.includes(s.town),
      build: () => ({ title: 'Ojude Oba festival', text: 'It\'s Ojude Oba time in Ijebu-Ode! Age grades (regberegbe) are parading before the Awujale in matching outfits.', choices: [{ label: 'Join your age grade (₦50,000 outfit)', value: 'join' }, { label: 'Watch from the crowd', value: 'watch' }] }),
      resolve(s, v) {
        if (v === 'join') { spend(s, 50000); stat(s, 'happiness', 10); stat(s, 'looks', 2); return 'You paraded with your age grade. The horse riders were spectacular.'; }
        stat(s, 'happiness', 5); return 'You watched the colourful parade.';
      },
    },
    lisabi: {
      weight: 4, when: (s) => EGBA.includes(s.town),
      build: () => ({ title: 'Lisabi Festival', text: 'Egbaland is celebrating the Lisabi Festival, honouring the Egba hero Lisabi Agbongbo-Akala.', choices: [{ label: 'Join the celebrations', value: 'join' }, { label: 'Stay home', value: 'no' }] }),
      resolve(s, v) { if (v === 'join') { stat(s, 'happiness', 7); return 'You danced through Abeokuta with the crowd. Egba pride!'; } return 'You stayed home.'; },
    },
    agemo: {
      weight: 2, when: (s) => IJEBU.includes(s.town),
      build: () => ({ title: 'Agemo Festival', text: 'The Agemo masquerades are coming through town. Tradition says certain people must stay indoors.', choices: [{ label: 'Watch respectfully', value: 'watch' }, { label: 'Stay indoors', value: 'in' }] }),
      resolve(s, v) { stat(s, 'happiness', v === 'watch' ? 4 : 1); return v === 'watch' ? 'You watched the Agemo procession from a respectful distance.' : 'You stayed indoors during the procession.'; },
    },
    ponzi: {
      weight: 3, when: (s) => s.age >= 20 && s.money >= 300000,
      build: () => ({ title: 'Investment "opportunity"', text: 'Your colleague says a crypto trading platform pays 30% monthly. "Everybody is collecting!"', choices: [{ label: 'Invest half your money', value: 'yes' }, { label: 'Avoid it', value: 'no' }] }),
      resolve(s, v) {
        if (v === 'no') return 'You avoided it. Smart.';
        const amt = Math.round(s.money / 2);
        spend(s, amt);
        if (chance(s, 0.3)) { s.money += amt * 2; return `You cashed out just in time and doubled your ${naira(amt)}!`; }
        stat(s, 'happiness', -12); return `The platform crashed and froze withdrawals. You lost ${naira(amt)}.`;
      },
    },
    pickpocket: {
      weight: 3, when: (s) => s.age >= 12,
      build: () => ({ title: 'Pickpocket', text: 'In a crowded bus park someone slipped a hand into your pocket.', choices: [{ label: 'Ah! Check your pocket', value: 'ok' }] }),
      resolve(s) {
        const ph = s.assets.findIndex((a) => ASSET[a.id].kind === 'phone');
        if (ph >= 0) { const name = ASSET[s.assets[ph].id].name; s.assets.splice(ph, 1); stat(s, 'happiness', -6); return `They stole your ${name}!`; }
        const loss = Math.min(Math.max(0, s.money), 20000); s.money -= loss; stat(s, 'happiness', -3); return `They took ${naira(loss)} cash.`;
      },
    },
    'omo-onile': {
      weight: 4, when: (s) => hasAssetKind(s, 'land'),
      build: () => ({ title: 'Omo onile', text: 'Land grabbers ("omo onile") showed up at your plot demanding a "foundation levy" of ₦300,000.', choices: [{ label: 'Pay them', value: 'pay' }, { label: 'Report to the police', value: 'police' }] }),
      resolve(s, v) {
        if (v === 'pay') { spend(s, 300000); return 'You paid. They promised not to come back… for now.'; }
        if (chance(s, 0.65)) return 'The police chased them off. Your land is safe.';
        const i = s.assets.findIndex((a) => ASSET[a.id].kind === 'land');
        const nm = ASSET[s.assets[i].id].name; s.assets.splice(i, 1); stat(s, 'happiness', -15);
        return `They sold your ${nm} to someone else. You lost it.`;
      },
    },
    traffic: {
      weight: 4, when: (s) => s.job && s.job.town !== s.town,
      build: () => ({ title: 'Go-slow', text: 'A trailer broke down on the Lagos–Ibadan Expressway. Traffic hasn\'t moved for 4 hours.', choices: [{ label: 'Wait it out', value: 'wait' }, { label: 'Hop on an okada through the bypass (₦5,000)', value: 'okada' }] }),
      resolve(s, v) {
        if (v === 'wait') { stat(s, 'happiness', -4); if (s.job) s.job.perf = clamp(s.job.perf - 3); return 'You got to work very late.'; }
        spend(s, 5000);
        if (chance(s, 0.1)) { stat(s, 'health', -15); return 'The okada crashed on the bypass. You were hurt.'; }
        return 'The okada weaved through traffic and you made it on time.';
      },
    },
    harvest: {
      weight: 3, when: (s) => s.age >= 18,
      build: () => ({ title: 'Harvest / fundraising', text: 'Your church or mosque is holding a harvest/fundraising for a new building.', choices: [{ label: 'Donate ₦50,000', value: 'give' }, { label: 'Just attend', value: 'attend' }] }),
      resolve(s, v) { if (v === 'give') { spend(s, 50000); s.karma = clamp(s.karma + 6); stat(s, 'happiness', 4); return 'You donated generously. The congregation applauded.'; } stat(s, 'happiness', 2); return 'You attended and enjoyed the event.'; },
    },
    'sibling-wedding': {
      weight: 2, when: (s) => s.age >= 20 && s.relations.some((r) => r.role === 'sibling' && r.alive && r.age >= 25),
      build(s) {
        const sib = s.relations.find((r) => r.role === 'sibling' && r.alive && r.age >= 25);
        return { title: 'Family wedding', text: `Your sibling ${sib.first} is getting married and everyone is expected to contribute.`, choices: [{ label: 'Contribute ₦150,000', value: sib.id }, { label: 'Contribute your presence', value: 'none' }] };
      },
      resolve(s, v) {
        if (v !== 'none') { spend(s, 150000); const sib = relation(s, v); if (sib) sib.closeness = clamp(sib.closeness + 15); stat(s, 'happiness', 6); return 'You contributed and danced all night.'; }
        stat(s, 'happiness', 3); return 'You attended and enjoyed yourself.';
      },
    },
  };

  // ---------- summary ----------

  function netWorth(s) {
    return s.money + s.assets.reduce((t, a) => t + a.value, 0);
  }

  function lifeSummary(s) {
    return {
      name: `${s.first} ${s.last}`,
      age: s.age,
      netWorth: netWorth(s),
      education: s.edu.highest,
      career: s.job ? s.job.title : s.jobHistory.length ? s.jobHistory[s.jobHistory.length - 1].title : 'None',
      children: s.relations.filter((r) => r.role === 'child').length,
      townsVisited: s.visited.length,
      karma: s.karma,
      ending: s.ended,
    };
  }

  // ---------- save / load ----------

  function serialize(s) { return JSON.stringify(s); }

  function deserialize(str) {
    const s = JSON.parse(str);
    if (!s || s.version !== SAVE_VERSION || !s.stats) throw new Error('Incompatible save file');
    return s;
  }

  return {
    START_YEAR, WEALTH, ACTIVITIES, SEC_YEARS,
    TOWN, INST, SEC, PLACE, JOB, SKILL, ASSET,
    naira, distanceKm, lgaName,
    newGame, ageUp, resolveEvent,
    applyTertiary, programmesAt, tertiaryFees, retakeJamb, resitWaec, dropOut,
    startTraining, nyscCleared,
    jobEligibility, applyJob, quitJob, retire, workHard, askRaise, jobTown,
    doActivity, findLove, interactionsFor, interact, partner, fullName,
    buyAsset, sellAsset, moveOut, moveBackHome, livingCost,
    tripQuote, visitPlace, placeVisitable,
    japa, japaRequirement,
    netWorth, lifeSummary, canAct, canAfford, parentFeeShare,
    serialize, deserialize,
    _rand: rand,
  };
});
