/*
 * OGS Lifestyle — daily life.
 *
 * Adds a clock to the yearly engine. A game year is 28 days (4 weeks;
 * each week stands for a quarter of the year). The day runs from 06:00 and
 * you manage five needs (hunger, energy, hygiene, fun, social) while you
 * go to school or work, hustle, eat, sleep and run into whatever the
 * streets of Ogun State throw at you. Pay arrives on Saturday, and so do
 * rent and bills. After day 28 you have a birthday and the yearly engine runs.
 */
(function (root, factory) {
  const E = (root.OGS && root.OGS.Engine) || (typeof require === 'function' ? require('./engine.js') : null);
  const D = (root.OGS && root.OGS.Data) || (typeof require === 'function' ? require('./data.js') : null);
  const mod = factory(D, E);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Life = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, E) {
  'use strict';
  const { rand, randInt, chance, pick, clamp, stat, round1k, oncePerDay } = E._h;
  const naira = E.naira;
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const NEEDS = ['hunger', 'energy', 'hygiene', 'fun', 'social'];
  // Needs lost per waking hour.
  const DECAY = { hunger: 4.5, energy: 4.2, hygiene: 2.5, fun: 2.2, social: 1.6 };
  const WAKE = 6 * 60;

  const need = (s, k, d) => { s.needs[k] = clamp(s.needs[k] + d); };
  const hour = (s) => Math.floor(s.clock.min / 60) % 24;
  const isWeekday = (s) => s.clock.dow < 5;
  const inSchool = (s) => s.edu.current && ['primary', 'secondary', 'tertiary'].includes(s.edu.current.kind);
  const withParents = (s) => s.livingWithParents && E.parentsAlive(s);

  function timeLabel(s) {
    const m = s.clock.min % (24 * 60);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
  }
  function dateLabel(s) {
    return `${DOW[s.clock.dow]} · Week ${Math.ceil(s.clock.day / 7)} · Day ${s.clock.day}/${E.DAYS_PER_YEAR}`;
  }
  function dailyPay(s) { return s.job ? round1k((s.job.salary * 12) / E.WORKDAYS_PER_YEAR) : 0; }
  function weeklyBills(s) {
    if (s.jail || s.hustle) return 0; // Hustle Mode handles its own rent
    if (!s.livingWithParents) return round1k((E.TOWN[s.town].rent * s.rentMult + 1100000) / 4);
    if (s.age >= 23 && E.parentsAlive(s)) return 75000;
    return 0;
  }

  // ---------- time ----------

  function passTime(s, minutes, asleep = false) {
    let left = minutes;
    while (left > 0 && s.alive && !s.ended) {
      const step = Math.min(60, left);
      left -= step;
      const f = step / 60;
      if (asleep) {
        need(s, 'hunger', -1.5 * f);
        need(s, 'hygiene', -1 * f);
        need(s, 'energy', 13 * f);
      } else {
        for (const k of NEEDS) need(s, k, -DECAY[k] * f);
      }
      // Starving or exhausted hurts.
      s.clock.dmg = (s.clock.dmg || 0) + (s.needs.hunger <= 0 ? 0.3 * f : 0);
      if (s.clock.dmg >= 1) { stat(s, 'health', -Math.floor(s.clock.dmg)); s.clock.dmg %= 1; }
      if (s.stats.health <= 0) { E.die(s, s.needs.hunger <= 0 ? 'starvation' : 'exhaustion'); return; }
      s.clock.min += step;
      if (s.clock.min >= 24 * 60) {
        s.clock.min -= 24 * 60;
        newDay(s);
      }
      if (!asleep && s.alive && !s.ended) {
        if (s.needs.energy <= 0) { E.log(s, 'You collapsed from exhaustion and slept where you fell.', 'bad'); stat(s, 'happiness', -2); sleep(s); return; }
        if (s.clock.min >= 2 * 60 && s.clock.min < WAKE) { sleep(s); return; }
      }
    }
  }

  function sleep(s) {
    const m = s.clock.min;
    const mins = m < WAKE ? WAKE - m : 24 * 60 - m + WAKE;
    passTime(s, mins, true);
    let msg = `You slept ${Math.round(mins / 60)} hours.`;
    for (const fn of SLEEP_HOOKS) msg = fn(s, msg) || msg;
    return msg;
  }

  // Extension points: gates can block an action or trip with a reason;
  // sleep hooks can change what a night's sleep does.
  const GATES = [];
  const AUTO_HOOKS = [];
  function addAutoHook(fn) { AUTO_HOOKS.push(fn); }
  const SLEEP_HOOKS = [];
  function addGate(fn) { GATES.push(fn); }
  function onSleep(fn) { SLEEP_HOOKS.push(fn); }
  function gateReason(s, what) {
    for (const g of GATES) { const r = g(s, what); if (r) return r; }
    return null;
  }

  function newDay(s) {
    s.clock.day++;
    s.clock.dow = (s.clock.dow + 1) % 7;
    s.dayActs = {};
    s.heat = Math.max(0, (s.heat || 0) - 3);

    // Mood from yesterday's needs
    const n = s.needs;
    if (n.fun < 15) stat(s, 'happiness', -1);
    if (n.social < 15) stat(s, 'happiness', -1);
    if (n.hygiene < 15 && chance(s, 0.3)) stat(s, 'looks', -1);
    if (NEEDS.every((k) => n[k] >= 55)) stat(s, 'happiness', 1);
    // A well-fed, rested body slowly heals, up to an age-based ceiling.
    const ceiling = 100 - Math.max(0, s.age - 40);
    if (n.hunger >= 35 && n.hygiene >= 25 && s.stats.health < ceiling && chance(s, s.jail ? 0.15 : 0.3)) stat(s, 'health', 1);

    if (s.jail) {
      s.jail.daysLeft--;
      if (s.jail.daysLeft <= 0) E.releaseFromJail(s);
    }
    if (s.clock.dow === 5) payWeek(s);
    for (const fn of DAY_HOOKS) fn(s);

    if (s.clock.day > E.DAYS_PER_YEAR) {
      s.clock.day = 1;
      s.clock.dow = 0;
      E.ageUp(s);
    }
  }

  function payWeek(s) {
    s.week = s.week || { worked: 0, overtime: 0 };
    if (s.job) {
      const pay = dailyPay(s) * s.week.worked + round1k(s.week.overtime);
      s.money += pay;
      if (s.week.worked) E.log(s, `💵 Payday: ${naira(pay)} for ${s.week.worked} day(s) at work this week.`, 'money');
      else E.log(s, 'No work, no pay. You did not go to work at all this week.', 'bad');
    }
    const bills = weeklyBills(s);
    if (bills) {
      s.money -= bills;
      E.log(s, s.livingWithParents ? `You gave your parents ${naira(bills)} for food and bills.` : `🏠 Rent, food & bills in ${E.TOWN[s.town].name}: ${naira(bills)} this week.`, 'money');
      if (s.money < 0) E.log(s, 'You are broke and in debt. Sapa has caught you!', 'bad');
    }
    s.week = { worked: 0, overtime: 0 };
  }

  // ---------- actions ----------

  const ACTIONS = [];
  function registerActions(list) { ACTIONS.push(...list); }

  const kidCovered = (s) => s.age < 18 && withParents(s);

  registerActions([
    // --- needs ---
    { id: 'home-food', group: 'Food & rest', icon: '🍲', name: "Eat mama's food at home", hours: 0.5, cost: 0, can: (s) => (withParents(s) ? null : 'You don\'t live with your parents'), run: (s) => { need(s, 'hunger', 55); need(s, 'social', 5); return pick(s, ['Hot eba and egusi. Mama no dey disappoint.', 'Jollof rice from yesterday — even better today.', 'Beans and dodo. You licked the plate.']); } },
    { id: 'cook', group: 'Food & rest', icon: '🍳', name: 'Cook at home', hours: 1, cost: 2500, minAge: 10, can: (s) => (s.livingWithParents ? 'Mama is in charge of the kitchen' : null), run: (s) => { need(s, 'hunger', 60); return 'You cooked rice and stew for yourself.'; } },
    { id: 'street-food', group: 'Food & rest', icon: '🥖', name: 'Bread & akara by the roadside', hours: 0.5, cost: 1500, minAge: 6, run: (s) => { need(s, 'hunger', 35); return 'Hot akara and agege bread. Simple and sweet.'; } },
    { id: 'buka', group: 'Food & rest', icon: '🍛', name: 'Amala & ewedu at a buka', hours: 1, cost: 4000, minAge: 8, run: (s) => { need(s, 'hunger', 55); need(s, 'social', 6); need(s, 'fun', 4); return 'Amala, ewedu, gbegiri and assorted meat. Heaven.'; } },
    { id: 'restaurant', group: 'Food & rest', icon: '🍽️', name: 'Eat out at a restaurant', hours: 1.5, cost: 15000, minAge: 12, run: (s) => { need(s, 'hunger', 70); need(s, 'fun', 12); need(s, 'social', 8); return 'You ate at a nice restaurant and took pictures for the gram.'; } },
    { id: 'beg-food', group: 'Food & rest', icon: '🙏', name: 'Ask a friend for food', hours: 1, cost: 0, minAge: 6,
      can: (s) => (s.money >= 1500 ? 'You can afford food' : (s.dayActs.begged || 0) >= 2 ? 'Your friends are tired of you today' : null),
      run: (s) => { s.dayActs.begged = (s.dayActs.begged || 0) + 1; need(s, 'hunger', 40); need(s, 'social', -5); stat(s, 'happiness', -3); return pick(s, ['Your friend shared their eba with you. Humbling.', 'A neighbour gave you leftover rice. Sapa is real.', 'You stood near a buka until the woman took pity on you.']); } },
    { id: 'shower', group: 'Food & rest', icon: '🚿', name: 'Have a bath', hours: 0.5, cost: 0, run: (s) => { if (chance(s, 0.15)) { need(s, 'energy', -5); s.needs.hygiene = 100; return 'No running water again. You fetched water from the well before bathing.'; } s.needs.hygiene = 100; return 'Fresh and clean.'; } },
    { id: 'nap', group: 'Food & rest', icon: '😪', name: 'Take a nap', hours: 2, cost: 0, run: (s) => { need(s, 'energy', 28); return 'A sweet afternoon nap.'; } },
    { id: 'relax', group: 'Food & rest', icon: '🛋️', name: 'Relax at home', hours: 1, cost: 0, run: (s) => { need(s, 'fun', 6); need(s, 'energy', 6); return 'You relaxed and watched Africa Magic.'; } },

    // --- school & work ---
    { id: 'school', group: 'School & work', icon: '🎒', name: 'Go to school', hours: 7, cost: 0, minAge: 5,
      can: (s) => (!inSchool(s) ? 'You are not in school' : !isWeekday(s) ? 'No school on weekends' : hour(s) >= 10 ? 'Too late — classes started at 8' : s.dayActs.school ? 'Already went today' : null),
      run: (s) => { s.dayActs.school = true; s.edu.daysAttended = (s.edu.daysAttended || 0) + 1; need(s, 'social', 18); need(s, 'energy', -8); if (chance(s, 0.03)) stat(s, 'smarts', 1); return pick(s, ['You sat through classes and copied notes.', 'Your teacher flogged a latecomer. You were early, thank God.', 'You learnt something new today.', 'Lecture was long, but you survived.']); } },
    { id: 'study', group: 'School & work', icon: '📖', name: 'Study / do homework', hours: 2, cost: 0, minAge: 6,
      can: (s) => (!inSchool(s) ? 'You are not in school' : null),
      run: (s) => { s.edu.effort = Math.min(15, s.edu.effort + 0.5); need(s, 'fun', -6); if (chance(s, 0.03)) stat(s, 'smarts', 1); return 'You studied hard.'; } },
    { id: 'work', group: 'School & work', icon: '💼', name: 'Go to work', hours: 8, cost: 0,
      label: (s) => (s.job ? `Go to work (${s.job.title})` : 'Go to work'),
      can: (s) => (!s.job ? 'You have no job' : !isWeekday(s) && !['okada', 'keke', 'trader', 'pos', 'border-trader', 'barber', 'tailor', 'mechanic'].includes(s.job.id) ? 'It\'s the weekend' : hour(s) >= 11 ? 'Too late to resume today' : s.dayActs.work ? 'Already worked today' : null),
      extraHours: (s) => (s.job && s.job.town !== s.town ? Math.round(E.distanceKm(E.TOWN[s.town], E.TOWN[s.job.town]) / 25 * 2) / 2 : 0),
      run: (s) => {
        s.dayActs.work = true;
        s.week = s.week || { worked: 0, overtime: 0 };
        s.week.worked++;
        s.job.daysWorked = (s.job.daysWorked || 0) + 1;
        need(s, 'energy', -10);
        let extra = '';
        if (s.job.town !== s.town) {
          const km = E.distanceKm(E.TOWN[s.town], E.TOWN[s.job.town]);
          const cost = round1k(Math.max(1000, km * 2 * D.TRANSPORT[E.hasAssetKind(s, 'car') ? 'car' : 'bus'].perKm));
          s.money -= cost;
          extra = ` Commute to ${E.TOWN[s.job.town].name}: ${naira(cost)}.`;
        }
        if (chance(s, 0.3)) s.job.perf = clamp(s.job.perf + 1);
        return pick(s, ['A long day at work.', 'Your boss shouted at everyone, but you held it down.', 'Work was busy today.', 'You closed late but you did your job.']) + extra;
      } },
    { id: 'overtime', group: 'School & work', icon: '⏱️', name: 'Work overtime', hours: 3, cost: 0,
      can: (s) => (!s.dayActs.work ? 'Go to work first' : s.dayActs.overtime ? 'Already did overtime' : null),
      run: (s) => { s.dayActs.overtime = true; s.week.overtime += dailyPay(s) * 0.35; s.job.perf = clamp(s.job.perf + 1); need(s, 'energy', -8); return 'You stayed back for overtime. Extra money is coming on payday.'; } },
    { id: 'hustle', group: 'School & work', icon: '🛒', name: 'Side hustle (sell, run errands)', hours: 4, cost: 0, minAge: 12,
      run: (s) => { const earn = round1k(randInt(s, 3, 14) * 1000 * (s.age >= 18 ? 2.5 : 1)); s.money += earn; need(s, 'energy', -8); return `You hustled and made ${naira(earn)}.`; } },
    { id: 'read', group: 'School & work', icon: '📚', name: 'Read a book', hours: 2, cost: 0, minAge: 7, run: (s) => { need(s, 'fun', 3); if (chance(s, 0.04)) stat(s, 'smarts', 1); return pick(s, ['You read a Chinua Achebe novel.', 'You read a Wole Soyinka play.', 'You read a self-help book about wealth.']); } },

    // --- fun & social ---
    { id: 'play', group: 'Fun & people', icon: '🧸', name: 'Play with toys', hours: 2, cost: 0, maxAge: 9, run: (s) => { need(s, 'fun', 30); need(s, 'energy', -4); return 'You played happily.'; } },
    { id: 'street-ball', group: 'Fun & people', icon: '⚽', name: 'Play football on the street', hours: 2, cost: 0, minAge: 5, maxAge: 45, run: (s) => { need(s, 'fun', 25); need(s, 'social', 12); need(s, 'energy', -12); need(s, 'hygiene', -20); if (chance(s, 0.15)) stat(s, 'health', 1); return pick(s, ['You scored a screamer between two stones!', 'Your team lost, but it was fun.', 'The ball entered a neighbour\'s compound. Wahala.']); } },
    { id: 'hangout', group: 'Fun & people', icon: '🗣️', name: 'Gist with friends at the junction', hours: 2, cost: 0, minAge: 8, run: (s) => { need(s, 'social', 30); need(s, 'fun', 12); return pick(s, ['You gisted about politics and football.', 'Your friends roasted you mercilessly.', 'Lots of gist and laughter.']); } },
    { id: 'viewing', group: 'Fun & people', icon: '📺', name: 'Watch football at a viewing centre', hours: 2, cost: 500, minAge: 8, run: (s) => { need(s, 'fun', 30); need(s, 'social', 12); return pick(s, ['Your team won 3–0! The whole centre erupted.', 'Your team lost. You argued with fans for an hour.', 'A last-minute equaliser! Madness.']); } },
    { id: 'game-centre', group: 'Fun & people', icon: '🎮', name: 'Play FIFA at a game centre', hours: 2, cost: 1000, minAge: 8, run: (s) => { need(s, 'fun', 28); need(s, 'social', 6); return chance(s, 0.5) ? 'You won every match. Champion of the area!' : 'A small boy beat you 5–0.'; } },
    { id: 'phone', group: 'Fun & people', icon: '📱', name: 'Scroll TikTok & WhatsApp', hours: 1, cost: 0, minAge: 10, run: (s) => { need(s, 'fun', 10); need(s, 'social', 6); return 'You scrolled. An hour vanished.'; } },
    { id: 'call', group: 'Fun & people', icon: '☎️', name: 'Call family & friends', hours: 0.5, cost: 0, minAge: 10, run: (s) => { need(s, 'social', 15); return 'You caught up with people you love.'; } },
    { id: 'family', group: 'Fun & people', icon: '👪', name: 'Spend time with family', hours: 2, cost: 0, can: (s) => (s.relations.some((r) => r.alive && ['mother', 'father', 'spouse', 'child'].includes(r.role)) ? null : 'No close family around'),
      run: (s) => { need(s, 'social', 18); need(s, 'fun', 6); for (const r of s.relations) if (r.alive && ['mother', 'father', 'spouse', 'child'].includes(r.role)) r.closeness = clamp(r.closeness + 2); return 'You spent quality time with family.'; } },
    { id: 'worship', group: 'Fun & people', icon: '🛐', name: 'Church service / Jumat prayer', hours: 2, cost: 0, can: (s) => (s.clock.dow === 4 || s.clock.dow === 6 ? null : 'Services are on Friday (Jumat) and Sunday'), run: (s) => { need(s, 'social', 20); need(s, 'fun', 4); s.karma = clamp(s.karma + 1); stat(s, 'happiness', 1); return 'The service was uplifting.'; } },
    { id: 'date', group: 'Fun & people', icon: '❤️', name: 'Go on a date', hours: 3, cost: 10000, minAge: 16, can: (s) => (E.partner(s) ? null : 'You are single'),
      run: (s) => { const p = E.partner(s); p.closeness = clamp(p.closeness + 8); need(s, 'social', 25); need(s, 'fun', 20); return `You took ${p.first} out for suya and drinks.`; } },
    { id: 'gym', group: 'Fun & people', icon: '🏋️', name: 'Gym session', hours: 2, cost: 2500, minAge: 14, run: (s) => { need(s, 'energy', -14); need(s, 'hygiene', -25); if (chance(s, 0.35)) stat(s, 'health', 1); if (chance(s, 0.25)) stat(s, 'looks', 1); return 'You pumped iron.'; } },
    { id: 'club', group: 'Fun & people', icon: '🪩', name: 'Go clubbing', hours: 4, cost: 25000, minAge: 18, can: (s) => (hour(s) < 20 ? 'Clubs open after 8pm' : null), run: (s) => { need(s, 'fun', 40); need(s, 'social', 30); need(s, 'energy', -15); if (chance(s, 0.2)) stat(s, 'health', -1); return 'You danced till your legs gave up.'; } },
    { id: 'community', group: 'Fun & people', icon: '🤝', name: 'Community service / CDA meeting', hours: 3, cost: 0, minAge: 16, run: (s) => { need(s, 'social', 12); s.karma = clamp(s.karma + 1); s.politics.popularity = clamp(s.politics.popularity + 1); return 'You helped clear the drainage with your community.'; } },
  ]);

  function actionInfo(s, a) {
    const hrs = a.hours + (a.extraHours ? a.extraHours(s) : 0);
    let why = null;
    if (!s.alive || s.ended) why = 'Game over';
    else if (s.events.length) why = 'Respond to the event first';
    else if (!!a.jail !== !!s.jail && !a.anywhere) why = s.jail ? 'You are in prison' : 'Only in prison';
    else if (a.minAge && s.age < a.minAge) why = `From age ${a.minAge}`;
    else if (a.maxAge && s.age > a.maxAge) why = 'You are too old for this';
    else if (a.can && (why = a.can(s))) { /* reason set */ }
    else if ((why = gateReason(s, { type: 'action', id: a.id }))) { /* blocked by a gate */ }
    else if (a.cost && s.money < a.cost && !kidCovered(s)) why = `Need ${naira(a.cost)}`;
    else if (a.id !== 'sleep' && s.clock.min + hrs * 60 > 26 * 60) why = 'Too late today — go and sleep';
    return { why, hours: hrs, name: a.label ? a.label(s) : a.name };
  }

  function listActions(s) {
    return ACTIONS.filter((a) => (s.jail ? a.jail || a.anywhere : !a.jail) && (!a.hidden || !a.hidden(s)))
      .map((a) => Object.assign({ id: a.id, group: a.group, icon: a.icon, cost: a.cost }, actionInfo(s, a)));
  }

  function doAction(s, id) {
    const a = ACTIONS.find((x) => x.id === id);
    if (!a) return { ok: false, msg: 'Unknown action.' };
    const info = actionInfo(s, a);
    if (info.why) return { ok: false, msg: info.why };
    if (a.cost) {
      if (kidCovered(s) && s.money < a.cost) { /* parents pay small costs for children */ } else s.money -= a.cost;
    }
    const msg = a.run(s) || '';
    if (a.id !== 'sleep' && s.alive && !s.ended) {
      passTime(s, info.hours * 60);
      if (!a.noEncounter) rollEncounter(s, info.hours);
    }
    return { ok: true, msg };
  }

  // Sleep is its own action so it can roll the day over.
  registerActions([{ id: 'sleep', group: 'Food & rest', icon: '🛏️', name: 'Sleep till morning', hours: 0, cost: 0, anywhere: true, noEncounter: true,
    can: (s) => (s.clock.min >= 2 * 60 && s.clock.min < 17 * 60 ? 'Too early to sleep for the night' : null),
    run: (s) => sleep(s) }]);

  // Time passes while the player is idle (real-time clock).
  function idle(s, minutes) {
    if (!s.alive || s.ended || s.events.length) return;
    const before = s.clock.min;
    passTime(s, minutes);
    const hrs = ((s.clock.min - before + 24 * 60) % (24 * 60)) / 60;
    if (hrs > 0) rollEncounter(s, Math.min(hrs, 2));
  }

  // ---------- trips (map) ----------

  function trip(s, placeId, mode = 'bus') {
    const p = E.PLACE[placeId];
    if (!p) return { ok: false, msg: 'Unknown place.' };
    const blocked = gateReason(s, { type: 'trip', place: p, mode });
    if (blocked) return { ok: false, msg: blocked };
    const q = E.tripQuote(s, p, mode);
    if (!q.ok) return q;
    const kmh = { okada: 35, car: 45, ride: 45, keke: 25, bus: 28, trek: 5, bike: 35 }[mode] || 28;
    const hrs = Math.max(1, Math.round((q.km * 2 / kmh + 1.5) * 2) / 2);
    if (s.clock.min + hrs * 60 > 26 * 60) return { ok: false, msg: 'Too late for a trip today. Go tomorrow morning.' };
    const r = E.visitPlace(s, placeId, mode);
    if (!r.ok) return r;
    need(s, 'fun', 15);
    need(s, 'social', 6);
    passTime(s, hrs * 60);
    rollEncounter(s, hrs);
    return { ok: true, msg: `${r.msg} (${hrs}h round trip)` };
  }

  // ---------- autopilot ----------

  function pickAuto(s) {
    const ok = (id) => { const a = ACTIONS.find((x) => x.id === id); return a && !actionInfo(s, a).why; };
    const h = hour(s);
    if (s.jail) {
      if (h >= 22 || s.needs.energy < 12) return 'sleep';
      if (s.needs.hunger < 40 && ok('j-eat')) return 'j-eat';
      if (s.needs.hygiene < 35 && ok('j-bath')) return 'j-bath';
      if (h >= 8 && h < 14 && !s.dayActs['j-work'] && ok('j-work')) return 'j-work';
      if (s.needs.social < 40 && ok('j-gist')) return 'j-gist';
      if (s.clock.dow >= 4 && ok('j-pray') && !s.dayActs['j-pray']) return 'j-pray';
      return ok('j-rest') ? 'j-rest' : 'sleep';
    }
    if (h >= 22 || (s.needs.energy < 12 && h >= 17)) return 'sleep';
    if (s.needs.energy < 15 && ok('nap')) return 'nap';
    if (s.needs.hunger < 40) {
      for (const id of ['home-food', 'cook', 'street-food', 'lafun', 'beg-food']) if (ok(id)) return id;
    }
    if (s.needs.hygiene < 40 && ok('shower')) return 'shower';
    if (ok('school')) return 'school';
    if (ok('work')) return 'work';
    for (const fn of AUTO_HOOKS) { const id = fn(s, ok, h); if (id) return id; }
    if (inSchool(s) && h >= 16 && h < 20 && !s.dayActs.autoStudy && ok('study') && s.age >= 6) { s.dayActs.autoStudy = true; return 'study'; }
    if (s.needs.social < 40) for (const id of ['hangout', 'family', 'call']) if (ok(id) && !s.dayActs['auto-' + id]) { s.dayActs['auto-' + id] = true; return id; }
    if (s.needs.fun < 40) for (const id of ['play', 'street-ball', 'phone', 'hangout']) if (ok(id)) return id;
    if (ok('worship') && !s.dayActs.autoWorship) { s.dayActs.autoWorship = true; return 'worship'; }
    return ok('relax') ? 'relax' : 'sleep';
  }

  function autoStep(s) {
    if (!s.alive || s.ended || s.events.length) return null;
    const id = pickAuto(s);
    const r = doAction(s, id);
    // Nothing sensible to do right now (e.g. locked out of your room): let an hour pass.
    if (!r.ok) { idle(s, 60); return { id: 'wait', ok: true, msg: 'You waited around.' }; }
    return { id, ...r };
  }

  // Run the routine until the condition is met or something needs the player.
  function fastForward(s, until, maxSteps = 2000) {
    const startDay = s.clock.day;
    const startAge = s.age;
    for (let i = 0; i < maxSteps; i++) {
      if (!s.alive || s.ended || s.events.length) return;
      if (until === 'day' && s.clock.day !== startDay) return;
      if (until === 'year' && s.age !== startAge) return;
      autoStep(s);
    }
  }

  // ---------- daily encounters ----------

  const ENCOUNTERS = []; // { id, w, when }
  const DAY_HOOKS = [];
  function registerEncounters(defs) {
    const evs = {};
    for (const [id, def] of Object.entries(defs)) {
      ENCOUNTERS.push({ id, w: def.w || 1, when: def.when, jail: !!def.jail });
      evs[id] = { build: def.build, resolve: def.resolve }; // no `weight`, so yearly events never pick these
    }
    E.registerEvents(evs);
  }
  function onDay(fn) { DAY_HOOKS.push(fn); }

  function rollEncounter(s, hours) {
    if (!s.alive || s.ended || s.events.length || hours <= 0) return;
    const p = 1 - Math.pow(1 - (s.jail ? 0.025 : 0.015), hours);
    if (!chance(s, p)) return;
    s.encAges = s.encAges || {};
    const dayNo = s.age * E.DAYS_PER_YEAR + s.clock.day;
    const pool = ENCOUNTERS.filter((e) => e.jail === !!s.jail && dayNo - (s.encAges[e.id] ?? -99) >= 10 && (!e.when || e.when(s)));
    const total = pool.reduce((t, e) => t + e.w, 0);
    let r = rand(s) * total;
    for (const e of pool) {
      r -= e.w;
      if (r <= 0) { s.encAges[e.id] = dayNo; E.queueEvent(s, e.id); return; }
    }
  }

  const hasPhone = (s) => s.assets.some((a) => E.ASSET[a.id].kind === 'phone');
  const loseCash = (s, max) => { const l = Math.min(Math.max(0, s.money), max); s.money -= l; return l; };
  const single = (s) => !E.partner(s);

  registerEncounters({
    checkpoint: {
      w: 4, when: (s) => s.age >= 16,
      build: () => ({ title: '🚓 Police checkpoint', text: '"Oga, come down! Where are you going? Show us your phone and particulars."', choices: [{ label: 'Comply politely', value: 'comply' }, { label: 'Drop ₦2,000 "for pure water"', value: 'pay' }, { label: 'Argue about your rights', value: 'argue' }] }),
      resolve(s, v) {
        if (v === 'pay') { s.money -= 2000; s.karma = clamp(s.karma - 1); return 'They waved you on with a smile.'; }
        if (s.heat >= 45 && chance(s, 0.4)) { E.arrest(s, 'Police at a checkpoint recognised you from a wanted list', 2, false); return ''; }
        if (v === 'argue') {
          if (chance(s, 0.5)) { stat(s, 'happiness', 3); return 'You knew your rights and they let you go. Respect.'; }
          passTime(s, 180); stat(s, 'happiness', -6); return 'They detained you at the station for 3 hours "for questioning".';
        }
        if (chance(s, 0.35)) { const l = loseCash(s, 5000); return `They searched your phone and still collected ${naira(l)} "for the boys".`; }
        return 'They checked your phone and let you go.';
      },
    },
    'area-boys': {
      w: 4, when: (s) => s.age >= 14 && !s.flags.areaFriends,
      build: () => ({ title: '🧢 Area boys', text: 'Area boys block your path: "Bros, drop something for the boys! Owo ijoko!"', choices: [{ label: 'Pay ₦3,000', value: 'pay' }, { label: 'Refuse', value: 'refuse' }, { label: 'Buy them drinks & befriend them (₦8,000)', value: 'friend' }] }),
      resolve(s, v) {
        if (v === 'pay') { s.money -= 3000; return 'They hailed you: "Chairman!"'; }
        if (v === 'friend') { s.money -= 8000; s.flags.areaFriends = true; need(s, 'social', 15); return 'You are now cool with the area boys. They might help you on the streets.'; }
        if (chance(s, 0.4)) { stat(s, 'health', -8); return 'They beat you and seized your bag.'; }
        return 'You stood your ground and walked away.';
      },
    },
    'one-chance': {
      w: 2, when: (s) => s.age >= 16,
      build: () => ({ title: '🚐 "One chance" bus', text: 'The danfo you entered has gone quiet, the doors are locked and it is heading off the main road. This is one chance!', choices: [{ label: 'Jump out at the next hold-up', value: 'jump' }, { label: 'Stay calm and comply', value: 'comply' }, { label: 'Fight back', value: 'fight' }] }),
      resolve(s, v) {
        if (v === 'jump') { if (chance(s, 0.7)) { stat(s, 'happiness', -3); return 'You jumped out in traffic and ran. God dey!'; } stat(s, 'health', -15); return 'You jumped and landed badly, but you escaped.'; }
        if (v === 'comply') {
          const l = loseCash(s, 80000);
          const ph = s.assets.findIndex((a) => E.ASSET[a.id].kind === 'phone');
          if (ph >= 0) s.assets.splice(ph, 1);
          stat(s, 'health', -5); stat(s, 'happiness', -12);
          return `They robbed you of ${naira(l)}${ph >= 0 ? ' and your phone' : ''}, then dumped you on the expressway.`;
        }
        if (chance(s, 0.3)) { stat(s, 'happiness', 8); return 'You fought like a lion. The robbers panicked and fled!'; }
        stat(s, 'health', -22); loseCash(s, 80000); return 'They overpowered you, beat you badly and took everything.';
      },
    },
    'wrong-transfer': {
      w: 2, when: (s) => s.age >= 18,
      build: () => ({ title: '📲 Credit alert!', text: 'Someone mistakenly transferred ₦250,000 into your account. They are calling you, begging.', choices: [{ label: 'Return it', value: 'return' }, { label: 'Keep it and block them', value: 'keep' }] }),
      resolve(s, v) {
        if (v === 'return') { s.karma = clamp(s.karma + 10); if (chance(s, 0.35)) { s.money += 20000; return 'You returned it and they sent you ₦20,000 to say thank you.'; } return 'You returned it. Your conscience is clear.'; }
        s.money += 250000; s.karma = clamp(s.karma - 10); s.heat = clamp(s.heat + 15);
        if (chance(s, 0.3)) { s.money -= 250000; return 'The bank reversed it and flagged your account. The police invited you for questioning.'; }
        return 'You kept the money. Sapa has been defeated… for now.';
      },
    },
    preacher: {
      w: 2, when: (s) => s.age >= 14,
      build: () => ({ title: '🙏 Prophecy', text: 'A street preacher stops you: "I see a mighty breakthrough coming! Sow a seed of ₦10,000 now!"', choices: [{ label: 'Sow the ₦10,000 seed', value: 'sow' }, { label: 'Say "Amen" and walk away', value: 'amen' }] }),
      resolve(s, v) {
        if (v === 'sow') { s.money -= 10000; stat(s, 'happiness', 2); if (chance(s, 0.1)) { s.money += 100000; return 'Days later an old debtor paid you ₦100,000. Breakthrough!'; } return 'You sowed the seed. You are waiting on your breakthrough.'; }
        return '"Amen!" You walked away briskly.';
      },
    },
    'job-lead': {
      w: 2, when: (s) => s.age >= 16 && !s.job && !s.jail,
      build(s) {
        const ok = D.JOBS.filter((j) => !E.jobEligibility(s, j.id) && !s.yearActs['job-' + j.id]);
        if (!ok.length) return null;
        const j = pick(s, ok);
        return { title: '📞 Job lead', text: `Your friend's uncle says there is a vacancy for a ${j.title}. "Come with your CV tomorrow, I'll put in a word."`, choices: [{ label: 'Go for the interview', value: j.id }, { label: 'Not interested', value: '' }] };
      },
      resolve(s, v) { if (!v) return 'You passed on the opportunity.'; s.flags.referral = true; const r = E.applyJob(s, v); return r.ok ? `The referral worked! ${r.msg}` : 'Even with the referral, they did not pick you.'; },
    },
    celebrity: {
      w: 1, when: (s) => s.age >= 10,
      build: () => ({ title: '🌟 Celebrity sighting', text: 'You spotted a famous Nollywood actor at the mall in Abeokuta!', choices: [{ label: 'Ask for a selfie', value: 'selfie' }, { label: 'Pitch your talent to them', value: 'pitch' }, { label: 'Play it cool', value: 'cool' }] }),
      resolve(s, v) {
        if (v === 'selfie') { need(s, 'fun', 15); need(s, 'social', 10); return 'You got the selfie. Your WhatsApp status is on fire.'; }
        if (v === 'pitch') { if (chance(s, 0.1 + s.stats.looks / 500)) { s.money += 200000; s.flags.actor = true; return 'They loved your energy and gave you a small role in a movie! ₦200,000.'; } return 'Their bodyguard pushed you away.'; }
        return 'You played it cool. Nobody noticed you.';
      },
    },
    'neighbour-party': {
      w: 2,
      build: () => ({ title: '🔊 Noisy neighbours', text: 'Your neighbours are throwing a party with speakers facing your window. It is 1am.', choices: [{ label: 'Join the party', value: 'join' }, { label: 'Go and complain', value: 'complain' }, { label: 'Endure it', value: 'endure' }] }),
      resolve(s, v) {
        if (v === 'join') { need(s, 'fun', 20); need(s, 'social', 18); need(s, 'energy', -20); return 'You danced till dawn. Who needs sleep?'; }
        if (v === 'complain') { need(s, 'social', -8); return 'They turned it down… for ten minutes.'; }
        need(s, 'energy', -15); return 'You barely slept.';
      },
    },
    borrow: {
      w: 2, when: (s) => s.age >= 14 && s.money >= 20000 && !s.flags.owed,
      build: () => ({ title: '🤲 "Abeg, borrow me"', text: 'Your friend begs: "Borrow me ₦20,000. I go pay back Friday, I swear."', choices: [{ label: 'Lend the money', value: 'lend' }, { label: 'Say you are broke', value: 'no' }] }),
      resolve(s, v) { if (v === 'lend') { s.money -= 20000; s.flags.owed = 20000; need(s, 'social', 8); return 'You lent them the money. Let\'s see about Friday.'; } need(s, 'social', -5); return 'They looked at you like you betrayed them.'; },
    },
    crush: {
      w: 2, when: (s) => s.age >= 16 && single(s),
      build: () => ({ title: '😍 Someone is looking at you', text: 'Someone attractive keeps smiling at you at the bus stop.', choices: [{ label: 'Collect their number', value: 'go' }, { label: 'Too shy', value: 'no' }] }),
      resolve(s, v) {
        if (v === 'no') return 'You let the moment pass.';
        if (!chance(s, 0.35 + s.stats.looks / 200)) { need(s, 'social', -5); return 'They said they already have someone. Ouch.'; }
        const g = s.gender === 'male' ? 'female' : 'male';
        const p = E._h.newPerson(s, 'partner', g, clamp(s.age + randInt(s, -3, 4), 16, 99), { closeness: 55, town: s.town });
        s.relations.push(p);
        return `You got ${p.first}'s number. You are now talking!`;
      },
    },
    viral: {
      w: 1, when: (s) => s.age >= 13 && hasPhone(s) && !s.flags.influencer,
      build: () => ({ title: '📈 You went viral!', text: 'A skit you posted is all over TikTok and Instagram.', choices: [{ label: 'Start a skit page and go full-time influencer', value: 'go' }, { label: 'Enjoy the 15 minutes of fame', value: 'enjoy' }] }),
      resolve(s, v) { need(s, 'fun', 20); if (v === 'go') { s.flags.influencer = true; return 'You are now a content creator. Brand deals may come (check your side hustles).'; } return 'You enjoyed the attention.'; },
    },
    'sure-odds': {
      w: 2, when: (s) => s.age >= 18,
      build: () => ({ title: '🎰 "Sure banker"', text: 'Your friend has a 10-odds ticket: "This one na sure banker!" Stake ₦10,000?', choices: [{ label: 'Stake ₦10,000', value: 'bet' }, { label: 'No thanks', value: 'no' }] }),
      resolve(s, v) { if (v === 'no') return 'You kept your money.'; s.money -= 10000; if (chance(s, 0.12)) { s.money += 100000; need(s, 'fun', 25); return 'IT CAME! You won ₦100,000!'; } need(s, 'fun', -5); return 'Arsenal drew in the 94th minute. Ticket cut.'; },
    },
    flood: {
      w: 2,
      build: () => ({ title: '🌧️ Flash flood', text: 'A downpour flooded the road. Gutters are overflowing.', choices: [{ label: 'Wade through it', value: 'wade' }, { label: 'Wait it out', value: 'wait' }] }),
      resolve(s, v) { if (v === 'wade') { s.needs.hygiene = 10; if (chance(s, 0.15)) { stat(s, 'health', -5); return 'You stepped on something sharp in the water.'; } return 'You waded through dirty water.'; } passTime(s, 120); return 'You waited 2 hours for the water to go down.'; },
    },
    'lost-child': {
      w: 1, when: (s) => s.age >= 12,
      build: () => ({ title: '🧒 Lost child', text: 'A crying little girl is lost in the market. Nobody seems to care.', choices: [{ label: 'Help her find her mother', value: 'help' }, { label: 'Walk away', value: 'leave' }] }),
      resolve(s, v) { if (v === 'help') { passTime(s, 90); s.karma = clamp(s.karma + 8); stat(s, 'happiness', 4); return 'After searching, you found her mother, who cried and blessed you.'; } s.karma = clamp(s.karma - 3); return 'You walked away. You keep thinking about her.'; },
    },
    'accident-victim': {
      w: 1, when: (s) => s.age >= 16,
      build: () => ({ title: '🚑 Accident on the expressway', text: 'A car has crashed on the Lagos–Abeokuta expressway. The driver is bleeding and people are just filming.', choices: [{ label: 'Rush them to hospital (₦20,000)', value: 'help' }, { label: 'Call for help and move on', value: 'call' }, { label: 'Film it too', value: 'film' }] }),
      resolve(s, v) {
        if (v === 'help') { s.money -= 20000; s.karma = clamp(s.karma + 12); passTime(s, 120); if (chance(s, 0.2)) { s.money += 300000; return 'You saved their life. Their family later gave you ₦300,000 in gratitude.'; } return 'The doctors said you saved their life.'; }
        if (v === 'call') { s.karma = clamp(s.karma + 2); return 'You called emergency services.'; }
        s.karma = clamp(s.karma - 6); return 'You filmed it. Your video got views; you feel empty.';
      },
    },
    thief: {
      w: 2, when: (s) => s.age >= 12,
      build: () => ({ title: '🏃 "Ole! Ole!"', text: 'A boy just snatched a woman\'s phone and is running past you.', choices: [{ label: 'Chase him', value: 'chase' }, { label: 'Shout "Ole!" for the crowd', value: 'shout' }, { label: 'Mind your business', value: 'mind' }] }),
      resolve(s, v) {
        if (v === 'chase') { if (chance(s, 0.4)) { s.money += 10000; s.karma = clamp(s.karma + 5); return 'You caught him! The woman gave you ₦10,000.'; } if (chance(s, 0.3)) { stat(s, 'health', -12); return 'He pulled a knife and cut your arm.'; } return 'He outran you.'; }
        if (v === 'shout') { return 'The crowd caught him. Thankfully police arrived before jungle justice.'; }
        return 'You minded your business.';
      },
    },
    'fake-iphone': {
      w: 1, when: (s) => s.age >= 16 && s.money >= 250000,
      build: () => ({ title: '📱 "Brand new iPhone, ₦250k"', text: 'A man at Sango Ota is selling a "brand new" iPhone for ₦250,000. Original price is way more.', choices: [{ label: 'Buy it', value: 'buy' }, { label: 'Na scam, waka', value: 'no' }] }),
      resolve(s, v) {
        if (v === 'no') return 'You walked away. Wise.';
        s.money -= 250000;
        if (chance(s, 0.7)) { stat(s, 'happiness', -10); return 'You got home and opened the box: a bar of soap wrapped in a phone case.'; }
        s.assets.push({ uid: 'a' + s.nextId++, id: 'phone-iphone', value: 1000000, boughtYear: s.year }); stat(s, 'happiness', 8); return 'Unbelievably, it was a real (stolen?) iPhone.';
      },
    },
    sorting: {
      w: 2, when: (s) => s.edu.current && (s.edu.current.kind === 'tertiary' || (s.edu.current.kind === 'secondary' && s.edu.current.year >= 4)),
      build: (s) => ({ title: '📝 "Sorting"', text: `A ${s.edu.current.kind === 'tertiary' ? 'lecturer' : 'teacher'} hints that students who "buy the handout" for ₦30,000 will pass the exam.`, choices: [{ label: 'Pay ₦30,000', value: 'pay' }, { label: 'Refuse and read harder', value: 'no' }, { label: 'Report to the school authorities', value: 'report' }] }),
      resolve(s, v) {
        if (v === 'pay') { s.money -= 30000; s.edu.effort = Math.min(15, s.edu.effort + 2); s.karma = clamp(s.karma - 2); return 'You "sorted". Your grade should be fine.'; }
        if (v === 'report') { if (chance(s, 0.5)) { s.karma = clamp(s.karma + 6); return 'The school investigated and the lecturer was suspended. Students hail you.'; } s.edu.effort = Math.max(0, s.edu.effort - 3); return 'Nothing happened, and now the lecturer has marked you.'; }
        if (chance(s, 0.3)) s.edu.effort = Math.max(0, s.edu.effort - 2);
        return 'You refused and buried your head in your books.';
      },
    },
    bully: {
      w: 2, when: (s) => s.age >= 7 && s.age <= 16 && inSchool(s),
      build: () => ({ title: '😠 School bully', text: 'A senior student demands your lunch money and says he will "deal with you" after school.', choices: [{ label: 'Give him your money', value: 'give' }, { label: 'Fight him', value: 'fight' }, { label: 'Report to the principal', value: 'report' }] }),
      resolve(s, v) {
        if (v === 'give') { loseCash(s, 1000); stat(s, 'happiness', -3); return 'You handed over your money.'; }
        if (v === 'fight') { if (chance(s, 0.45)) { need(s, 'social', 20); return 'You beat him! Nobody will try you again.'; } stat(s, 'health', -6); return 'He beat you up. You have a black eye.'; }
        return chance(s, 0.6) ? 'The principal flogged him in front of the assembly.' : 'The principal said "boys will be boys".';
      },
    },
    'free-food': {
      w: 2, when: (s) => s.age >= 10,
      build: () => ({ title: '🎉 Owambe next street', text: 'There is a big party next street with jollof, small chops and Gulder flowing.', choices: [{ label: 'Gate-crash for the food', value: 'go' }, { label: 'Stay home', value: 'no' }] }),
      resolve(s, v) { if (v === 'no') return 'You stayed home.'; if (chance(s, 0.2)) { need(s, 'social', -10); return 'The bouncers asked for your invitation card. Embarrassing!'; } need(s, 'hunger', 60); need(s, 'fun', 20); return 'You ate jollof and danced like a family member.'; },
    },
    'otp-scam': {
      w: 2, when: (s) => s.age >= 18 && s.money > 20000,
      build: () => ({ title: '☎️ "Your BVN has been blocked"', text: 'A caller says he is from your bank: "Your account is blocked. Read out the OTP we just sent to restore it."', choices: [{ label: 'Read out the OTP', value: 'otp' }, { label: 'Hang up', value: 'hang' }] }),
      resolve(s, v) { if (v === 'hang') return 'You hung up. Not today, scammer.'; const l = loseCash(s, Math.min(500000, Math.round(s.money * 0.6))); stat(s, 'happiness', -12); return `Your account was emptied of ${naira(l)}. It was a scam.`; },
    },
    'police-stop': {
      w: 2, when: (s) => s.age >= 16 && s.age <= 35,
      build: () => ({ title: '👮 Stop and search', text: 'Policemen stop you because of your hairstyle and laptop bag: "You be yahoo boy abi?"', choices: [{ label: 'Show your ID and explain', value: 'explain' }, { label: 'Record them on your phone', value: 'record' }, { label: 'Pay ₦20,000 to go', value: 'pay' }] }),
      resolve(s, v) {
        if (v === 'pay') { s.money -= 20000; stat(s, 'happiness', -5); return 'You paid and they let you go. You are angry.'; }
        if (v === 'record') { if (chance(s, 0.5)) return 'Seeing the camera, they quickly let you go.'; passTime(s, 360); stat(s, 'happiness', -8); return 'They seized your phone and detained you for 6 hours.'; }
        if (chance(s, 0.6)) return 'They checked your ID and let you go.';
        const l = loseCash(s, 20000); return `They still extorted ${naira(l)} from you.`;
      },
    },
    'quit-notice': {
      w: 3, when: (s) => !s.livingWithParents && s.money < 0,
      build: (s) => ({ title: '🏚️ Quit notice', text: `Your landlord in ${E.TOWN[s.town].name} has served you a quit notice for unpaid rent.`, choices: [{ label: 'Beg for more time', value: 'beg' }, { label: E.parentsAlive(s) ? 'Move back with your parents' : 'Squat with a friend', value: 'move' }] }),
      resolve(s, v) {
        if (v === 'beg' && chance(s, 0.5)) return 'The landlord gave you one more month. Hustle hard!';
        if (E.parentsAlive(s)) { s.town = s.homeTown; s.livingWithParents = true; stat(s, 'happiness', -8); return 'You packed your things and moved back home.'; }
        stat(s, 'happiness', -12); s.rentMult = 0.5; return 'You moved into a friend\'s room. Rent is lower but life is tight.';
      },
    },
    'kidnap-threat': {
      w: 2, when: (s) => ['comfortable', 'rich', 'politician'].includes(s.family.wealth) && s.age >= 6 && !s.flags.escortYear,
      build: (s) => ({ title: '🕶️ Strange men', text: 'Unknown men in a tinted car have been watching your house for days.', choices: [{ label: s.age < 18 ? 'Tell your parents' : 'Hire police escort (₦200,000)', value: 'escort' }, { label: 'Ignore it', value: 'ignore' }] }),
      resolve(s, v) {
        if (v === 'escort') { if (s.age >= 18) s.money -= 200000; s.flags.escortYear = s.year; return 'Security was beefed up. The car disappeared.'; }
        if (!chance(s, 0.3)) return 'Nothing happened. Maybe you were being paranoid.';
        stat(s, 'health', -10); stat(s, 'happiness', -25);
        const ransom = s.family.wealth === 'politician' ? 50000000 : s.family.wealth === 'rich' ? 20000000 : 5000000;
        if (E.parentsAlive(s)) { passTime(s, 24 * 60); return `You were kidnapped and held in a forest for days. Your family paid ${naira(ransom)} ransom and you were released.`; }
        s.money -= Math.min(Math.max(0, s.money), ransom); return 'You were kidnapped. You paid a huge ransom from your savings to be released.';
      },
    },
    'efcc-parent': {
      w: 2, when: (s) => s.family.wealth === 'politician' && E.parentsAlive(s) && !s.flags.efccParent,
      build: (s) => ({ title: '🗞️ EFCC wahala', text: `The EFCC has invited your ${s.family.politician.role}, ${s.family.politician.title}, over alleged diversion of public funds. It is all over the news.`, choices: [{ label: 'Stand by your family', value: 'stand' }, { label: 'Publicly distance yourself', value: 'distance' }] }),
      resolve(s, v) {
        s.flags.efccParent = true;
        const par = s.relations.find((r) => r.role === s.family.politician.role);
        if (v === 'distance' && par) par.closeness = clamp(par.closeness - 30);
        if (chance(s, 0.5)) return 'After months of hearings, the case "died" quietly. Life went on.';
        s.family.wealth = 'comfortable';
        stat(s, 'happiness', -10);
        return 'The court froze several family accounts and seized properties. The family is now merely comfortable.';
      },
    },
    lotto: {
      w: 2, when: (s) => s.age >= 18,
      build: () => ({ title: '🎟️ Lotto kiosk', text: 'The lotto agent is calling: "Play 5 numbers for ₦500! Today na your day!"', choices: [{ label: 'Play ₦500', value: 'play' }, { label: 'Walk past', value: 'no' }] }),
      resolve(s, v) { if (v === 'no') return 'You walked past.'; s.money -= 500; if (chance(s, 0.01)) { s.money += 5000000; stat(s, 'happiness', 30); return '🤑 JACKPOT! You won ₦5,000,000!!!'; } if (chance(s, 0.1)) { s.money += 5000; return 'You won ₦5,000. Small but sweet.'; } return 'No luck today.'; },
    },
    'okada-fare': {
      w: 2, when: (s) => s.age >= 12,
      build: () => ({ title: '🛵 Okada palava', text: 'The okada man you took is demanding double the agreed fare: "Fuel don cost!"', choices: [{ label: 'Pay him ₦1,000 extra', value: 'pay' }, { label: 'Argue', value: 'argue' }, { label: 'Walk away', value: 'walk' }] }),
      resolve(s, v) { if (v === 'pay') { s.money -= 1000; return 'You paid ₦1,000 extra.'; } if (v === 'argue') { if (chance(s, 0.6)) return 'Bystanders took your side. He collected the agreed fare.'; need(s, 'social', -5); s.money -= 1000; return 'He called his fellow riders. You paid.'; } if (chance(s, 0.3)) { stat(s, 'health', -6); return 'He and his friends roughed you up.'; } return 'You walked away and he cursed you in Yoruba.'; },
    },
    'family-emergency': {
      w: 1, when: (s) => s.age >= 18 && s.relations.some((r) => r.alive && ['mother', 'father', 'sibling'].includes(r.role)),
      build(s) {
        const r = pick(s, s.relations.filter((x) => x.alive && ['mother', 'father', 'sibling'].includes(x.role)));
        return { title: '🏥 Family emergency', text: `${r.first} has been admitted to hospital and needs ₦150,000 for treatment.`, choices: [{ label: 'Pay the ₦150,000 hospital bill', value: r.id }, { label: 'Say you don\'t have it', value: '' }] };
      },
      resolve(s, v) { if (!v) { s.karma = clamp(s.karma - 4); return 'Other relatives contributed. Some are not talking to you.'; } s.money -= 150000; const r = E._h.relation(s, v); if (r) r.closeness = clamp(r.closeness + 20); s.karma = clamp(s.karma + 5); return 'You paid the bill. They recovered and are grateful.'; },
    },

    // --- prison encounters ---
    'j-fight': {
      jail: true, w: 3,
      build: () => ({ title: '🥊 Cell fight', text: 'A big cellmate says your sleeping space now belongs to him.', choices: [{ label: 'Fight back', value: 'fight' }, { label: 'Report to the warder', value: 'report' }, { label: 'Give him the space', value: 'give' }] }),
      resolve(s, v) {
        if (v === 'fight') { s.jail.behaviour = clamp(s.jail.behaviour - 10); if (chance(s, s.jail.gang ? 0.7 : 0.45)) return 'You won. The cell respects you now.'; stat(s, 'health', -14); return 'You lost badly and spent days in the prison clinic.'; }
        if (v === 'report') { s.jail.behaviour = clamp(s.jail.behaviour + 5); if (chance(s, 0.4)) { stat(s, 'health', -8); return 'The warder moved him, but his friends beat you later for snitching.'; } return 'The warder moved him to another cell.'; }
        need(s, 'energy', -15); return 'You now sleep near the toilet bucket.';
      },
    },
    'j-extort': {
      jail: true, w: 3,
      build: () => ({ title: '💸 "Cell rent"', text: 'The cell leader says every inmate must pay ₦5,000 "cell rent" this week.', choices: [{ label: 'Pay ₦5,000', value: 'pay' }, { label: 'Refuse', value: 'refuse' }] }),
      resolve(s, v) { if (v === 'pay') { s.money -= 5000; return 'You paid. Peace for now.'; } if (chance(s, 0.5)) { stat(s, 'health', -8); return 'They made your life miserable for days.'; } return 'They let it slide this time.'; },
    },
    'j-jailbreak': {
      jail: true, w: 1,
      build: () => ({ title: '🧱 Jailbreak rumour', text: 'Some inmates are planning a mass escape tonight. They want you in.', choices: [{ label: 'Join the escape', value: 'join' }, { label: 'Report the plan', value: 'report' }, { label: 'Stay out of it', value: 'stay' }] }),
      resolve(s, v) {
        if (v === 'report') { s.jail.behaviour = clamp(s.jail.behaviour + 15); s.jail.daysLeft = Math.max(1, s.jail.daysLeft - 14); return 'The authorities foiled the plan and reduced your sentence by two weeks.'; }
        if (v === 'stay') return 'You kept your head down. The plan failed anyway.';
        if (chance(s, 0.25)) { const left = s.jail.daysLeft; E.releaseFromJail(s, 'You escaped through a broken wall at'); s.heat = 100; s.flags.fugitive = Math.ceil(left / E.DAYS_PER_YEAR); return 'You are a fugitive now. Police will be looking for you.'; }
        s.jail.daysLeft += E.DAYS_PER_YEAR; stat(s, 'health', -15); return 'Warders caught you on the wall. One more year added.';
      },
    },
    'j-visitor': {
      jail: true, w: 2, when: (s) => s.relations.some((r) => r.alive && r.closeness >= 30 && ['mother', 'father', 'sibling', 'spouse', 'partner'].includes(r.role)),
      build(s) {
        const r = pick(s, s.relations.filter((x) => x.alive && x.closeness >= 30 && ['mother', 'father', 'sibling', 'spouse', 'partner'].includes(x.role)));
        return { title: '🧺 Visitor', text: `${r.first} came to visit with food and provisions.`, choices: [{ label: 'Thank them', value: 'ok' }] };
      },
      resolve(s) { need(s, 'hunger', 50); need(s, 'social', 35); stat(s, 'happiness', 6); return 'It felt good to see a familiar face.'; },
    },
    'j-mercy': {
      jail: true, w: 1, when: (s) => s.jail.behaviour >= 75 && s.jail.daysLeft < s.jail.total * 0.7,
      build: () => ({ title: '🕊️ Prerogative of mercy', text: 'The Governor is granting pardons to well-behaved inmates. Your name is on the list!', choices: [{ label: 'Thank God!', value: 'ok' }] }),
      resolve(s) { E.releaseFromJail(s, 'The Governor pardoned you and you walked out of'); return 'You are free!'; },
    },
  });

  // Friends repaying loans, fugitives being found, influencer income.
  onDay((s) => {
    if (s.flags.owed && s.clock.dow === 5) {
      if (chance(s, 0.5)) { s.money += s.flags.owed; E.log(s, `Your friend actually paid back the ${naira(s.flags.owed)} they borrowed!`, 'good'); }
      else E.log(s, 'Friday came. Your friend has stopped picking your calls.', 'bad');
      s.flags.owed = 0;
    }
    if (s.flags.fugitive && !s.jail && s.heat > 0 && chance(s, 0.04)) {
      const yrs = s.flags.fugitive + 2;
      s.flags.fugitive = 0;
      E.arrest(s, 'Police tracked you down for escaping from custody', yrs, false);
    }
    if (s.flags.fugitive && s.heat <= 0) { s.flags.fugitive = 0; E.log(s, 'The police seem to have forgotten about your escape.', 'info'); }
    if (s.flags.influencer && s.clock.dow === 5 && hasPhone(s) && chance(s, 0.5)) {
      const deal = round1k(randInt(s, 20, 300) * 1000 * (1 + s.stats.looks / 100));
      s.money += deal;
      E.log(s, `📸 Brand deal: a company paid you ${naira(deal)} to promote their product.`, 'money');
    }
  });

  return {
    DOW, NEEDS, ACTIONS, timeLabel, dateLabel, hour, dailyPay, weeklyBills,
    passTime, sleep, idle, listActions, doAction, autoStep, fastForward, pickAuto, trip,
    registerActions, registerEncounters, onDay, rollEncounter, need, addGate, onSleep, gateReason, addAutoHook,
  };
});
