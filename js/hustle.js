/*
 * OGS Lifestyle — Hustle Mode: "Eko to the Gateway" (MVP).
 *
 * You arrive in Abeokuta from your village with ₦50,000 and a 1-room
 * self-contain. Each day: wake up → hustle → evening → lifestyle.
 * Three hustles (Adire seller, Okada rider, Influencer), a Sapa meter,
 * TRACE stops, weekly rent with lock-out, Saturday Owambe, calls from
 * family back home, festivals, and Clout + Money = your Level.
 */
(function (root, factory) {
  const E = (root.OGS && root.OGS.Engine) || (typeof require === 'function' ? require('./engine.js') : null);
  const L = (root.OGS && root.OGS.Life) || (typeof require === 'function' ? require('./life.js') : null);
  const D = (root.OGS && root.OGS.Data) || (typeof require === 'function' ? require('./data.js') : null);
  const mod = factory(D, E, L);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Hustle = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, E, L) {
  'use strict';
  const { rand, randInt, chance, pick, clamp, stat, round1k } = E._h;
  const naira = E.naira;
  const need = L.need;
  const r500 = (n) => Math.round(n / 500) * 500;

  const START_CASH = 50000;
  const FOOD_PER_WEEK = 31500; // ~₦1,500 a meal

  // The four zones of the map. Only Abeokuta is open at launch (MVP).
  const ZONES = [
    { id: 'abeokuta', name: 'Abeokuta Zone', theme: 'Capital', unlock: 1, color: '#0b6e4f', lat: 7.16, lng: 3.36, radius: 14000, towns: ['abeokuta', 'odeda', 'owode-egba'], blurb: 'Olumo Rock, Adire Market, Kuto, Panseke.' },
    { id: 'ijebu', name: 'Ijebu Zone', theme: 'Luxury', unlock: 5, color: '#8a5a00', lat: 6.85, lng: 3.97, radius: 17000, towns: ['ijebu-ode', 'ago-iwoye', 'ijebu-igbo', 'odogbolu', 'okun-owa', 'ogbere', 'abigi'], blurb: 'Expensive estates, owambe and big Ijebu money.' },
    { id: 'remo', name: 'Sagamu / Remo Zone', theme: 'Industry', unlock: 7, color: '#23408e', lat: 6.85, lng: 3.6, radius: 15000, towns: ['sagamu', 'ilishan', 'ikenne', 'iperu', 'isara', 'mowe', 'ibafo'], blurb: 'Factories, interstate transport and cement.' },
    { id: 'ota', name: 'Ota / Agbara Zone', theme: 'Hustle', unlock: 9, color: '#c0392b', lat: 6.62, lng: 3.18, radius: 18000, towns: ['ota', 'agbara', 'igbesa', 'ifo', 'itori'], blurb: 'Sango, industrial estates and student life.' },
  ];
  const ZONE_OF = {};
  for (const z of ZONES) for (const t of z.towns) ZONE_OF[t] = z.id;

  const HOUSES = {
    faceme: { name: 'Face-me-I-face-you room, Panseke', weekly: 8000, clout: 0, rest: 0.85, blurb: 'Shared toilet, shared wahala.' },
    selfcon: { name: '1-room self-contain, Kuto', weekly: 14000, clout: 2, rest: 1, blurb: 'Your own room, your own toilet. Small but mighty.' },
    duplex: { name: '4-bedroom duplex, Ibara GRA', weekly: 250000, buy: 85000000, clout: 25, rest: 1, blurb: 'Gate man, generator house and a compound for parties.' },
  };

  const DRIP = [
    { id: 'adire-fit', name: 'Adire outfit', price: 25000, clout: 4, looks: 2 },
    { id: 'anago', name: 'Anago native wear', price: 45000, clout: 5, looks: 2 },
    { id: 'corporate', name: 'Corporate suit', price: 70000, clout: 5, looks: 3 },
    { id: 'aso-oke', name: 'Aso-oke agbada / iro & buba (owambe ready)', price: 90000, clout: 8, looks: 3 },
  ];

  const LEVELS = [
    [0, 'JJC (Johnny Just Come)'], [150000, 'Fresh hustler'], [400000, 'Small boy/babe with sense'], [900000, 'Area hustler'],
    [1800000, 'Street-smart'], [3500000, 'Correct guy/babe'], [7000000, 'Area celebrity'], [14000000, 'Big boy/babe'],
    [28000000, 'Baller'], [55000000, 'Odogwu'], [110000000, 'Chairman'], [250000000, 'Oga at the top'],
    [600000000, 'Gateway mogul'], [1500000000, 'Ogun State legend'],
  ];

  // ---------- state ----------

  function isHustle(s) { return !!s.hustle; }

  // Birth lottery, like Lagos Life: Nepo (connected), LAPO (loan) or Village (₦50k).
  const STARTS = {
    nepo: { label: 'NEPO', emoji: '🤑', desc: '₦500,000 in the bank, a Toyota Corolla, a Branch Manager job and a duplex in Ibara GRA. Daddy knows people.' },
    lapo: { label: 'LAPO', emoji: '😬', desc: '₦60,000 microfinance loan in your pocket. Repay ₦12,000 every Saturday for 6 weeks… or the loan officers come knocking.' },
    village: { label: 'VILLAGE', emoji: '🚌', desc: 'You just arrived from the village with ₦50,000, a Tecno phone and a dream.' },
  };

  function newHustleGame(opts = {}) {
    const village = E.TOWN[opts.village] ? opts.village : 'ogbere';
    const s = E.newGame({ seed: opts.seed, first: opts.first, last: opts.last, gender: opts.gender, town: village, wealth: 'poor' });
    const age = randIntSafe(s, 19, 23);
    s.age = age;
    for (const r of s.relations) r.age += age;
    s.homeTown = village;
    s.town = 'abeokuta';
    if (!s.visited.includes('abeokuta')) s.visited.push('abeokuta');
    s.livingWithParents = false;
    s.money = START_CASH;
    s.auto = false;
    s.stats.smarts = clamp(s.stats.smarts, 30, 80);
    s.edu = { stage: 'out', current: null, history: [{ name: `Community High School, ${E.TOWN[village].name}`, qualification: 'WAEC SSCE', year: s.year - 2 }], highest: 'SSCE', fields: [], waec: { credits: 5, year: s.year - 2 }, jamb: { score: 150, year: s.year - 2 }, effort: 0, nextSchool: null };
    s.assets.push({ uid: 'a' + s.nextId++, id: 'phone-tecno', value: 120000, boughtYear: s.year });
    s.clock = { day: 1, dow: 0, min: 7 * 60 };
    s.hustle = {
      clout: 3, followers: 40, house: 'selfcon', owed: 0, missed: 0, lockedOut: false,
      adire: 0, adireCost: 0, impound: 0, lastEarn: null, adDay: null, drip: [], level: 1,
      houseBuilt: false, festivals: {}, totalEarned: 0,
      start: STARTS[opts.start] ? opts.start : 'village',
      bank: { loan: 0, weekly: 0, savings: 0 },
      inbox: [],
    };
    s.log = [];
    const start = s.hustle.start;
    if (start === 'nepo') {
      s.money = 500000;
      s.hustle.clout = 25; s.hustle.followers = 1200;
      s.hustle.house = 'duplex';
      s.edu.highest = 'BSc'; s.edu.fields = ['finance'];
      s.edu.history.push({ name: 'Covenant University, Ota', qualification: 'BSc Accounting', grade: 'Second Class Upper (3.80)', year: s.year - 1, level: 'BSc', field: 'finance', cgpa: 3.8, instId: 'covenant', courseId: 'accounting' });
      s.nysc = { status: 'done', state: 'Lagos' };
      s.assets.push({ uid: 'a' + s.nextId++, id: 'car-corolla', value: 11000000, boughtYear: s.year });
      E.hire(s, 'banker');
      s.job.level = 2; s.job.title = E.JOB.banker.levels[2]; s.job.salary = 650000; s.job.employer = 'Gateway Bank, Kuto';
      s.log = [];
      E.log(s, `🤑 NEPO BABY! Your uncle "arranged" a ${s.job.title} job at ${s.job.employer}. You have ${naira(s.money)}, a Corolla and a duplex in Ibara GRA.`, 'milestone');
      message(s, 'Uncle Wale', 'I have spoken to the MD. Resume Monday. Don\'t disgrace the family name!');
    } else if (start === 'lapo') {
      s.money = 60000;
      s.hustle.bank = { loan: 72000, weekly: 12000, savings: 0 };
      E.log(s, `😬 LAPO START: you took a ${naira(60000)} microfinance loan. Repay ${naira(12000)} every Saturday (₦72,000 total).`, 'milestone');
      message(s, 'Microfinance Bank', 'Welcome! Your loan of ₦60,000 is disbursed. Weekly repayment: ₦12,000 every Saturday. Thank you for banking with us.');
    } else {
      E.log(s, `🚌 You arrived in Abeokuta from ${E.TOWN[village].name} with ${naira(START_CASH)}, a Tecno phone and a dream. Your goal: become the biggest name in Ogun State.`, 'milestone');
    }
    if (start !== 'nepo') E.log(s, `You rented a ${HOUSES.selfcon.name} — ${naira(HOUSES.selfcon.weekly)} every Saturday, or the landlord locks your door.`, 'info');
    E.log(s, 'Open your 📱 Phone: find work in Jobs, food in ChopNow, rides in GoRide. From sapa to stardom!', 'info');
    message(s, start === 'nepo' ? 'Mummy' : 'Mama', start === 'nepo' ? 'My darling, drive carefully o. Call me when you get to the office.' : 'Hope you reached Abeokuta safely. Remember where you are coming from. God be with you.');
    message(s, 'Landlord', start === 'nepo' ? 'Welcome to Ibara GRA. Rent is due every Saturday. No loud music after 10pm.' : `Welcome. Rent is ${naira(HOUSES.selfcon.weekly)} every Saturday. If you owe 2 weeks I will lock the door.`);
    return s;
  }

  // ---------- phone: messages ----------

  function message(s, from, text) {
    if (!s.hustle) return;
    s.hustle.inbox = s.hustle.inbox || [];
    s.hustle.inbox.push({ from, text, day: dayKey(s), time: s.clock ? s.clock.min : 0, read: false });
    if (s.hustle.inbox.length > 200) s.hustle.inbox.splice(0, s.hustle.inbox.length - 200);
  }
  function unread(s) { return s.hustle && s.hustle.inbox ? s.hustle.inbox.filter((m) => !m.read).length : 0; }
  function markRead(s, from) { for (const m of (s.hustle.inbox || [])) if (!from || m.from === from) m.read = true; }

  // ---------- phone: bank ----------

  function bank(s) { s.hustle.bank = s.hustle.bank || { loan: 0, weekly: 0, savings: 0 }; return s.hustle.bank; }
  function loanLimit(s) { return levelInfo(s).level * 60000; }
  function takeLoan(s, amount) {
    const b = bank(s);
    if (b.loan > 0) return { ok: false, msg: 'Repay your current loan first.' };
    if (amount > loanLimit(s)) return { ok: false, msg: `Your limit is ${naira(loanLimit(s))}. Level up to borrow more.` };
    b.loan = round1k(amount * 1.2); b.weekly = round1k(b.loan / 6);
    s.money += amount;
    message(s, 'Microfinance Bank', `Loan of ${naira(amount)} disbursed. Repay ${naira(b.weekly)} every Saturday (total ${naira(b.loan)}).`);
    E.log(s, `🏦 You took a ${naira(amount)} loan. ${naira(b.weekly)} weekly repayments.`, 'money');
    return { ok: true, msg: 'Loan approved!' };
  }
  function repayLoan(s, amount) {
    const b = bank(s);
    const pay = Math.min(amount, b.loan, Math.max(0, s.money));
    if (pay <= 0) return { ok: false, msg: b.loan ? 'You have no money to repay with.' : 'You have no loan.' };
    s.money -= pay; b.loan -= pay;
    if (b.loan <= 0) { b.loan = 0; b.weekly = 0; message(s, 'Microfinance Bank', 'Congratulations! Your loan is fully repaid.'); }
    return { ok: true, msg: `Repaid ${naira(pay)}.` };
  }
  function deposit(s, amount) {
    const a = Math.min(amount, Math.max(0, s.money));
    if (a <= 0) return { ok: false, msg: 'Nothing to save.' };
    s.money -= a; bank(s).savings += a;
    return { ok: true, msg: `Saved ${naira(a)}. Savings earn 1% weekly interest.` };
  }
  function withdraw(s, amount) {
    const b = bank(s); const a = Math.min(amount, b.savings);
    if (a <= 0) return { ok: false, msg: 'No savings.' };
    b.savings -= a; s.money += a;
    return { ok: true, msg: `Withdrew ${naira(a)}.` };
  }

  // ---------- phone: GoRide & betting & friends ----------

  function rideFare(meters) { return Math.max(800, Math.round((500 + meters * 18) / 100) * 100); }
  function ride(s, meters, placeName) {
    const fare = rideFare(meters);
    if (s.money < fare) return { ok: false, msg: `The ride costs ${naira(fare)}. Trek, or hustle first.` };
    if (s.events.length) return { ok: false, msg: 'Respond to the event first.' };
    s.money -= fare;
    L.passTime(s, Math.max(10, Math.round(meters / 250 * 60 / 10)));
    return { ok: true, msg: `🚕 GoRide dropped you at ${placeName} (${naira(fare)}).` };
  }

  function placeBet(s, stake, odds) {
    if (s.age < 18) return { ok: false, msg: 'You must be 18 to bet.' };
    if (s.money < stake) return { ok: false, msg: `You need ${naira(stake)}.` };
    if (!E._h.oncePerDay(s, 'bet-' + odds)) return { ok: false, msg: 'One ticket per odds per day. Bet responsibly!' };
    s.money -= stake;
    if (chance(s, 0.88 / odds)) {
      const win = round1k(stake * odds);
      s.money += win; need(s, 'fun', 25); addClout(s, 1);
      E.log(s, `🎰 Your ${odds}-odds ticket CAME! You won ${naira(win)}.`, 'money');
      return { ok: true, msg: `🎉 Ticket cut? NO! You won ${naira(win)}!` };
    }
    need(s, 'fun', -8); stat(s, 'happiness', -2);
    return { ok: false, msg: pick(s, ['One game cut your ticket. Chai!', 'Arsenal drew in the 94th minute. Ticket cut.', 'You lost. "Next time" na im dem dey talk.']) };
  }

  function befriend(s, name, gender) {
    if (s.relations.some((r) => r.role === 'friend' && `${r.first}` === name)) return { ok: false, msg: `${name} is already your friend.` };
    if (!E._h.oncePerDay(s, 'befriend-' + name)) return { ok: false, msg: 'Give it some time.' };
    need(s, 'social', 15);
    if (!chance(s, 0.45 + s.hustle.clout / 200 + s.stats.looks / 400)) return { ok: false, msg: `${name} wasn't in the mood to talk.` };
    const p = E._h.newPerson(s, 'friend', gender || pick(s, ['male', 'female']), clamp(s.age + randInt(s, -4, 6), 16, 70), { closeness: 40, town: 'abeokuta' });
    p.first = name;
    s.relations.push(p);
    message(s, name, pick(s, ['Nice meeting you! Save my number 😄', 'Guy/babe, we go dey talk o.', 'Let\'s hang out at Panseke sometime!']));
    return { ok: true, msg: `🤝 You and ${name} are now friends.` };
  }
  function randIntSafe(s, a, b) { return randInt(s, a, b); }

  // Prices move a little every day, the same for everyone that day.
  function dayKey(s) { return s.age * E.DAYS_PER_YEAR + s.clock.day; }
  function priceRoll(s, salt) {
    const x = Math.sin((dayKey(s) + salt * 977 + s.seed % 1000) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }
  function adirePrices(s) {
    return {
      buy: r500(6000 + priceRoll(s, 1) * 2500),
      local: r500(9500 + priceRoll(s, 2) * 3500),
      lagos: r500(15000 + priceRoll(s, 3) * 6000),
    };
  }

  // Weekly brand deal: ~₦15k at 1k followers, ~₦85k at 10k, ~₦2.7M at 1M.
  function brandDeal(s) {
    const h = s.hustle;
    return round1k(15000 * Math.pow(h.followers / 1000, 0.75) * (0.7 + rand(s) * 0.6) * (1 + h.clout / 200));
  }

  function weeklyRent(s) { return s.hustle.ownsHouse === s.hustle.house ? 0 : HOUSES[s.hustle.house].weekly; }

  function sapa(s) {
    const need = weeklyRent(s) + FOOD_PER_WEEK + 15000;
    return clamp(Math.round(100 - (Math.max(0, s.money) / need) * 50));
  }
  const inSapa = (s) => sapa(s) >= 70;

  function score(s) { return E.netWorth(s) + s.hustle.clout * 30000; }
  function levelInfo(s) {
    const sc = score(s);
    let i = 0;
    while (i + 1 < LEVELS.length && sc >= LEVELS[i + 1][0]) i++;
    const next = LEVELS[i + 1];
    return { level: i + 1, title: LEVELS[i][1], score: sc, next: next ? next[0] : null, nextTitle: next ? next[1] : null, progress: next ? (sc - LEVELS[i][0]) / (next[0] - LEVELS[i][0]) : 1 };
  }
  function zoneUnlocked(s, zoneId) {
    const z = ZONES.find((x) => x.id === zoneId);
    return !z || levelInfo(s).level >= z.unlock;
  }
  function addClout(s, n) { s.hustle.clout = clamp(s.hustle.clout + n); }

  function earn(s, amount, source) {
    if (['adire', 'okada', 'influencer'].includes(source)) s.hustle.focus = source;
    s.money += amount;
    s.hustle.totalEarned += Math.max(0, amount);
    if (amount > 0) s.hustle.lastEarn = { amount, day: dayKey(s), source };
  }

  // ---------- gates (sapa, lock-out, zones) ----------

  L.addGate((s, what) => {
    if (!isHustle(s)) return null;
    if (what.type === 'action') {
      if (inSapa(s) && ['club', 'restaurant', 'date'].includes(what.id)) return what.id === 'club' ? 'Sapa: the bouncer looked at your shoes and said no' : 'Sapa no gree you';
      if (s.hustle.lockedOut && ['shower', 'cook', 'relax', 'nap'].includes(what.id)) return 'You are locked out of your room';
      if (what.id === 'home-food' || what.id === 'school' || what.id === 'study') return 'Not in Hustle Mode';
    }
    if (what.type === 'trip') {
      const z = ZONE_OF[what.place.town];
      if (!z) return 'That area opens in a future update';
      if (!zoneUnlocked(s, z)) { const zone = ZONES.find((x) => x.id === z); return `${zone.name} unlocks at level ${zone.unlock}`; }
    }
    return null;
  });

  L.onSleep((s, msg) => {
    if (!isHustle(s)) return msg;
    if (s.hustle.lockedOut) {
      need(s, 'energy', -30);
      need(s, 'hygiene', -30);
      stat(s, 'happiness', -3);
      if (chance(s, 0.15)) { const l = Math.min(Math.max(0, s.money), 5000); s.money -= l; return `Locked out, you slept on a bench at the motor park. Someone stole ${naira(l)} from your pocket.`; }
      return 'Locked out, you slept at a friend\'s shop. Mosquitoes feasted on you.';
    }
    const rest = HOUSES[s.hustle.house].rest;
    if (rest < 1) need(s, 'energy', -100 * (1 - rest));
    return msg;
  });

  // ---------- hustles ----------

  const H = (o) => Object.assign({ group: 'Hustle', cost: 0, minAge: 16, hidden: (s) => !isHustle(s) }, o);
  const hourNow = (s) => L.hour(s);

  L.registerActions([
    // --- Adire seller ---
    H({ id: 'adire-buy', icon: '🧵', name: 'Buy 5 adire at Itoku market', hours: 2, hustle: 'adire',
      label: (s) => `Buy 5 adire at Itoku (${naira(adirePrices(s).buy * 5)})`,
      can: (s) => (s.money < adirePrices(s).buy * 5 ? `Need ${naira(adirePrices(s).buy * 5)}` : null),
      run: (s) => {
        const p = adirePrices(s).buy;
        const h = s.hustle;
        h.adireCost = Math.round((h.adireCost * h.adire + p * 5) / (h.adire + 5));
        h.adire += 5;
        h.focus = 'adire';
        s.money -= p * 5;
        return `You haggled with the dyers at Itoku and bought 5 pieces at ${naira(p)} each. Stock: ${h.adire}.`;
      } }),
    H({ id: 'adire-local', icon: '🛍️', name: 'Sell adire around Kuto & Panseke', hours: 5, hustle: 'adire',
      can: (s) => (s.hustle.adire < 1 ? 'No adire in stock' : null),
      run: (s) => {
        const h = s.hustle;
        const p = adirePrices(s).local;
        const sold = Math.min(h.adire, randInt(s, 1, 3) + Math.floor(h.clout / 25) + (h.drip.includes('adire-fit') ? 1 : 0));
        h.adire -= sold;
        earn(s, sold * p, 'adire');
        addClout(s, sold >= 3 ? 1 : 0);
        need(s, 'social', 15);
        return sold ? `You sold ${sold} piece(s) at ${naira(p)} — ${naira(sold * p)}. Stock left: ${h.adire}.` : 'Market was dry today. Nobody bought.';
      } }),
    H({ id: 'adire-lagos', icon: '🚌', name: 'Carry adire to Lagos (Balogun market)', hours: 10, hustle: 'adire',
      can: (s) => (s.hustle.adire < 5 ? 'Need at least 5 pieces in stock' : hourNow(s) > 9 ? 'Leave before 9am to beat Lagos traffic' : s.money < 8000 ? 'Need ₦8,000 for transport' : null),
      run: (s) => {
        const h = s.hustle;
        const p = adirePrices(s).lagos;
        s.money -= 8000;
        const sold = Math.min(h.adire, randInt(s, 4, 9) + Math.floor(h.clout / 20));
        h.adire -= sold;
        earn(s, sold * p - 8000, 'adire');
        need(s, 'energy', -20);
        addClout(s, 1);
        if (chance(s, 0.25)) E.queueEvent(s, 'trace-stop', { ctx: 'lagos' });
        return `Lagos buyers paid ${naira(p)} per piece. You sold ${sold} for ${naira(sold * p)} (minus ₦8,000 transport). Stock left: ${h.adire}.`;
      } }),

    // --- Okada rider ---
    H({ id: 'okada-ride', icon: '🛵', name: 'Ride okada (5-hour shift)', hours: 5, hustle: 'okada',
      label: (s) => (E.hasAssetKind(s, 'motorbike') ? 'Ride your own okada (5h shift)' : 'Ride a hired okada (₦3,000 balance)'),
      can: (s) => (s.hustle.impound > 0 ? `TRACE impounded the bike (${s.hustle.impound} day(s) left)` : hourNow(s) >= 21 ? 'Too dark — robbers operate at night' : null),
      run: (s) => {
        const own = E.hasAssetKind(s, 'motorbike');
        const rush = [6, 7, 8, 16, 17, 18].includes(hourNow(s));
        let gross = round1k(randInt(s, 7, 15) * 1000 * (rush ? 1.3 : 1));
        const fuel = 2000;
        const balance = own ? 0 : 3000;
        const net = gross - fuel - balance;
        earn(s, net, 'okada');
        need(s, 'energy', -15);
        need(s, 'hygiene', -20);
        let msg = `You carried passengers ${rush ? 'in rush hour ' : ''}and made ${naira(gross)} (fuel ₦2,000${own ? '' : ', bike owner\'s balance ₦3,000'}). Net: ${naira(net)}.`;
        if (chance(s, 0.04)) { stat(s, 'health', -randInt(s, 8, 20)); msg += ' A pothole threw you off the bike — you are hurt.'; }
        if (chance(s, 0.22)) E.queueEvent(s, 'trace-stop', { ctx: 'okada' });
        return msg;
      } }),

    // --- Influencer ---
    H({ id: 'content-olumo', icon: '🎥', name: 'Shoot content at Olumo Rock', hours: 3, cost: 3000, hustle: 'influencer',
      can: (s) => (!E.hasAssetKind(s, 'phone') ? 'You need a phone' : null),
      run: (s) => postContent(s, 1.6, 'You climbed Olumo Rock and shot a fire video with Abeokuta behind you.') }),
    H({ id: 'content-skit', icon: '🤳', name: 'Shoot a skit in your area', hours: 2, hustle: 'influencer',
      can: (s) => (!E.hasAssetKind(s, 'phone') ? 'You need a phone' : null),
      run: (s) => postContent(s, 1, pick(s, ['Your skit about landlords had everyone laughing.', 'You shot a "Naija mums" skit with your neighbour.', 'You did a street interview at Kuto: "How much is your rent?"'])) }),
    H({ id: 'content-adire', icon: '👗', name: 'Model & sell adire online', hours: 2, hustle: 'influencer',
      can: (s) => (!E.hasAssetKind(s, 'phone') ? 'You need a phone' : s.hustle.adire < 1 ? 'No adire in stock' : null),
      run: (s) => {
        const h = s.hustle;
        const sold = Math.min(h.adire, 1 + Math.floor(h.followers / 2500));
        const p = adirePrices(s).lagos;
        h.adire -= sold;
        earn(s, sold * p, 'adire');
        return postContent(s, 0.7, `You modelled adire on TikTok and sold ${sold} piece(s) online at ${naira(p)}.`);
      } }),
  ]);

  // Auto-routine: do your main hustle once a day in working hours.
  L.addAutoHook((s, ok, h) => {
    if (!isHustle(s) || s.dayActs.autoHustle || h < 7 || h > 14) return null;
    const f = s.hustle.focus;
    const plan = f === 'okada' ? ['okada-ride'] : f === 'influencer' ? ['content-skit'] : f === 'adire' ? (s.hustle.adire < 1 ? ['adire-buy'] : ['adire-local']) : [];
    for (const id of plan) if (ok(id)) { s.dayActs.autoHustle = true; return id; }
    return null;
  });

  function postContent(s, mult, intro) {
    const h = s.hustle;
    h.focus = 'influencer';
    // Growth has diminishing returns so big accounts don't snowball forever.
    let gain = Math.round((15 + Math.sqrt(h.followers) * 3) * mult * (0.5 + rand(s)) * (1 + s.stats.looks / 150));
    let msg = intro;
    if (chance(s, 0.04 + h.clout / 1000)) { gain += 1500 + Math.round(Math.sqrt(h.followers) * 40); msg += ' 🔥 IT WENT VIRAL!'; addClout(s, 4); }
    h.followers += gain;
    addClout(s, gain > 200 ? 1 : 0);
    need(s, 'fun', 10);
    return `${msg} +${gain.toLocaleString('en-US')} followers (${h.followers.toLocaleString('en-US')} total).`;
  }

  // Watch an ad to double the last hustle income (once a day).
  function canDouble(s) {
    const h = s.hustle;
    if (!h || !h.lastEarn || h.lastEarn.day !== dayKey(s) || h.lastEarn.amount <= 0) return 'Do a hustle first today';
    if (h.adDay === dayKey(s)) return 'Already doubled today';
    return null;
  }
  function doubleLast(s) {
    const why = canDouble(s);
    if (why) return { ok: false, msg: why };
    s.hustle.adDay = dayKey(s);
    earn(s, s.hustle.lastEarn.amount, 'ad');
    return { ok: true, msg: `Ad bonus: +${naira(s.hustle.lastEarn.amount)}!` };
  }

  // ---------- lifestyle ----------

  L.registerActions([
    { id: 'ofada', group: 'Food & rest', icon: '🍛', name: 'Ofada rice & ayamase', hours: 1, cost: 3500, minAge: 6, run: (s) => { need(s, 'hunger', 60); need(s, 'fun', 5); return 'Ofada rice with green ayamase stew. Peppery and perfect.'; } },
    { id: 'lafun', group: 'Food & rest', icon: '🥣', name: 'Lafun & ewedu', hours: 0.5, cost: 1500, minAge: 6, run: (s) => { need(s, 'hunger', 45); return 'Soft lafun with ewedu and stew. Egba classic.'; } },
    { id: 'ikokore', group: 'Food & rest', icon: '🍲', name: 'Ikokore (Ijebu water-yam pottage)', hours: 0.5, cost: 2500, minAge: 6, run: (s) => { need(s, 'hunger', 55); return 'Ikokore with smoked fish. Taste of home.'; } },
  ]);

  function buyDrip(s, id) {
    const d = DRIP.find((x) => x.id === id);
    if (!d) return { ok: false, msg: 'Unknown item.' };
    if (s.hustle.drip.includes(id)) return { ok: false, msg: 'You already own it.' };
    if (s.money < d.price) return { ok: false, msg: `Need ${naira(d.price)}.` };
    s.money -= d.price;
    s.hustle.drip.push(id);
    addClout(s, d.clout);
    stat(s, 'looks', d.looks);
    E.log(s, `👔 You bought ${d.name} (${naira(d.price)}). Clout +${d.clout}.`, 'good');
    return { ok: true, msg: `Dripping in ${d.name}!` };
  }

  function moveHouse(s, id) {
    const hs = HOUSES[id];
    const h = s.hustle;
    if (!hs) return { ok: false, msg: 'Unknown house.' };
    if (h.house === id && !h.lockedOut) return { ok: false, msg: 'You already live there.' };
    const upfront = hs.weekly * 3 + h.owed; // first week + agent/caution fee + any arrears
    if (s.money < upfront) return { ok: false, msg: `Need ${naira(upfront)} (first week, agent & caution fee${h.owed ? ', plus arrears' : ''}).` };
    s.money -= upfront;
    addClout(s, hs.clout - HOUSES[h.house].clout);
    h.house = id; h.owed = 0; h.missed = 0; h.lockedOut = false;
    E.log(s, `🏠 You moved into a ${hs.name}. Paid ${naira(upfront)} upfront.`, 'milestone');
    return { ok: true, msg: `Welcome to your ${hs.name}!` };
  }

  function buyHouse(s, id) {
    const hs = HOUSES[id];
    if (!hs || !hs.buy) return { ok: false, msg: 'Not for sale.' };
    if (s.money < hs.buy) return { ok: false, msg: `Need ${naira(hs.buy)}.` };
    s.money -= hs.buy;
    const h = s.hustle;
    addClout(s, hs.clout - HOUSES[h.house].clout + 5);
    h.house = id; h.ownsHouse = id; h.owed = 0; h.missed = 0; h.lockedOut = false;
    s.assets.push({ uid: 'a' + s.nextId++, id: 'house-abk', value: hs.buy, boughtYear: s.year, living: true });
    E.log(s, `🏰 You BOUGHT the ${hs.name} for ${naira(hs.buy)}. No more landlord!`, 'milestone');
    return { ok: true, msg: 'You are now a landlord yourself!' };
  }

  function payArrears(s) {
    const h = s.hustle;
    if (!h.owed) return { ok: false, msg: 'You owe nothing.' };
    if (s.money < h.owed) return { ok: false, msg: `You owe ${naira(h.owed)}.` };
    s.money -= h.owed;
    E.log(s, `You cleared ${naira(h.owed)} rent arrears.${h.lockedOut ? ' The landlord unlocked your door.' : ''}`, 'good');
    h.owed = 0; h.missed = 0; h.lockedOut = false;
    return { ok: true, msg: 'Rent cleared!' };
  }

  function buildHouse(s) {
    const h = s.hustle;
    if (h.houseBuilt) return { ok: false, msg: 'You already built your house.' };
    const land = s.assets.find((a) => E.ASSET[a.id].kind === 'land');
    if (!land) return { ok: false, msg: 'Buy land first (e.g. in Obafemi-Owode).' };
    if (s.money < 10000000) return { ok: false, msg: 'Building costs ₦10,000,000.' };
    s.money -= 10000000;
    h.houseBuilt = true;
    land.value += 14000000;
    addClout(s, 15);
    stat(s, 'happiness', 20);
    for (const r of s.relations) if (r.alive && ['mother', 'father'].includes(r.role)) r.closeness = clamp(r.closeness + 30);
    E.log(s, '🏗️ YOU BUILT YOUR OWN HOUSE! Your parents are telling the whole village.', 'milestone');
    return { ok: true, msg: 'House built! Mama is crying tears of joy.' };
  }

  // Asset purchases count for clout in Hustle Mode.
  function buyAsset(s, id) {
    const r = E.buyAsset(s, id);
    if (r.ok && isHustle(s) && E.ASSET[id].clout) addClout(s, E.ASSET[id].clout);
    return r;
  }

  // ---------- weekly & daily rhythm ----------

  L.onDay((s) => {
    if (!isHustle(s) || s.jail) return;
    const h = s.hustle;
    if (h.impound > 0) h.impound--;
    if (inSapa(s)) stat(s, 'happiness', -1);

    // Saturday: rent day, brand deals, owambe, loan repayments.
    if (s.clock.dow === 5) {
      const b = bank(s);
      if (b.savings > 0) b.savings = Math.round(b.savings * 1.01);
      if (b.loan > 0) {
        const due = Math.min(b.weekly, b.loan);
        if (s.money >= due) {
          s.money -= due; b.loan -= due;
          message(s, 'Microfinance Bank', `Repayment of ${naira(due)} received. Balance: ${naira(b.loan)}.`);
          if (b.loan <= 0) { b.loan = 0; b.weekly = 0; message(s, 'Microfinance Bank', 'Your loan is fully repaid. You can borrow again!'); }
        } else {
          b.loan = round1k(b.loan * 1.1); addClout(s, -2); stat(s, 'happiness', -6);
          message(s, 'Microfinance Bank', `You missed your ${naira(due)} repayment. 10% penalty added. Our officers will visit your area.`);
          E.log(s, '🏦 Loan officers came to your area asking for you. Everybody saw. Shame!', 'bad');
        }
      }
      const rent = weeklyRent(s);
      if (rent) {
        if (s.money >= rent + h.owed) {
          s.money -= rent + h.owed;
          E.log(s, `🏠 Paid ${naira(rent + h.owed)} rent for your ${HOUSES[h.house].name}.`, 'money');
          message(s, 'Landlord', `Received ${naira(rent + h.owed)}. Thank you.`);
          h.owed = 0; h.missed = 0;
        } else {
          h.owed += rent; h.missed++;
          if (h.missed === 1) { E.log(s, `🔐 Landlord: "Pay your ${naira(h.owed)} by next Saturday or I go lock your door!"`, 'bad'); message(s, 'Landlord', `Where is my rent? You owe ${naira(h.owed)}. Next Saturday I lock the door.`); }
          else if (!h.lockedOut) { h.lockedOut = true; addClout(s, -3); E.log(s, `🔒 LOCKED OUT! You owe ${naira(h.owed)}. Pay the arrears in 📱 Phone → Houses.`, 'bad'); message(s, 'Landlord', 'I have locked your door. Bring my money.'); }
        }
      }
      if (h.followers >= 1000 && E.hasAssetKind(s, 'phone')) {
        const deal = brandDeal(s);
        earn(s, deal, 'deal');
        E.log(s, `📸 Brand deal: a business paid you ${naira(deal)} to promote them to your ${h.followers.toLocaleString('en-US')} followers.`, 'money');
        message(s, 'Brand Deals', `Payment of ${naira(deal)} sent for this week's promo post. Keep the content coming! 🔥`);
      }
      E.queueEvent(s, 'owambe-sat');
    }
    // Friends gist in the group chat now and then.
    if (chance(s, 0.25)) {
      const friends = s.relations.filter((r) => r.alive && r.role === 'friend');
      const who = friends.length ? pick(s, friends).first : pick(s, ['Tunde (Area)', 'Bisi (Kuto)', 'Emeka (POS)']);
      message(s, who, pick(s, ['Owambe dey this Saturday o, you dey come?', 'NEPA don take light for our area again 😩', 'Bro abeg borrow me 2k till Friday', 'Adire price don go up for Itoku', 'TRACE dey Kuto junction now, take another road!', 'Who wan watch Arsenal match for viewing centre?', 'Mama put for Panseke get new ofada, e sweet die!']));
    }
    // Sunday: family calls from the village.
    if (s.clock.dow === 6 && chance(s, 0.6) && s.relations.some((r) => r.alive && ['mother', 'father'].includes(r.role))) E.queueEvent(s, 'family-call');
    // Sapa + partner = billing.
    if (inSapa(s) && E.partner(s) && chance(s, 0.12)) E.queueEvent(s, 'billing');
    // Festivals on fixed days of the year.
    const key = s.year;
    if (s.clock.day === 9 && h.festivals.egungun !== key) { h.festivals.egungun = key; E.queueEvent(s, 'egungun'); }
    if (s.clock.day === 20 && h.festivals.ojude !== key) { h.festivals.ojude = key; E.queueEvent(s, 'ojude-mission'); }
    // Level ups
    const lv = levelInfo(s).level;
    if (lv > h.level) {
      h.level = lv;
      E.log(s, `⭐ LEVEL UP! You are now level ${lv}: ${levelInfo(s).title}.`, 'milestone');
      message(s, 'OGS Lifestyle', `⭐ Level ${lv}: ${levelInfo(s).title}. Your loan limit is now ${naira(loanLimit(s))}.`);
      for (const z of ZONES) if (z.unlock === lv) E.log(s, `🗺️ ${z.name} (${z.theme}) is now unlocked!`, 'milestone');
    }
  });

  // ---------- events ----------

  E.registerEvents({
    'trace-stop': {
      build(s, d) {
        const who = d.ctx === 'lagos' ? 'LASTMA officers flagged down your bus on the Lagos side' : 'TRACE officers flagged you down';
        const choices = [{ label: 'Bribe ₦3,000 "for water"', value: 'bribe' }];
        if (d.ctx === 'okada') choices.push({ label: 'Run!', value: 'run' });
        choices.push({ label: d.ctx === 'okada' ? 'Accept the ticket (₦15,000 fine)' : 'Wait while they "check papers" (2 hours)', value: 'comply' });
        return { title: d.ctx === 'lagos' ? '🚦 LASTMA wahala' : '🚦 TRACE stop', text: `${who}: "Where your papers? You no wear helmet? Come down!"`, choices };
      },
      resolve(s, v, d) {
        if (v === 'bribe') { s.money -= 3000; s.karma = clamp(s.karma - 1); return 'They collected the money and waved you on.'; }
        if (v === 'run') {
          if (chance(s, 0.55)) { s.heat = clamp(s.heat + 8); addClout(s, 1); return 'You swerved through a side street and escaped. The boys at the junction hailed you.'; }
          s.hustle.impound = 3; s.money -= 25000; stat(s, 'health', -5);
          return 'They caught you, seized the bike for 3 days and fined you ₦25,000.';
        }
        if (d.ctx === 'okada') {
          s.money -= 15000;
          if (!E.hasAssetKind(s, 'motorbike') && chance(s, 0.4)) { s.hustle.impound = 3; return 'You paid the ₦15,000 fine, and the hired bike had no papers — impounded for 3 days.'; }
          return 'You paid the ₦15,000 fine at the TRACE office.';
        }
        L.passTime(s, 120); return 'They held the bus for 2 hours, then let everyone go.';
      },
    },
    'owambe-sat': {
      build(s) {
        const host = pick(s, ['Alhaji Bello\'s 60th birthday', 'a big Ijebu wedding at the event centre', 'Chief Mrs Adebanjo\'s house-warming', 'a naming ceremony in Ibara GRA', 'a funeral party (90 years well spent)']);
        const ch = [];
        for (const amt of [10000, 50000, 200000, 1000000]) if (s.money >= amt) ch.push({ label: `Go and spray ${naira(amt)}`, value: 'spray:' + amt });
        ch.push({ label: 'Go and just chop & dance', value: 'chop' }, { label: 'Skip it (lose clout)', value: 'skip' });
        return { title: '🎉 Saturday Owambe', text: `It's Saturday! There's ${host} today. Big men and madams will be there.${s.hustle.drip.includes('aso-oke') ? '' : ' (You don\'t have aso-oke — you won\'t look the part.)'}`, choices: ch };
      },
      resolve(s, v) {
        const h = s.hustle;
        if (v === 'skip') { addClout(s, -2); return 'You stayed home. People noticed you were absent.'; }
        L.passTime(s, 300);
        need(s, 'hunger', 70); need(s, 'fun', 35); need(s, 'social', 35); need(s, 'energy', -15);
        const dressed = h.drip.includes('aso-oke') ? 1 : 0.5;
        if (v === 'chop') { addClout(s, Math.round(1 * dressed)); return 'Jollof, small chops and asun. You danced to Saheed Osupa. Great vibes.'; }
        const amt = +v.split(':')[1];
        s.money -= amt;
        const gain = Math.max(1, Math.round(Math.log10(amt / 5000) * 5 * dressed));
        addClout(s, gain);
        h.followers += Math.round(amt / 200);
        // Networking: big contracts come to people who spray.
        const p = Math.min(0.6, 0.1 + amt / 1000000 + h.clout / 300);
        if (chance(s, p)) {
          if (h.adire >= 5) { const n = h.adire; const price = adirePrices(s).lagos + 5000; h.adire = 0; earn(s, n * price, 'contract'); return `You sprayed ${naira(amt)} and a madam ordered ALL your adire for her family's aso-ebi: ${n} pieces × ${naira(price)} = ${naira(n * price)}! Clout +${gain}.`; }
          const deal = round1k(amt * (1.5 + rand(s) * 2) + Math.min(h.followers, 100000));
          earn(s, deal, 'contract');
          return `You sprayed ${naira(amt)} and a big man gave you a supply contract worth ${naira(deal)}! Clout +${gain}.`;
        }
        return `Money rained! You sprayed ${naira(amt)} and the MC hailed your name. Clout +${gain}.`;
      },
    },
    'family-call': {
      build(s) {
        const p = pick(s, s.relations.filter((r) => r.alive && ['mother', 'father'].includes(r.role)));
        const line = s.hustle.houseBuilt ? '"We are so proud of you! The whole village is talking about your house. Just send small thing for upkeep."' : pick(s, ['"When will you build house? Your mate Tunde has finished his own!"', '"Remember where you are coming from. Send something home."', '"Your father\'s roof is leaking. We need money for zinc."', '"Are you even alive? You have not called for weeks!"']);
        const ch = [];
        for (const amt of [5000, 20000, 100000]) if (s.money >= amt) ch.push({ label: `Send ${naira(amt)}`, value: p.id + ':' + amt });
        ch.push({ label: 'Promise to send next month', value: p.id + ':promise' }, { label: 'Don\'t pick the call', value: p.id + ':ignore' });
        return { title: `📞 ${p.role === 'mother' ? 'Mama' : 'Papa'} is calling from ${E.TOWN[s.homeTown].name}`, text: line, choices: ch };
      },
      resolve(s, v) {
        const [id, what] = v.split(':');
        const p = E._h.relation(s, id);
        if (what === 'ignore') { stat(s, 'happiness', -5); if (p) p.closeness = clamp(p.closeness - 8); return 'Guilt is eating you. Morale down.'; }
        if (what === 'promise') { stat(s, 'happiness', -2); if (p) p.closeness = clamp(p.closeness - 2); return '"Hmm. We are waiting o." Morale down a little.'; }
        const amt = +what;
        s.money -= amt;
        stat(s, 'happiness', amt >= 20000 ? 6 : 3);
        if (p) p.closeness = clamp(p.closeness + Math.round(amt / 5000));
        s.karma = clamp(s.karma + 2);
        return `You sent ${naira(amt)}. They prayed for you on the phone for 10 minutes. Morale up!`;
      },
    },
    billing: {
      build(s) {
        const p = E.partner(s);
        return { title: '💅 You dey get billed', text: `${p.first}: "Babe/bae, I need ₦20,000 for hair and data. You know say I love you?"`, choices: [{ label: 'Send ₦20,000', value: 'pay' }, { label: '"Network is bad"', value: 'excuse' }, { label: 'Tell them about Sapa', value: 'truth' }] };
      },
      resolve(s, v) {
        const p = E.partner(s);
        if (!p) return '';
        if (v === 'pay') { s.money -= 20000; p.closeness = clamp(p.closeness + 6); return 'You sent it. Love is sweet, sapa is sweeter.'; }
        if (v === 'excuse') { p.closeness = clamp(p.closeness - 10); return '"Network is bad abi?" They blue-ticked you for 3 days.'; }
        if (chance(s, p.closeness / 120)) { p.closeness = clamp(p.closeness + 5); return 'They understood and even sent you ₦2,000 for food. Keeper!'; }
        p.role = 'ex'; stat(s, 'happiness', -10); return 'They said "I can\'t date a broke person" and left.';
      },
    },
    egungun: {
      build: () => ({ title: '👺 Egungun festival', text: 'The Egungun masquerades are out in Abeokuta! Drummers everywhere and one masquerade is chasing young people with a whip.', choices: [{ label: 'Join the crowd and watch', value: 'watch' }, { label: 'Tease the masquerade and run', value: 'run' }, { label: 'Give ₦1,000 for blessings', value: 'bless' }] }),
      resolve(s, v) {
        L.passTime(s, 120);
        if (v === 'bless') { s.money -= 1000; s.karma = clamp(s.karma + 2); need(s, 'fun', 15); return 'The Egungun prayed for you. You feel lucky.'; }
        if (v === 'run') { need(s, 'energy', -20); need(s, 'fun', 35); if (chance(s, 0.35)) { stat(s, 'health', -5); return 'The whip caught your back! Everyone laughed — great content though.'; } addClout(s, 1); s.hustle.followers += 50; return 'You outran the masquerade. Your video of the chase got views!'; }
        need(s, 'fun', 25); need(s, 'social', 15); return 'Drums, dance and colour. Culture!';
      },
    },
    'ojude-mission': {
      build(s) {
        const ch = [];
        if (s.hustle.adire >= 5) ch.push({ label: `Special mission: take your ${s.hustle.adire} adire to Ijebu-Ode for the Ojude Oba crowd`, value: 'sell' });
        ch.push({ label: 'Go and watch the parade (₦5,000 transport)', value: 'watch' }, { label: 'Stay in Abeokuta', value: 'stay' });
        return { title: '🐎 Ojude Oba festival (Ijebu-Ode)', text: 'The Ojude Oba festival is today! Age grades in matching outfits, horse riders and the richest Ijebu families are all in Ijebu-Ode.', choices: ch };
      },
      resolve(s, v) {
        if (v === 'stay') return 'You stayed in Abeokuta and watched it on Instagram.';
        s.money -= 5000;
        L.passTime(s, 10 * 60);
        need(s, 'fun', 40); need(s, 'social', 30); need(s, 'energy', -25);
        if (v === 'sell') {
          const h = s.hustle; const n = h.adire; const price = r500(22000 + rand(s) * 8000);
          h.adire = 0; earn(s, n * price, 'adire'); addClout(s, 4);
          return `The age grades bought everything! ${n} pieces at ${naira(price)} = ${naira(n * price)}. Clout +4.`;
        }
        addClout(s, 2); s.hustle.followers += 200; return 'Your Ojude Oba photos blew up online. Clout +2.';
      },
    },
  });

  return {
    START_CASH, ZONES, ZONE_OF, HOUSES, DRIP, LEVELS, STARTS,
    message, unread, markRead, bank, loanLimit, takeLoan, repayLoan, deposit, withdraw, rideFare, ride, placeBet, befriend,
    isHustle, newHustleGame, adirePrices, weeklyRent, sapa, inSapa, levelInfo, zoneUnlocked, score,
    canDouble, doubleLast, buyDrip, moveHouse, buyHouse, payArrears, buildHouse, buyAsset, dayKey,
  };
});
