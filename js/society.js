/*
 * OGS Lifestyle — society: street crime, police, courts, prison life,
 * family connections and politics (parties, primaries, elections, office).
 */
(function (root, factory) {
  const E = (root.OGS && root.OGS.Engine) || (typeof require === 'function' ? require('./engine.js') : null);
  const L = (root.OGS && root.OGS.Life) || (typeof require === 'function' ? require('./life.js') : null);
  const D = (root.OGS && root.OGS.Data) || (typeof require === 'function' ? require('./data.js') : null);
  const mod = factory(D, E, L);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  root.OGS = root.OGS || {};
  root.OGS.Society = mod;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D, E, L) {
  'use strict';
  const { rand, randInt, chance, pick, clamp, stat, round1k } = E._h;
  const naira = E.naira;
  const need = L.need;
  const OFFICE = Object.fromEntries(D.OFFICES.map((o) => [o.id, o]));
  const PARTY = Object.fromEntries(D.PARTIES.map((p) => [p.id, p]));

  const hasPhone = (s) => s.assets.some((a) => E.ASSET[a.id].kind === 'phone');
  const politicianParent = (s) => s.family.politician && s.relations.find((r) => r.role === s.family.politician.role && r.alive);
  const parentWord = (s) => (s.family.politician && s.family.politician.role === 'mother' ? 'Mummy' : 'Daddy');
  const halfYears = (y) => Math.max(0.5, Math.round(y * 2) / 2);

  // ---------- crime ----------

  function crimeOdds(s, c) {
    let p = c.risk * (1 + (s.heat || 0) / 100) - (s.stats.smarts - 50) / 400;
    if (s.flags.areaFriends) p *= 0.8;
    if (s.crimes.done < 3) p *= 1.2; // amateurs get caught
    return clamp(p, 0.03, 0.9);
  }

  L.registerActions(D.CRIMES.map((c) => ({
    id: 'crime-' + c.id, group: 'Street', icon: '🦹', name: c.name, hours: c.hours, cost: 0, minAge: c.minAge, crime: c.id,
    can: (s) => {
      if (c.needsPhone && !hasPhone(s)) return 'You need a smartphone';
      if (c.needsJob && !s.job) return 'You need a job to embezzle from';
      if (c.night && L.hour(s) < 20 && L.hour(s) >= 4) return 'Only at night (after 8pm)';
      return null;
    },
    run: (s) => commitCrime(s, c),
  })));

  function commitCrime(s, c) {
    s.karma = clamp(s.karma + c.karma);
    s.crimes.done++;
    if (chance(s, crimeOdds(s, c))) {
      s.crimes.caught++;
      const yrs = [halfYears(c.years[0]), halfYears(c.years[1])];
      E.log(s, `🚔 Caught! You were arrested for: ${c.name.toLowerCase()}.`, 'bad');
      E.queueEvent(s, 'arrest', { charge: c.name.toLowerCase(), years: yrs, bribe: round1k(Math.max(30000, yrs[0] * 250000)) });
      return 'The police caught you red-handed!';
    }
    let reward = c.id === 'embezzle' ? round1k(s.job.salary * randInt(s, 2, 10)) : round1k(randInt(s, c.reward[0], c.reward[1]));
    if (c.id === 'scam' && chance(s, 0.4)) reward = 0;
    s.money += reward;
    s.heat = clamp((s.heat || 0) + c.heat);
    need(s, 'energy', -10);
    let msg = reward ? `You got away with it and made ${naira(reward)}.` : 'You wasted the whole day. Nobody fell for it.';
    if (c.injury && chance(s, c.injury)) { stat(s, 'health', -randInt(s, 10, 25)); msg += ' You got injured in the process.'; }
    if (c.id === 'embezzle' && s.job) s.job.perf = clamp(s.job.perf - 5);
    if (reward >= 1000000) E.log(s, `💰 Your "operation" (${c.name.toLowerCase()}) brought in ${naira(reward)}.`, 'money');
    return msg;
  }

  // ---------- police & court ----------

  E.registerEvents({
    arrest: {
      build(s, d) {
        const choices = [{ label: `"Settle" the officers (${naira(d.bribe)})`, value: 'bribe' }];
        if (politicianParent(s)) choices.push({ label: `📞 Call ${parentWord(s)} (${s.family.politician.title})`, value: 'connect' });
        choices.push({ label: 'Hire a good lawyer (₦500,000)', value: 'lawyer' }, { label: 'Take a legal aid lawyer (free)', value: 'legalaid' }, { label: 'Make a run for it!', value: 'run' });
        return { title: '🚔 Arrested!', text: `You are in a police cell, charged with ${d.charge}. The officers are hinting that "this matter can be settled".`, choices };
      },
      resolve(s, v, d) {
        const court = (lawyer, extra = 0) => { E.queueEvent(s, 'court', { ...d, lawyer, years: [d.years[0] + extra, d.years[1] + extra] }); };
        if (v === 'bribe') {
          if (s.money < d.bribe) { court(false); return 'You could not raise the money. You were charged to court.'; }
          s.money -= d.bribe;
          if (chance(s, clamp(0.8 - d.years[0] * 0.05, 0.15, 0.8))) { s.heat = Math.max(0, s.heat - 30); s.karma = clamp(s.karma - 2); return 'The money changed hands. Your case file "got lost". You are free.'; }
          court(false); return 'They took your money and STILL charged you to court.';
        }
        if (v === 'connect') {
          if (chance(s, 0.85)) { s.heat = Math.max(0, s.heat - 40); const p = politicianParent(s); if (p) p.closeness = clamp(p.closeness - 10); return `One phone call from ${parentWord(s)} and the DPO personally released you with apologies.`; }
          court(true); return `Even ${parentWord(s)} could not kill this one. The media got wind of it. At least you got a top lawyer.`;
        }
        if (v === 'lawyer') {
          if (s.money < 500000) { court(false); return 'You could not afford a private lawyer. Legal aid it is.'; }
          s.money -= 500000; court(true); return 'You hired a sharp lawyer from Abeokuta.';
        }
        if (v === 'legalaid') { court(false); return 'You were assigned an overworked legal aid lawyer.'; }
        if (chance(s, 0.3)) { s.heat = 100; s.flags.fugitive = Math.ceil(d.years[0]); return 'You slipped out of the station and ran! You are now a fugitive.'; }
        stat(s, 'health', -15); court(false, 1); return 'They caught you before the gate and beat you. Extra charge: attempted escape.';
      },
    },
    court: {
      build(s, d) {
        return {
          title: '⚖️ In court',
          text: `Charge: ${d.charge}. Possible sentence: ${d.years[0]}–${d.years[1]} years. Your ${d.lawyer ? 'lawyer' : 'legal aid lawyer'} is ready. The magistrate asks for your plea.`,
          choices: [
            { label: 'Plead guilty and beg for mercy', value: 'guilty' },
            { label: 'Plead not guilty and fight it', value: 'fight' },
            { label: `Bribe the judge (${naira(d.bribe * 3)})`, value: 'bribe' },
          ],
        };
      },
      resolve(s, v, d) {
        let years;
        if (v === 'guilty') years = halfYears(d.years[0] * 0.7);
        else if (v === 'bribe') {
          if (s.money >= d.bribe * 3 && chance(s, 0.4)) { s.money -= d.bribe * 3; s.heat = 0; return 'The judge struck out the case for "lack of diligent prosecution". You walked free.'; }
          if (s.money >= d.bribe * 3) s.money -= d.bribe * 3;
          years = halfYears(d.years[1] + 2);
          E.log(s, 'The judge reported your bribe attempt. Contempt of court added to your sentence.', 'bad');
        } else {
          const p = (d.lawyer ? 0.45 : 0.18) + (s.stats.smarts - 50) / 250 + (s.karma - 50) / 300 - (s.record.length ? 0.1 : 0);
          if (chance(s, clamp(p, 0.05, 0.8))) { s.heat = Math.max(0, s.heat - 50); stat(s, 'happiness', 10); return 'NOT GUILTY! The court acquitted you for lack of evidence.'; }
          years = halfYears(d.years[0] + rand(s) * (d.years[1] - d.years[0]));
        }
        E.sendToJail(s, years, d.charge);
        return `You were convicted and sentenced to ${years} year(s).`;
      },
    },
  });

  // ---------- prison life ----------

  const J = (o) => Object.assign({ group: 'Prison life', jail: true, cost: 0 }, o);
  L.registerActions([
    J({ id: 'j-eat', icon: '🥣', name: 'Eat prison food (beans & garri)', hours: 0.5, run: (s) => { need(s, 'hunger', 35); return pick(s, ['Watery beans again.', 'The garri had sand in it.', 'Today there was fish! A miracle.']); } }),
    J({ id: 'j-bath', icon: '🪣', name: 'Bucket bath', hours: 0.5, run: (s) => { need(s, 'hygiene', 60); return 'You queued for water and had a bucket bath.'; } }),
    J({ id: 'j-rest', icon: '🧎', name: 'Lie on your mat', hours: 1, run: (s) => { need(s, 'energy', 5); need(s, 'fun', 2); return 'You stared at the ceiling.'; } }),
    J({ id: 'j-work', icon: '🧵', name: 'Work in the prison workshop', hours: 6,
      can: (s) => (s.dayActs['j-work'] ? 'Already worked today' : null),
      run: (s) => {
        s.dayActs['j-work'] = true;
        s.money += 1500; s.jail.workDays++; s.jail.behaviour = clamp(s.jail.behaviour + 2);
        if (s.jail.workDays === 15 && !s.skills.includes('tailoring')) { s.skills.push('tailoring'); E.log(s, '🧵 You learnt tailoring in the prison workshop. That is a trade for life!', 'milestone'); }
        return 'You sewed uniforms in the workshop (₦1,500).';
      } }),
    J({ id: 'j-study', icon: '🎓', name: 'Study at the NOUN prison study centre', hours: 3,
      run: (s) => { s.jail.studyDays++; if (chance(s, 0.08)) stat(s, 'smarts', 1); s.jail.behaviour = clamp(s.jail.behaviour + 1); return 'You studied with the National Open University centre for inmates.'; } }),
    J({ id: 'j-workout', icon: '💪', name: 'Work out in the yard', hours: 2, run: (s) => { need(s, 'fun', 10); need(s, 'energy', -12); if (chance(s, 0.35)) stat(s, 'health', 1); return 'Push-ups and pull-ups on the yard bars.'; } }),
    J({ id: 'j-pray', icon: '🛐', name: 'Prison fellowship / Jumat', hours: 2, run: (s) => { need(s, 'social', 15); s.jail.behaviour = clamp(s.jail.behaviour + 3); stat(s, 'happiness', 1); s.karma = clamp(s.karma + 1); return 'The chaplain preached about second chances.'; } }),
    J({ id: 'j-gist', icon: '🗣️', name: 'Gist with cellmates', hours: 2, run: (s) => { need(s, 'social', 25); need(s, 'fun', 10); return pick(s, ['A cellmate told you how he was jailed for a crime he did not commit.', 'You traded stories and laughed for the first time in weeks.', 'An old inmate taught you how to play ayo.']); } }),
    J({ id: 'j-gang', icon: '🐍', name: 'Join a cell gang', hours: 1, can: (s) => (s.jail.gang ? 'You are already in a gang' : null), run: (s) => { s.jail.gang = true; s.jail.behaviour = clamp(s.jail.behaviour - 20); need(s, 'social', 30); s.karma = clamp(s.karma - 5); return 'You are now protected by the cell gang. The warders have noticed.'; } }),
    J({ id: 'j-phone', icon: '📵', name: 'Bribe a warder for phone time', hours: 1, cost: 10000,
      run: (s) => { if (chance(s, 0.2)) { s.jail.behaviour = clamp(s.jail.behaviour - 15); s.jail.daysLeft += 7; return 'A senior officer caught you. A week was added to your sentence.'; } need(s, 'social', 35); return 'You called home. Everyone cried.'; } }),
    J({ id: 'j-parole', icon: '📄', name: 'Apply for parole', hours: 2,
      can: (s) => (s.jail.daysLeft > s.jail.total / 2 ? 'Serve at least half your sentence first' : s.jail.behaviour < 60 ? 'Your behaviour record is not good enough (60+)' : s.flags.paroleDay && s.clock.day - s.flags.paroleDay < 7 && s.clock.day > s.flags.paroleDay ? 'You applied recently — wait a week' : null),
      run: (s) => { s.flags.paroleDay = s.clock.day; if (chance(s, (s.jail.behaviour - 40) / 100)) { E.releaseFromJail(s, 'The parole board approved your release from'); return 'Parole granted!'; } return 'The parole board said "not yet".'; } }),
    J({ id: 'j-escape', icon: '🧗', name: 'Attempt to escape', hours: 5,
      can: (s) => (s.dayActs['j-escape'] ? 'Not again today' : null),
      run: (s) => {
        s.dayActs['j-escape'] = true;
        if (chance(s, 0.1 + (s.jail.gang ? 0.1 : 0))) {
          const left = s.jail.daysLeft;
          E.releaseFromJail(s, 'You climbed the fence at night and escaped from');
          s.heat = 100; s.flags.fugitive = Math.max(1, Math.ceil(left / E.DAYS_PER_YEAR));
          return 'You are free, but now you are a wanted fugitive.';
        }
        s.jail.daysLeft += E.DAYS_PER_YEAR; s.jail.behaviour = clamp(s.jail.behaviour - 30); stat(s, 'health', -15);
        return 'Warders caught you on the fence. They beat you and added a year to your sentence.';
      } }),
  ]);

  // ---------- connections ----------

  function useConnection(s, jobId) {
    const block = E.canAct(s);
    if (block) return { ok: false, msg: block };
    const p = politicianParent(s);
    if (!p) return { ok: false, msg: 'You have no political connections.' };
    if (s.age < 18) return { ok: false, msg: 'You are too young.' };
    const j = E.JOB[jobId];
    if (!j) return { ok: false, msg: 'Unknown job.' };
    if (s.edu.stage === 'tertiary' || s.edu.stage === 'secondary') return { ok: false, msg: 'Finish school first.' };
    if (j.req.skill && !s.skills.includes(j.req.skill)) return { ok: false, msg: 'Even connections cannot give you a skill you don\'t have.' };
    if (j.needsAsset && !E.hasAssetKind(s, j.needsAsset)) return { ok: false, msg: `You need your own ${j.needsAsset}.` };
    if (D.LEVEL_RANK[s.edu.highest] < D.LEVEL_RANK[j.req.level] - 1) return { ok: false, msg: `Not even ${parentWord(s)} can get you that job without a ${j.req.level}.` };
    if (s.yearActs.connection) return { ok: false, msg: `${parentWord(s)} already made a call for you this year.` };
    s.yearActs.connection = true;
    p.closeness = clamp(p.closeness - 5);
    s.karma = clamp(s.karma - 3);
    const r = E.hire(s, jobId);
    E.log(s, `📞 ${parentWord(s)} made one phone call and you were "employed" as ${s.job.title}. Man know man.`, 'milestone');
    return r;
  }

  // ---------- politics ----------

  function electionYear(o, year) { return o.cycle === 'local' ? year % 4 === 1 : year % 4 === 3; }
  function nextElection(s, o) {
    let y = s.year;
    if (electionYear(o, y) && s.clock.day > 20) y++;
    while (!electionYear(o, y)) y++;
    return y;
  }
  function campaignBase(s) { return s.politics.candidacy ? OFFICE[s.politics.candidacy.office].cost : 3000000; }

  function joinParty(s, partyId) {
    const block = E.canAct(s);
    if (block) return { ok: false, msg: block };
    if (!PARTY[partyId]) return { ok: false, msg: 'Unknown party.' };
    if (s.age < 18) return { ok: false, msg: 'You must be 18 to join a party.' };
    if (s.politics.party === partyId) return { ok: false, msg: 'You are already a member.' };
    if (s.money < 50000) return { ok: false, msg: 'Membership card and dues cost ₦50,000.' };
    s.money -= 50000;
    const old = s.politics.party;
    s.politics.party = partyId;
    if (s.politics.candidacy) s.politics.candidacy = null;
    if (old) { s.politics.popularity = clamp(s.politics.popularity - 5); E.log(s, `You decamped from ${PARTY[old].name} to ${PARTY[partyId].name}. Critics call you a "political prostitute".`, 'info'); }
    else E.log(s, `🗳️ You joined the ${PARTY[partyId].name}.`, 'milestone');
    return { ok: true, msg: `Welcome to ${PARTY[partyId].name}!` };
  }

  function officeEligibility(s, officeId) {
    const o = OFFICE[officeId];
    if (!o) return 'Unknown office.';
    if (s.jail) return 'You are in prison.';
    if (!s.politics.party) return 'Join a political party first.';
    if (s.age < o.minAge) return `Minimum age ${o.minAge}.`;
    if (D.LEVEL_RANK[s.edu.highest] < D.LEVEL_RANK.SSCE) return 'The constitution requires at least a School Certificate (SSCE).';
    if (s.politics.candidacy) return `You are already running for ${OFFICE[s.politics.candidacy.office].name}.`;
    const cur = s.politics.office && OFFICE[s.politics.office.id];
    if (cur && cur.level > o.level) return 'You hold a higher office already.';
    if (s.money < o.cost * 0.1) return `Nomination form costs ${naira(o.cost * 0.1)}.`;
    return null;
  }

  function declare(s, officeId) {
    const block = E.canAct(s);
    if (block) return { ok: false, msg: block };
    const why = officeEligibility(s, officeId);
    if (why) return { ok: false, msg: why };
    const o = OFFICE[officeId];
    s.money -= o.cost * 0.1;
    const year = nextElection(s, o);
    s.politics.candidacy = { office: officeId, year, primary: false };
    E.log(s, `📣 You bought the ${PARTY[s.politics.party].name} nomination form for ${o.name} (${naira(o.cost * 0.1)}). Election: ${year}.`, 'milestone');
    E.queueEvent(s, 'primary', { office: officeId });
    return { ok: true, msg: 'You have declared your ambition!' };
  }

  E.registerEvents({
    primary: {
      build(s, d) {
        const o = OFFICE[d.office];
        return {
          title: '🗳️ Party primaries',
          text: `The ${PARTY[s.politics.party].name} primary for ${o.name} is here. Delegates are "expecting something".`,
          choices: [
            { label: `"Settle" the delegates (${naira(o.cost * 0.2)})`, value: 'settle' },
            { label: 'Rely on your popularity and ideas', value: 'merit' },
            { label: 'Step down for the party\'s consensus candidate', value: 'step' },
          ],
        };
      },
      resolve(s, v, d) {
        const o = OFFICE[d.office];
        if (v === 'step') { s.politics.candidacy = null; s.politics.popularity = clamp(s.politics.popularity + 3); return 'You stepped down. Party leaders promised you "something" next time.'; }
        let p = s.politics.popularity / 100 + 0.15 + (s.flags.godfather ? 0.25 : 0);
        if (v === 'settle') {
          if (s.money < o.cost * 0.2) { p -= 0.1; E.log(s, 'You could not raise enough to settle the delegates.', 'bad'); }
          else { s.money -= o.cost * 0.2; p += 0.45; s.karma = clamp(s.karma - 4); }
        }
        if (chance(s, clamp(p, 0.05, 0.92))) { s.politics.candidacy.primary = true; s.politics.popularity = clamp(s.politics.popularity + 5); return `🎉 You won the primary! You are the ${PARTY[s.politics.party].name} candidate for ${o.name}. Campaign until the ${s.politics.candidacy.year} election.`; }
        s.politics.candidacy = null; stat(s, 'happiness', -10);
        return 'You lost the primary. The godfathers picked someone else.';
      },
    },
    'election-lost': {
      build: (s, d) => ({ title: '📉 Election lost', text: `You lost the ${OFFICE[d.office].name} election. Your supporters are angry.`, choices: [{ label: 'Congratulate the winner', value: 'accept' }, { label: `Go to the election tribunal (${naira(OFFICE[d.office].cost * 0.05)})`, value: 'tribunal' }, { label: 'Lead a protest', value: 'protest' }] }),
      resolve(s, v, d) {
        const o = OFFICE[d.office];
        if (v === 'accept') { s.karma = clamp(s.karma + 5); s.politics.popularity = clamp(s.politics.popularity + 5); return 'You were praised as a true democrat.'; }
        if (v === 'tribunal') {
          s.money -= o.cost * 0.05;
          if (chance(s, 0.2)) { takeOffice(s, d.office); return `The tribunal overturned the result! You are now ${o.name}.`; }
          return 'The tribunal upheld your opponent\'s victory.';
        }
        s.heat = clamp(s.heat + 20); s.politics.popularity = clamp(s.politics.popularity + 3);
        if (chance(s, 0.2)) { E.arrest(s, 'Police arrested you for inciting violence after the election', 1, false); return ''; }
        return 'The protest was loud. Nothing changed.';
      },
    },
    allowance: {
      build(s, d) {
        return { title: '🏛️ Constituency allowance', text: `As ${OFFICE[s.politics.office.id].name}, ${naira(d.amount)} has been released to you for projects and "security votes".`, choices: [{ label: 'Execute real projects (roads, boreholes, schools)', value: 'projects' }, { label: 'Split it: half projects, half pocket', value: 'split' }, { label: 'Pocket it all', value: 'pocket' }] };
      },
      resolve(s, v, d) {
        if (v === 'projects') { s.politics.popularity = clamp(s.politics.popularity + 12); s.karma = clamp(s.karma + 6); return 'You built roads and boreholes. People are naming streets after you.'; }
        if (v === 'split') { s.money += d.amount / 2; s.politics.embezzled += d.amount / 2; s.politics.popularity = clamp(s.politics.popularity + 4); return 'You did some projects and "took care of yourself".'; }
        s.money += d.amount; s.politics.embezzled += d.amount; s.karma = clamp(s.karma - 10); s.politics.popularity = clamp(s.politics.popularity - 5);
        return 'The money went straight into your accounts. Your constituents are complaining.';
      },
    },
    efcc: {
      build: (s) => ({ title: '🕵️ EFCC is here', text: `The EFCC has traced ${naira(s.politics.embezzled)} in stolen public funds to you.`, choices: [{ label: 'Plea bargain: return half the loot', value: 'plea' }, { label: 'Fight it with a team of SANs (₦50,000,000)', value: 'fight' }, { label: 'Flee to London', value: 'flee' }, { label: 'Defect to the ruling party for "forgiveness"', value: 'defect' }] }),
      resolve(s, v) {
        const loot = s.politics.embezzled;
        if (v === 'plea') { s.money -= loot / 2; s.politics.embezzled = 0; s.politics.popularity = clamp(s.politics.popularity - 10); return 'You returned half and walked free. Nigerians are not surprised.'; }
        if (v === 'defect') { const others = D.PARTIES.filter((p) => p.id !== s.politics.party); s.politics.party = pick(s, others).id; if (chance(s, 0.6)) { s.politics.embezzled = 0; return 'Once you defected, your "sins were forgiven" and the case was dropped.'; } }
        if (v === 'fight') {
          s.money -= 50000000;
          if (chance(s, 0.6)) { s.politics.embezzled = 0; return 'Your lawyers filed endless adjournments. The case quietly died.'; }
        }
        if (v === 'flee') {
          if (chance(s, 0.7)) { s.ended = { type: 'japa', dest: 'London (fleeing the EFCC)', age: s.age, year: s.year }; E.log(s, '✈️ You fled to London with your loot. You can never come back home.', 'milestone'); return ''; }
          E.log(s, 'Immigration officers stopped you at the airport.', 'bad');
        }
        s.politics.embezzled = 0;
        s.money = Math.round(Math.max(0, s.money) * 0.2);
        E.sendToJail(s, randInt(s, 5, 14), 'corruption and money laundering');
        return 'You were convicted of corruption and most of your assets were seized.';
      },
    },
    godfather: {
      build: () => ({ title: '🎩 The godfather calls', text: 'Your political godfather wants his "returns": ₦20,000,000 and control of all contracts in your area.', choices: [{ label: 'Pay ₦20,000,000 and obey', value: 'pay' }, { label: 'Refuse — you are your own person', value: 'refuse' }] }),
      resolve(s, v) {
        if (v === 'pay') { s.money -= 20000000; return 'The godfather is happy. For now.'; }
        s.flags.godfather = false; s.politics.popularity = clamp(s.politics.popularity + 8);
        if (chance(s, 0.4) && s.politics.office) { E.log(s, 'The godfather sponsored an impeachment against you.', 'bad'); s.politics.office = null; return 'You were impeached by his loyalists.'; }
        return 'You broke free. The people love your courage.';
      },
    },
  });

  function takeOffice(s, officeId) {
    const o = OFFICE[officeId];
    s.politics.office = { id: officeId, since: s.year, until: s.year + 4 };
    s.politics.terms++;
    if (!s.politics.best || OFFICE[s.politics.best] && OFFICE[s.politics.best].level <= o.level) s.politics.best = officeId;
    stat(s, 'happiness', 20);
    E.log(s, `🏛️ You were sworn in as ${o.name}!`, 'milestone');
  }

  const P = (o) => Object.assign({ group: 'Politics', cost: 0, minAge: 18 }, o);
  const candidate = (s) => (s.politics.candidacy && s.politics.candidacy.primary ? null : 'Win a party primary first');
  L.registerActions([
    P({ id: 'p-rally', icon: '📢', name: 'Hold a campaign rally', hours: 5, can: (s) => candidate(s) || (s.money < campaignBase(s) * 0.03 ? `Need ${naira(campaignBase(s) * 0.03)}` : null), run: (s) => { s.money -= campaignBase(s) * 0.03; const g = randInt(s, 2, 6); s.politics.popularity = clamp(s.politics.popularity + g); need(s, 'energy', -15); return `A sea of supporters in party colours! Popularity +${g}.`; } }),
    P({ id: 'p-palliative', icon: '🍚', name: 'Share rice & palliatives', hours: 4, can: (s) => candidate(s) || (s.money < campaignBase(s) * 0.05 ? `Need ${naira(campaignBase(s) * 0.05)}` : null), run: (s) => { s.money -= campaignBase(s) * 0.05; const g = randInt(s, 4, 9); s.politics.popularity = clamp(s.politics.popularity + g); s.karma = clamp(s.karma - 1); return `Bags of rice with your face on them. Popularity +${g}.`; } }),
    P({ id: 'p-door', icon: '🚪', name: 'Door-to-door campaign', hours: 6, can: candidate, run: (s) => { const g = randInt(s, 1, 2); s.politics.popularity = clamp(s.politics.popularity + g); need(s, 'energy', -15); need(s, 'social', 20); return `You knocked on doors and listened to people. Popularity +${g}.`; } }),
    P({ id: 'p-radio', icon: '📻', name: 'Radio interview (OGBC)', hours: 2, can: (s) => (s.politics.candidacy || s.politics.office ? null : 'Only for candidates and office holders'), run: (s) => { const g = Math.round((s.stats.smarts - 45) / 10) + randInt(s, -2, 2); s.politics.popularity = clamp(s.politics.popularity + g); return g >= 0 ? `You spoke well on air. Popularity +${g}.` : `You fumbled a question about the budget. Popularity ${g}.`; } }),
    P({ id: 'p-thugs', icon: '🪓', name: 'Hire thugs for election day', hours: 2, can: (s) => candidate(s) || (s.politics.rigged ? 'Already arranged' : s.money < campaignBase(s) * 0.1 ? `Need ${naira(campaignBase(s) * 0.1)}` : null), run: (s) => { s.money -= campaignBase(s) * 0.1; s.politics.rigged = true; s.heat = clamp(s.heat + 20); s.karma = clamp(s.karma - 12); return 'The boys are ready to "protect your votes". This is dangerous.'; } }),
    P({ id: 'p-godfather', icon: '🎩', name: 'Visit a political godfather', hours: 3, can: (s) => (!s.politics.party ? 'Join a party first' : s.flags.godfather ? 'You already have a godfather' : s.money < 5000000 ? 'Need ₦5,000,000 for "kola"' : null), run: (s) => { s.money -= 5000000; s.flags.godfather = true; s.politics.popularity = clamp(s.politics.popularity + 8); return 'The godfather blessed your ambition. He will expect returns.'; } }),
    P({ id: 'p-project', icon: '🏗️', name: 'Commission a project', hours: 4, can: (s) => (!s.politics.office ? 'Only office holders' : s.dayActs['p-project'] ? 'One per day' : null), run: (s) => { s.dayActs['p-project'] = true; s.politics.popularity = clamp(s.politics.popularity + randInt(s, 1, 3)); return 'You cut the ribbon on a new borehole. Cameras flashed.'; } }),
  ]);

  // Yearly: elections, office pay, EFCC, tribunals, godfathers.
  E.onYear((s) => {
    const pol = s.politics;
    if (!pol) return;
    if (s.age >= 18) pol.popularity = clamp(pol.popularity - (pol.office ? 4 : 2));
    if (s.jail) return;

    const c = pol.candidacy;
    if (c && c.year === s.year - 1) {
      const o = OFFICE[c.office];
      pol.candidacy = null;
      if (c.primary) {
        const incumbent = pol.office && pol.office.id === c.office;
        const p = 0.5 + (pol.popularity - o.popularity) / 60 + (pol.rigged ? 0.2 : 0) + (incumbent ? 0.1 : 0) + (s.flags.godfather ? 0.1 : 0) - (s.record.length ? 0.15 : 0);
        const rigged = pol.rigged;
        pol.rigged = false;
        if (chance(s, clamp(p, 0.03, 0.95))) {
          E.log(s, `🗳️ ELECTION RESULT: You won the ${o.name} election${rigged ? ' (amid allegations of thuggery and vote-buying)' : ''}!`, 'milestone');
          takeOffice(s, c.office);
          if (rigged) s.flags.tribunalRisk = true;
        } else {
          pol.popularity = clamp(pol.popularity - 8);
          E.log(s, `🗳️ ELECTION RESULT: You lost the ${o.name} election.`, 'bad');
          E.queueEvent(s, 'election-lost', { office: c.office });
        }
      }
    }

    if (pol.office) {
      const o = OFFICE[pol.office.id];
      if (s.flags.tribunalRisk && pol.office.since === s.year - 1 && chance(s, 0.25)) {
        E.log(s, '⚖️ The election tribunal nullified your victory because of irregularities. You lost your seat.', 'bad');
        pol.office = null; s.flags.tribunalRisk = false;
        return;
      }
      s.flags.tribunalRisk = false;
      s.money += o.salary;
      E.log(s, `🏛️ Salary and allowances as ${o.name}: ${naira(o.salary)} this year.`, 'money');
      E.queueEvent(s, 'allowance', { amount: round1k(o.salary * 1.5) });
      if (s.flags.godfather && chance(s, 0.3)) E.queueEvent(s, 'godfather');
      if (s.year >= pol.office.until) {
        E.log(s, `Your tenure as ${o.name} has ended.`, 'info');
        pol.office = null;
      }
    }
    if (pol.embezzled > 0 && chance(s, 0.15)) E.queueEvent(s, 'efcc');
  });

  return { crimeOdds, commitCrime, useConnection, joinParty, declare, officeEligibility, nextElection, electionYear, takeOffice, OFFICE, PARTY, politicianParent, parentWord };
});
