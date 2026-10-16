/*
 * OGS Lifestyle — careers, skills, personality traits and dreams (Hustle Mode).
 *
 * Six skills (Coding, Charisma, Hustle, Fitness, Cooking, Music) grow as you
 * train them. Pick two personality traits when you create your character:
 * each boosts one skill. Choose a lifetime dream to chase.
 * Careers are taken from the phone's Jobs app: five levels, four grades per
 * level, paid per shift. Fill performance to 100% to move up a grade; a new
 * level also needs the career's skill (and clout at the top).
 */
(function (root, factory) {
  const E = (root.OGS && root.OGS.Engine) || (typeof require === 'function' ? require('./engine.js') : null);
  const L = (root.OGS && root.OGS.Life) || (typeof require === 'function' ? require('./life.js') : null);
  const HU = (root.OGS && root.OGS.Hustle) || (typeof require === 'function' ? require('./hustle.js') : null);
  const mod = factory(E, L, HU);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Careers = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E, L, HU) {
  'use strict';
  const { chance, pick, clamp, round1k } = E._h;
  const naira = (n) => '₦' + Math.round(n).toLocaleString('en-NG');

  // ---------- skills ----------
  const SKILLS = {
    coding: { name: 'Coding', icon: '💻' },
    charisma: { name: 'Charisma', icon: '🗣️' },
    hustle: { name: 'Hustle', icon: '💪' },
    fitness: { name: 'Fitness', icon: '🏋️' },
    cooking: { name: 'Cooking', icon: '🍳' },
    music: { name: 'Music', icon: '🎤' },
  };
  const MAX_SKILL = 10;
  // XP needed to go from level n-1 to n is 15·n, so level 10 takes 825 XP in total.
  function xpFor(level) { return (15 * level * (level + 1)) / 2; }
  function skillLevel(s, k) {
    const xp = (s.hustle && s.hustle.skills && s.hustle.skills[k]) || 0;
    let lv = 0;
    while (lv < MAX_SKILL && xp >= xpFor(lv + 1)) lv++;
    return lv;
  }
  function skillProgress(s, k) {
    const lv = skillLevel(s, k);
    if (lv >= MAX_SKILL) return 1;
    const xp = s.hustle.skills[k] || 0;
    return (xp - xpFor(lv)) / (xpFor(lv + 1) - xpFor(lv));
  }

  // ---------- personality traits (pick exactly two) ----------
  const TRAITS = {
    techie: { name: 'Techie', icon: '💻', skill: 'coding', desc: 'Lives on YouTube tutorials. Coding grows faster.' },
    sweetmouth: { name: 'Sweet Mouth', icon: '🗣️', skill: 'charisma', desc: 'Can talk anybody into anything. Charisma grows faster.' },
    hustler: { name: 'Hustler', icon: '💪', skill: 'hustle', desc: 'No dull moment, no idle hand. Hustle grows faster.' },
    gymrat: { name: 'Gym Rat', icon: '🏋️', skill: 'fitness', desc: 'Never skips leg day. Fitness grows faster.' },
    foodie: { name: 'Foodie', icon: '🍲', skill: 'cooking', desc: 'Your jollof ends arguments. Cooking grows faster.' },
    musical: { name: 'Musical', icon: '🎤', skill: 'music', desc: 'Fuji, Afrobeats, choir — you sing it all. Music grows faster.' },
  };
  function hasTraitFor(s, skill) { return (s.hustle.traits || []).some((t) => TRAITS[t] && TRAITS[t].skill === skill); }

  function addXp(s, skill, amount) {
    if (!s.hustle || !SKILLS[skill]) return null;
    s.hustle.skills = s.hustle.skills || {};
    const before = skillLevel(s, skill);
    s.hustle.skills[skill] = (s.hustle.skills[skill] || 0) + amount * (hasTraitFor(s, skill) ? 1.5 : 1);
    const after = skillLevel(s, skill);
    if (after > before) {
      const msg = `${SKILLS[skill].icon} ${SKILLS[skill].name} is now level ${after}!`;
      E.log(s, msg, 'milestone');
      checkDream(s);
      return msg;
    }
    return null;
  }

  // ---------- careers ----------
  // pay = base per shift at each level; shifts start in the [from, to) hour window.
  const CAREERS = {
    tech: { name: 'Tech', icon: '💻', skill: 'coding', employer: 'Gateway Tech Hub, Kuto', pay: [7000, 15000, 30000, 55000, 95000],
      levels: ['Tech Intern', 'Junior Developer', 'Software Developer', 'Senior Engineer', 'Chief Technology Officer'] },
    banking: { name: 'Banking', icon: '🏦', skill: 'charisma', employer: 'Gateway Bank, Oke-Mosan', pay: [6500, 14000, 28000, 52000, 90000],
      levels: ['Bank Teller', 'Customer Service Officer', 'Relationship Manager', 'Branch Manager', 'Regional Director'] },
    civil: { name: 'Civil Service', icon: '🏛️', skill: 'charisma', employer: 'State Secretariat, Oke-Mosan', pay: [5000, 10000, 20000, 38000, 70000],
      levels: ['Clerk', 'Admin Officer', 'Senior Officer', 'Director', 'Permanent Secretary'] },
    teaching: { name: 'Teaching', icon: '🎓', skill: 'charisma', employer: 'Abeokuta Grammar School', pay: [4500, 9000, 18000, 32000, 60000],
      levels: ['Teaching Assistant', 'Class Teacher', 'Head of Department', 'Vice Principal', 'Principal'] },
    health: { name: 'Health', icon: '🏥', skill: 'charisma', employer: 'FMC Idi-Aba', pay: [6000, 13000, 26000, 50000, 88000],
      levels: ['Ward Attendant', 'Nurse', 'Senior Nurse', 'Matron', 'Chief Medical Director'] },
    adire: { name: 'Adire Trade', icon: '🧵', skill: 'hustle', employer: 'Itoku Adire Co-op', weekend: true, pay: [4000, 9000, 20000, 42000, 80000],
      levels: ['Dyer\'s Apprentice', 'Adire Dyer', 'Adire Trader', 'Wholesaler', 'Adire Merchant Boss'] },
    transport: { name: 'Transport', icon: '🚌', skill: 'hustle', employer: 'Kuto Motor Park', weekend: true, pay: [4000, 9000, 19000, 40000, 75000],
      levels: ['Bus Conductor', 'Danfo Driver', 'Bus Owner', 'Fleet Owner', 'Park Chairman'] },
    fitness: { name: 'Fitness', icon: '🏋️', skill: 'fitness', employer: 'Iron Gym', weekend: true, pay: [4000, 9000, 18000, 34000, 62000],
      levels: ['Gym Cleaner', 'Personal Trainer', 'Head Coach', 'Gym Manager', 'Fitness Mogul'] },
    security: { name: 'Police', icon: '👮', skill: 'fitness', employer: 'Police Station, Ibara', weekend: true, pay: [5000, 10000, 21000, 40000, 72000],
      levels: ['Constable', 'Corporal', 'Sergeant', 'Inspector', 'Divisional Police Officer'] },
    food: { name: 'Food', icon: '🍲', skill: 'cooking', employer: 'Iya Basira Buka', weekend: true, pay: [3500, 8000, 17000, 36000, 70000],
      levels: ['Kitchen Help', 'Cook', 'Head Cook', 'Restaurant Manager', 'Food Empire Owner'] },
    music: { name: 'Music', icon: '🎤', skill: 'music', employer: 'Panseke Lounge', weekend: true, night: true, pay: [3000, 9000, 22000, 50000, 99000],
      levels: ['Backup Singer', 'Club Singer', 'Recording Artist', 'Headliner', 'Fuji & Afrobeats Legend'] },
  };
  const SKILL_REQ = [0, 1, 3, 5, 7]; // career skill needed for levels 1..5
  const CLOUT_REQ = [0, 0, 8, 20, 40]; // clout ("street rep") needed for levels 1..5
  const GRADES = ['I', 'II', 'III', 'IV'];

  function career(s) { return s.hustle && s.hustle.career; }
  function careerTitle(s) {
    const c = career(s);
    if (!c) return null;
    return `${CAREERS[c.id].levels[c.level - 1]} ${GRADES[c.grade - 1]}`;
  }
  function shiftPay(c) {
    const def = CAREERS[c.id];
    return round1k(def.pay[c.level - 1] * (1 + 0.08 * (c.grade - 1)) * 10) / 10; // to the nearest ₦100
  }
  function nextLevelNeeds(s) {
    const c = career(s);
    if (!c || c.level >= 5) return null;
    const def = CAREERS[c.id];
    const needSkill = SKILL_REQ[c.level]; const needClout = CLOUT_REQ[c.level];
    const missing = [];
    if (skillLevel(s, def.skill) < needSkill) missing.push(`${SKILLS[def.skill].name} ${needSkill}`);
    if (s.hustle.clout < needClout) missing.push(`clout ${needClout}`);
    return { title: def.levels[c.level], skill: def.skill, needSkill, needClout, missing };
  }
  function canApply(s, id) {
    if (!s.hustle) return 'Hustle Mode only';
    const c = career(s);
    if (c && c.id === id) return 'You already work here';
    return null;
  }
  function apply(s, id) {
    const why = canApply(s, id);
    if (why) return { ok: false, msg: why };
    const def = CAREERS[id];
    s.hustle.career = { id, level: 1, grade: 1, perf: 0, shifts: 0, joinedDay: s.clock.day };
    message(s, def.employer, `Congratulations! You have been employed as ${def.levels[0]}. Resume tomorrow by ${def.night ? '6pm' : '9am'}. Don't be late.`);
    E.log(s, `💼 New job: ${def.levels[0]} at ${def.employer}.`, 'milestone');
    return { ok: true, msg: `🎉 You got the job: ${def.levels[0]} at ${def.employer}. ${def.night ? 'Shifts start in the evening.' : 'Go to work on a working day.'}` };
  }
  function resign(s) {
    const c = career(s);
    if (!c) return { ok: false, msg: 'You have no job.' };
    s.hustle.career = null;
    E.log(s, `You resigned from ${CAREERS[c.id].employer}.`, 'info');
    return { ok: true, msg: 'You resigned. Freedom… and no salary.' };
  }
  function shiftWhy(s) {
    const c = career(s);
    if (!c) return 'Get a job first (📱 Jobs)';
    const def = CAREERS[c.id];
    const h = L.hour(s);
    if (s.dayActs.shift) return 'You already worked today';
    if (!def.weekend && s.clock.dow >= 5) return "It's the weekend";
    if (def.night) return h < 17 || h >= 22 ? 'Shows start between 5pm and 10pm' : null;
    if (h < 6 || h >= 12) return 'Shifts start between 6am and noon';
    return null;
  }
  // One shift: get paid, build performance and the career's skill, and maybe get promoted.
  function doShift(s) {
    const c = career(s); const def = CAREERS[c.id];
    s.dayActs.shift = true;
    c.shifts++;
    const pay = shiftPay(c);
    s.money += pay;
    s.hustle.totalEarned = (s.hustle.totalEarned || 0) + pay;
    const n = s.needs;
    let gain = 22 + Math.min(10, skillLevel(s, def.skill)) + (n.energy > 50 ? 4 : 0) + (n.hunger > 50 ? 3 : 0) - (n.hygiene < 25 ? 6 : 0);
    if (chance(s, 0.12)) gain += 10; // the boss noticed you
    c.perf = clamp(c.perf + gain);
    addXp(s, def.skill, 6);
    L.need(s, 'energy', -12); L.need(s, 'fun', -6); L.need(s, 'social', 8);
    let msg = `${pick(s, ['A full shift done.', 'Long day, but you delivered.', 'Your boss said "well done" — rare!', 'Busy shift. You held it down.'])} +${naira(pay)}.`;
    if (c.perf >= 100) msg += ' ' + promote(s);
    return msg;
  }
  function promote(s) {
    const c = career(s); const def = CAREERS[c.id];
    if (c.grade < 4) {
      c.grade++; c.perf = 0;
      E.log(s, `⬆️ Promoted to ${careerTitle(s)} (${naira(shiftPay(c))} a shift).`, 'milestone');
      return `⬆️ Promoted to ${careerTitle(s)}!`;
    }
    if (c.level >= 5) { c.perf = 100; return '👑 You are at the very top of this career.'; }
    const need = nextLevelNeeds(s);
    if (need.missing.length) { c.perf = 100; return `To become ${need.title} you need ${need.missing.join(' and ')}.`; }
    c.level++; c.grade = 1; c.perf = 0;
    s.hustle.clout = clamp(s.hustle.clout + 3);
    E.log(s, `🎉 BIG PROMOTION: you are now ${def.levels[c.level - 1]} at ${def.employer}!`, 'milestone');
    message(s, def.employer, `Congratulations on your promotion to ${def.levels[c.level - 1]}. Keep it up!`);
    checkDream(s);
    return `🎉 BIG PROMOTION: ${def.levels[c.level - 1]}!`;
  }

  // ---------- dreams ----------
  function netWorth(s) { const b = s.hustle.bank || {}; return E.netWorth(s) + (b.savings || 0) - (b.loan || 0); }
  function friends(s) { return s.relations.filter((r) => r.role === 'friend' && r.alive !== false).length; }
  const DREAMS = {
    chairman: { name: 'Chairman', icon: '👑', desc: 'Reach the top level of any career.', progress: (s) => (career(s) ? (career(s).level - 1 + career(s).grade / 4) / 5 : 0), done: (s) => !!career(s) && career(s).level >= 5 },
    landlord: { name: 'Ibara GRA Landlord', icon: '🏡', desc: 'Own your house and be worth ₦20,000,000.', progress: (s) => Math.min(1, netWorth(s) / 20000000) * (s.hustle.houseBuilt || s.hustle.house === 'duplex' ? 1 : 0.9), done: (s) => netWorth(s) >= 20000000 && (s.hustle.houseBuilt || s.hustle.house === 'duplex') },
    star: { name: 'Fuji to Afrobeats Star', icon: '🌟', desc: 'Reach Music level 10.', progress: (s) => skillLevel(s, 'music') / 10, done: (s) => skillLevel(s, 'music') >= 10 },
    padi: { name: "Everybody's Padi", icon: '🤝', desc: 'Have 6 friends in Abeokuta.', progress: (s) => Math.min(1, friends(s) / 6), done: (s) => friends(s) >= 6 },
    founder: { name: 'Gateway Tech Founder', icon: '🚀', desc: 'Reach Coding level 10 and be worth ₦5,000,000.', progress: (s) => (skillLevel(s, 'coding') / 10) * 0.6 + Math.min(1, netWorth(s) / 5000000) * 0.4, done: (s) => skillLevel(s, 'coding') >= 10 && netWorth(s) >= 5000000 },
  };
  function checkDream(s) {
    const h = s.hustle;
    if (!h || !h.dream || h.dreamDone || !DREAMS[h.dream]) return false;
    if (!DREAMS[h.dream].done(s)) return false;
    h.dreamDone = true;
    h.clout = clamp(h.clout + 20);
    E.log(s, `🏆 DREAM COME TRUE: ${DREAMS[h.dream].name}! Abeokuta is talking about you.`, 'milestone');
    message(s, 'Mama', 'My child, I heard the news! God has done it. I am so proud of you. 🙏🏾');
    return true;
  }

  function message(s, from, text) {
    s.hustle.inbox = s.hustle.inbox || [];
    s.hustle.inbox.push({ from, text, day: s.age * E.DAYS_PER_YEAR + s.clock.day, time: s.clock.min, read: false });
  }

  // Character creation: two traits (each starts its skill at level 1), a dream and a look.
  function setup(s, opts = {}) {
    const h = s.hustle;
    h.skills = h.skills || {};
    h.traits = (opts.traits || []).filter((t) => TRAITS[t]).slice(0, 2);
    for (const t of h.traits) h.skills[TRAITS[t].skill] = Math.max(h.skills[TRAITS[t].skill] || 0, xpFor(1));
    h.dream = DREAMS[opts.dream] ? opts.dream : null;
    h.dreamDone = false;
    if (opts.look) s.look = { skin: clamp(opts.look.skin | 0, 0, 3), top: /^#[0-9a-f]{6}$/i.test(opts.look.top || '') ? opts.look.top : null };
    if (h.start === 'nepo' && !h.career) { // Daddy "knows people"
      h.career = { id: 'banking', level: 4, grade: 1, perf: 0, shifts: 0, joinedDay: s.clock.day };
      h.skills.charisma = Math.max(h.skills.charisma || 0, xpFor(5));
    }
    return s;
  }

  // ---------- actions ----------
  const C = (o) => Object.assign({ group: 'School & work', cost: 0, minAge: 16, hidden: (s) => !s.hustle }, o);
  L.registerActions([
    C({ id: 'shift', icon: '💼', name: 'Go to work', hours: 8,
      label: (s) => (career(s) ? `Go to work (${careerTitle(s)} · ${naira(shiftPay(career(s)))})` : 'Go to work'),
      can: shiftWhy, run: doShift }),
    C({ id: 'learn-code', group: 'Skills', icon: '💻', name: 'Learn coding (YouTube tutorials)', hours: 2, cost: 500,
      run: (s) => { L.need(s, 'fun', -5); L.need(s, 'energy', -6); return (addXp(s, 'coding', 12) || 'You built a small website. The CSS fought you, but you won.'); } }),
    C({ id: 'practise-music', group: 'Skills', icon: '🎤', name: 'Practise singing & songwriting', hours: 2,
      run: (s) => { L.need(s, 'fun', 8); L.need(s, 'energy', -5); return (addXp(s, 'music', 12) || pick(s, ['You wrote a new verse. Fire! 🔥', 'Your neighbour banged the wall. Art has a price.'])); } }),
    C({ id: 'practise-talk', group: 'Skills', icon: '🗣️', name: 'Watch public-speaking videos', hours: 2,
      run: (s) => { L.need(s, 'fun', -3); return (addXp(s, 'charisma', 10) || 'You practised your pitch in the mirror.'); } }),
  ]);
  // Everyday actions also train skills.
  const TRAINS = { gym: ['fitness', 10], 'street-ball': ['fitness', 7], cook: ['cooking', 10], hangout: ['charisma', 6], date: ['charisma', 6], club: ['charisma', 5],
    community: ['charisma', 6], 'content-skit': ['charisma', 5], 'okada-ride': ['hustle', 8], 'adire-buy': ['hustle', 5], 'adire-local': ['hustle', 8], 'adire-lagos': ['hustle', 10],
    hustle: ['hustle', 8], read: ['coding', 4] };
  for (const a of L.ACTIONS) {
    const t = TRAINS[a.id];
    if (!t) continue;
    const orig = a.run;
    a.run = (s) => { const r = orig(s); if (s.hustle) { const up = addXp(s, t[0], t[1]); if (up) return `${r} ${up}`; } return r; };
  }
  // Auto-routine: go to work on time.
  L.addAutoHook((s, ok) => (s.hustle && career(s) && ok('shift') ? 'shift' : null), true);
  // Every new hustle life gets its traits, dream and (for Nepo babies) Daddy's job.
  const newHustleGame = HU.newHustleGame;
  HU.newHustleGame = (opts = {}) => setup(newHustleGame(opts), opts);
  L.onDay((s) => { if (s.hustle) checkDream(s); });

  return {
    SKILLS, TRAITS, CAREERS, DREAMS, GRADES, SKILL_REQ, CLOUT_REQ, MAX_SKILL,
    xpFor, skillLevel, skillProgress, addXp, career, careerTitle, shiftPay, nextLevelNeeds, canApply, apply, resign, shiftWhy, doShift, promote,
    checkDream, setup, netWorth,
  };
});
