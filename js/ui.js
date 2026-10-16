/*
 * OGS Lifestyle — UI controller. Renders the game state into the page and
 * routes button clicks (anything with data-act / data-ui / data-tab) to the
 * engine.
 */
(function (root) {
  'use strict';
  const D = root.OGS.Data;
  const E = root.OGS.Engine;
  const M = root.OGS.Map;
  const h = M.escapeHtml;
  const naira = E.naira;
  const SAVE_KEY = 'ogs-lifestyle-v1';

  let S = null;
  let tab = 'life';
  let mapReady = false;
  const ui = {
    edu: { kind: 'all', owner: 'all', q: '' },
    jobs: { eligibleOnly: false, place: null },
  };

  const $ = (sel) => document.querySelector(sel);

  // ---------- persistence ----------

  function save() {
    if (!S) return;
    try { localStorage.setItem(SAVE_KEY, E.serialize(S)); } catch (e) { /* storage blocked */ }
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? E.deserialize(raw) : null;
    } catch (e) { return null; }
  }

  function exportSave() {
    const blob = new Blob([E.serialize(S)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ogs-lifestyle-${S.first}-${S.last}-age${S.age}.json`.toLowerCase().replace(/\s+/g, '-');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- helpers ----------

  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + kind;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function result(r) {
    if (!r) return;
    toast(r.msg, r.ok ? 'good' : 'bad');
    afterAction();
  }

  function afterAction() {
    save();
    render();
    if (S.events.length || S.ended) showModalForState();
  }

  function km(a, b) { return Math.round(E.distanceKm(a, b)); }

  function barColor(v) { return v >= 66 ? 'var(--good)' : v >= 33 ? 'var(--accent)' : 'var(--bad)'; }

  function mapBtn(lat, lng, label = '🗺️ Map') {
    return `<button class="small secondary" data-act="show-map" data-lat="${lat}" data-lng="${lng}">${label}</button>`;
  }

  function stageLabel() {
    const c = S.edu.current;
    if (!c) return S.edu.stage === 'none' ? 'Not yet in school' : 'Not in school';
    if (c.kind === 'primary') return `Primary ${c.year}`;
    if (c.kind === 'secondary') return E.SEC_YEARS[c.year - 1];
    return `${c.level} year ${c.year}/${c.years}`;
  }

  // ---------- render ----------

  function render() {
    if (!S) return;
    const t = E.TOWN[S.town];
    $('#who').innerHTML = `<b>${h(S.first)} ${h(S.last)}</b> · ${S.age} yrs · 📍${h(t.name)}${S.edu.highest !== 'none' ? ' · ' + S.edu.highest : ''}${S.prison ? ' · 🚔 In prison' : ''}`;
    const st = S.stats;
    const bar = (k, label) => `<div class="stat"><div class="label"><span>${label}</span><span>${st[k]}%</span></div><div class="bar"><i style="width:${st[k]}%;background:${barColor(st[k])}"></i></div></div>`;
    $('#stats').innerHTML = `<div class="stat money"><div class="label"><span>Bank balance</span></div><div class="value">${naira(S.money)}</div></div>`
      + bar('health', '❤️ Health') + bar('happiness', '😊 Happiness') + bar('smarts', '🧠 Smarts') + bar('looks', '✨ Looks');

    const ageBtn = $('#age-btn');
    if (S.ended) { ageBtn.textContent = '✨ Start a new life'; }
    else { ageBtn.textContent = S.events.length ? '❗ Respond to event' : `＋ Age a year (turn ${S.age + 1})`; }

    renderPanel(tab);
    if (mapReady) M.updatePlayer(S);
  }

  function renderPanel(name) {
    const fn = { life: renderLife, education: renderEducation, career: renderCareer, people: renderPeople, activities: renderActivities, assets: renderAssets }[name];
    if (fn) $('#panel-' + name).innerHTML = fn();
  }

  function renderLife() {
    const t = E.TOWN[S.town];
    const job = S.job ? `${h(S.job.title)} · ${h(S.job.employer)} (${naira(S.job.salary)}/mo)` : S.nysc && S.nysc.status === 'serving' ? `NYSC corps member in ${h(S.nysc.state)}` : 'None';
    const home = S.livingWithParents ? `With parents in ${h(E.TOWN[S.homeTown].name)}` : `Own place in ${h(t.name)}`;
    let html = `<div class="card"><div class="row between"><h2 style="margin:0">${h(S.first)} ${h(S.last)}</h2><span class="pill">${S.year}</span></div>
      <dl class="kv" style="margin-top:8px">
        <dt>Age</dt><dd>${S.age}</dd>
        <dt>Hometown</dt><dd>${h(E.TOWN[S.homeTown].name)}, ${h(E.lgaName(E.TOWN[S.homeTown].lga))} LGA</dd>
        <dt>Living</dt><dd>${home}</dd>
        <dt>Education</dt><dd>${stageLabel()}${S.edu.current ? ' — ' + h(S.edu.current.name) : ''}</dd>
        <dt>Job</dt><dd>${job}</dd>
        <dt>Net worth</dt><dd>${naira(E.netWorth(S))}</dd>
        <dt>Karma</dt><dd>${S.karma}/100</dd>
        <dt>Towns visited</dt><dd>${S.visited.length} of ${D.TOWNS.length}</dd>
      </dl></div>`;
    // Group entries by year (newest year first, entries in order within a year).
    const groups = [];
    for (const l of S.log) {
      if (l.kind === 'year' || !groups.length) groups.push({ title: l.kind === 'year' ? l.text : `Age ${l.age} · ${l.year}`, items: [] });
      if (l.kind !== 'year') groups[groups.length - 1].items.push(l);
    }
    html += '<div>';
    for (const g of groups.reverse()) {
      html += `<div class="log-year">${h(g.title)}</div>`;
      html += g.items.length ? g.items.map((l) => `<div class="log-item ${l.kind}">${h(l.text)}</div>`).join('') : '<div class="log-item muted">A quiet year.</div>';
    }
    return html + '</div>';
  }

  // ----- education -----

  function admissionBlock(inst, prog) {
    const e = S.edu;
    if (e.stage === 'tertiary') return 'Already enrolled';
    if (e.stage !== 'out') return 'Finish secondary school first';
    if (prog.mode === 'regular') {
      if (!e.waec || e.waec.credits < 5) return 'Need 5 WAEC credits';
      if (!e.jamb || e.jamb.score < prog.req) return `JAMB ${prog.req}+ needed`;
    }
    const fee = E.tertiaryFees(inst, prog.mode);
    if (!E.canAfford(S, fee)) return 'Cannot afford fees';
    if (S.yearActs['apply-' + inst.id]) return 'Applied this year';
    return null;
  }

  function renderEducation() {
    const e = S.edu;
    const c = e.current;
    let html = '<div class="card"><h2 style="margin-top:0">📚 Your education</h2>';
    if (!c && e.stage === 'none') {
      html += `<p>You will start primary school at age 5.</p>`;
    } else if (c && c.kind !== 'tertiary') {
      html += `<p><b>${stageLabel()}</b> at ${h(c.name)}</p><p class="small muted">Study effort: ${e.effort}/15 — use <i>Study hard</i> in Activities to raise your WAEC & JAMB scores.</p>`;
    } else if (c) {
      const inst = E.INST[c.instId];
      const gpa = c.gpN ? (c.gpSum / c.gpN).toFixed(2) : '—';
      html += `<p><b>${h(D.COURSES[c.courseId].name)}</b>${c.mode === 'hnd' ? ' (HND)' : c.mode === 'msc' ? ' (M.Sc)' : ''} at ${h(inst.name)}</p>
        <dl class="kv"><dt>Year</dt><dd>${c.year} of ${c.years}</dd><dt>CGPA so far</dt><dd>${gpa}</dd><dt>Fees</dt><dd>${c.scholarship ? 'Scholarship 🎉' : naira(c.fees) + '/yr'}</dd><dt>Study effort</dt><dd>${e.effort}/15</dd></dl>
        <div class="row" style="margin-top:8px">${mapBtn(inst.lat, inst.lng, '🗺️ Campus')}<button class="small danger" data-act="dropout">Drop out</button></div>`;
    } else {
      html += `<p>You are not currently in school.</p>`;
    }
    if (e.waec) {
      html += `<dl class="kv" style="margin-top:8px"><dt>WAEC/NECO</dt><dd>${e.waec.withheld ? 'Withheld' : e.waec.credits + ' credits'} ${e.waec.credits >= 5 ? '<span class="pill ok">pass</span>' : '<span class="pill no">insufficient</span>'}</dd>
        <dt>JAMB UTME</dt><dd>${e.jamb ? e.jamb.score + '/400 (' + e.jamb.year + ')' : '—'}</dd></dl>`;
      if (e.stage === 'out') {
        html += `<div class="row" style="margin-top:8px"><button class="small" data-act="jamb" ${S.yearActs.jamb ? 'disabled' : ''}>Write JAMB again (₦7,700)</button><button class="small secondary" data-act="waec" ${S.yearActs.waec ? 'disabled' : ''}>Resit NECO/GCE (₦28,000)</button></div>`;
      }
    }
    if (S.nysc) html += `<p class="small"><b>NYSC:</b> ${{ serving: 'Serving in ' + h(S.nysc.state), done: 'Completed ✅', exempt: 'Exempted ✅', skipped: 'Skipped ❌' }[S.nysc.status]}</p>`;
    html += '</div>';

    // Institutions
    const f = ui.edu;
    html += `<h2>🏛️ Tertiary institutions in Ogun State</h2>
      <div class="filters">
        <select data-filter="edu-kind">${[['all', 'All types'], ['university', 'Universities'], ['polytechnic', 'Polytechnics'], ['coe', 'Colleges of Education'], ['health', 'Health colleges']].map(([v, l]) => `<option value="${v}" ${f.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select data-filter="edu-owner">${[['all', 'Any owner'], ['federal', 'Federal'], ['state', 'State'], ['private', 'Private']].map(([v, l]) => `<option value="${v}" ${f.owner === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="search" data-filter="edu-q" placeholder="Search school or course" value="${h(f.q)}">
      </div><div class="grid">`;
    const q = f.q.trim().toLowerCase();
    const here = E.TOWN[S.town];
    const list = D.INSTITUTIONS.filter((i) => (f.kind === 'all' || i.kind === f.kind) && (f.owner === 'all' || i.owner === f.owner))
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.short.toLowerCase().includes(q) || i.courses.some((cid) => D.COURSES[cid].name.toLowerCase().includes(q)))
      .sort((a, b) => b.prestige - a.prestige);
    for (const inst of list) {
      const progs = E.programmesAt(S, inst.id);
      const parentShare = E.parentFeeShare(S, inst.fees);
      html += `<div class="card"><div class="row between"><h3>${h(inst.name)}</h3></div>
        <div class="row"><span class="pill ${inst.owner}">${inst.owner}</span><span class="pill">${inst.kind === 'coe' ? 'college of education' : inst.kind}</span></div>
        <p class="small muted">${h(E.TOWN[inst.town].name)} · ${km(here, inst)} km from you · Fees ${naira(inst.fees)}/yr${parentShare ? ` (parents cover ${naira(parentShare)})` : ''}</p>
        <div>${progs.map((p) => {
          const why = admissionBlock(inst, p);
          return `<div class="prog"><span>${h(p.name)}<br><span class="small muted">${p.years} yrs${p.req ? ' · JAMB ' + p.req + '+' : ''}</span></span>
            <button class="small" data-act="apply-inst" data-inst="${inst.id}" data-course="${p.courseId}" data-mode="${p.mode}" ${why ? `disabled title="${h(why)}"` : ''}>${why ? h(why) : 'Apply'}</button></div>`;
        }).join('')}</div>
        <div class="row" style="margin-top:6px">${mapBtn(inst.lat, inst.lng)}</div></div>`;
    }
    html += '</div>';

    // Secondary schools reference
    html += `<h2>🏫 Notable secondary schools</h2><p class="small muted">You choose one after your Common Entrance exam at age 10.</p><div class="grid">`;
    for (const sc of D.SECONDARY) {
      html += `<div class="card"><h3>${h(sc.name)}</h3><div class="row"><span class="pill">${sc.tier}</span>${sc.gender !== 'any' ? `<span class="pill">${sc.gender === 'male' ? 'boys' : 'girls'}</span>` : ''}</div><p class="small muted">${h(sc.blurb)} · ${naira(sc.fees)}/yr</p>${mapBtn(sc.lat, sc.lng)}</div>`;
    }
    html += '</div>';

    // Skills
    html += `<h2>🛠️ Skills & apprenticeships</h2>${S.training ? `<p>Currently training: <b>${h(E.SKILL[S.training.id].name)}</b></p>` : ''}<div class="grid">`;
    for (const sk of D.SKILLS) {
      const have = S.skills.includes(sk.id);
      html += `<div class="card"><h3>${h(sk.name)}</h3><p class="small muted">${naira(sk.cost)} · ${sk.years} year</p>
        ${have ? '<span class="pill ok">Completed</span>' : `<button class="small" data-act="train" data-id="${sk.id}" ${S.training || S.age < 14 ? 'disabled' : ''}>Enrol</button>`}</div>`;
    }
    html += '</div>';

    if (e.history.length) {
      html += '<h2>📜 History</h2><div class="card">' + e.history.slice().reverse().map((x) => `<div class="prog"><span><b>${h(x.qualification)}</b>${x.grade ? ' — ' + h(x.grade) : ''}<br><span class="small muted">${h(x.name)}</span></span><span class="small muted">${x.year}</span></div>`).join('') + '</div>';
    }
    return html;
  }

  // ----- career -----

  function renderCareer() {
    let html = '<div class="card"><h2 style="margin-top:0">💼 Your work</h2>';
    if (S.job) {
      const j = S.job;
      html += `<p><b>${h(j.title)}</b> at ${h(j.employer)}, ${h(E.TOWN[j.town].name)}</p>
        <dl class="kv"><dt>Salary</dt><dd>${naira(j.salary)}/month (${naira(j.salary * 12)}/yr)</dd><dt>Years</dt><dd>${j.years}</dd><dt>Performance</dt><dd><div class="bar" style="width:160px"><i style="width:${j.perf}%;background:${barColor(j.perf)}"></i></div></dd></dl>
        <div class="row" style="margin-top:8px">
          <button class="small" data-act="workhard" ${S.yearActs.workhard ? 'disabled' : ''}>Work hard</button>
          <button class="small secondary" data-act="raise" ${S.yearActs.raise ? 'disabled' : ''}>Ask for a raise</button>
          ${S.age >= 50 ? '<button class="small secondary" data-act="retire">Retire</button>' : ''}
          <button class="small danger" data-act="quit">Resign</button>
        </div>`;
    } else {
      html += `<p>${S.nysc && S.nysc.status === 'serving' ? `You are serving with NYSC in ${h(S.nysc.state)}.` : 'You are not employed.'}${S.pension ? ` Pension: ${naira(S.pension)}/yr.` : ''}</p>`;
    }
    html += '</div>';

    const f = ui.jobs;
    html += `<h2>📋 Job board</h2><div class="filters">
      <label class="row small"><input type="checkbox" data-filter="jobs-eligible" ${f.eligibleOnly ? 'checked' : ''}> Only jobs I qualify for</label>
      ${f.place ? `<button class="small secondary" data-act="clear-place">At: ${h(E.PLACE[f.place].name)} ✕</button>` : ''}
    </div><div class="grid">`;
    for (const j of D.JOBS) {
      if (f.place && j.place !== f.place) continue;
      const why = E.jobEligibility(S, j.id);
      if (f.eligibleOnly && why) continue;
      const place = j.place ? E.PLACE[j.place] : null;
      const where = j.institution ? 'Any university' : place ? `${place.name}, ${E.TOWN[place.town].name}` : `Anywhere (your town)`;
      const req = [j.req.level !== 'none' ? j.req.level : 'No certificate', j.req.fields ? j.req.fields.join('/') : '', j.req.nysc ? 'NYSC' : '', j.req.skill ? E.SKILL[j.req.skill].name : '', j.needsAsset ? 'own ' + j.needsAsset : ''].filter(Boolean).join(' · ');
      const applied = S.yearActs['job-' + j.id];
      html += `<div class="card"><h3>${h(j.title)}</h3><p class="small muted">${h(where)}</p>
        <p><b>${naira(j.salary)}</b>/month <span class="small muted">→ ${h(j.levels[j.levels.length - 1])}</span></p>
        <p class="small">${h(req)}</p>${why ? `<p class="req">${h(why)}</p>` : ''}
        <div class="row"><button class="small" data-act="apply-job" data-id="${j.id}" ${why || applied ? 'disabled' : ''}>${applied ? 'Applied this year' : 'Apply'}</button>${place ? mapBtn(place.lat, place.lng) : ''}</div></div>`;
    }
    html += '</div>';
    if (S.jobHistory.length) {
      html += '<h2>🗂️ Work history</h2><div class="card">' + S.jobHistory.slice().reverse().map((x) => `<div class="prog"><span><b>${h(x.title)}</b> — ${h(x.employer)}<br><span class="small muted">${x.years} yr(s), ${h(x.how)}</span></span><span class="small muted">${x.endYear}</span></div>`).join('') + '</div>';
    }
    return html;
  }

  // ----- people -----

  function renderPeople() {
    let html = `<div class="row between" style="margin-top:12px"><h2 style="margin:0">👪 Relationships</h2>
      ${S.age >= 16 && !E.partner(S) ? `<button class="small" data-act="activity" data-id="findlove" ${S.yearActs.findlove ? 'disabled' : ''}>❤️ Find love</button>` : ''}</div><div class="grid" style="margin-top:10px">`;
    const order = ['spouse', 'fiancé(e)', 'partner', 'child', 'mother', 'father', 'sibling'];
    const people = S.relations.slice().sort((a, b) => (b.alive - a.alive) || ((order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99)));
    for (const r of people) {
      const acts = E.interactionsFor(r);
      html += `<div class="card"><div class="row between"><h3>${h(E.fullName(r))}</h3><span class="pill">${h(r.role)}</span></div>
        <p class="small muted">${r.alive ? `Age ${r.age}` : `Died at ${r.age}`}${r.town ? ' · ' + h(E.TOWN[r.town].name) : ''}</p>
        ${r.alive ? `<div class="bar"><i style="width:${r.closeness}%;background:${barColor(r.closeness)}"></i></div><p class="small muted">Relationship ${r.closeness}%</p>` : ''}
        <div class="row">${acts.map((a) => `<button class="small ${['argue', 'breakup', 'divorce'].includes(a.id) ? 'secondary' : ''}" data-act="interact" data-person="${r.id}" data-action="${a.id}" ${S.yearActs[`rel-${r.id}-${a.id}`] ? 'disabled' : ''}>${h(a.name)}</button>`).join('')}</div></div>`;
    }
    return html + '</div>';
  }

  // ----- activities -----

  function renderActivities() {
    let html = '<h2>🎯 This year</h2><div class="grid">';
    for (const a of E.ACTIVITIES) {
      if (a.id === 'findlove') continue;
      const done = S.yearActs['act-' + a.id];
      const young = S.age < a.minAge;
      html += `<div class="card"><h3>${h(a.name)}</h3><p class="small muted">${h(a.desc)}</p>
        <button class="small" data-act="activity" data-id="${a.id}" ${done || young ? 'disabled' : ''}>${done ? 'Done this year' : young ? `From age ${a.minAge}` : 'Do it'}</button></div>`;
    }
    html += '</div>';

    // Places
    html += '<h2>🧭 Places to visit</h2><p class="small muted">Trips cost transport from where you live. Open the map to choose danfo, keke, okada, ride-hailing or your own car.</p><div class="grid">';
    for (const p of D.PLACES.filter(E.placeVisitable)) {
      const q = E.tripQuote(S, p, 'bus');
      html += `<div class="card"><h3>${M.KIND_ICON[p.kind]} ${h(p.name)}</h3><p class="small muted">${h(p.blurb)}</p>
        <p class="small">${h(E.TOWN[p.town].name)} · ${Math.round(q.km)} km · bus ≈ ${naira(q.cost + (p.fee || 0))}</p>
        <div class="row"><button class="small" data-act="visit" data-id="${p.id}" data-mode="bus" ${S.yearActs['visit-' + p.id] ? 'disabled' : ''}>${S.yearActs['visit-' + p.id] ? 'Visited this year' : 'Go by bus'}</button>${mapBtn(p.lat, p.lng)}</div></div>`;
    }
    html += '</div>';

    // Housing
    const towns = D.TOWNS.slice().sort((a, b) => a.name.localeCompare(b.name));
    html += `<h2>🏘️ Housing</h2><div class="card">
      <p>${S.livingWithParents ? `You live with your parents in ${h(E.TOWN[S.homeTown].name)} — free rent!` : `You rent in ${h(E.TOWN[S.town].name)}. Living costs ≈ ${naira(E.livingCost(S))}/yr.`}</p>
      <div class="row"><select id="move-town">${towns.map((t) => `<option value="${t.id}" ${t.id === S.town ? 'selected' : ''}>${h(t.name)} — rent ${naira(t.rent)}/yr</option>`).join('')}</select>
      <button class="small" data-act="move" ${S.age < 16 ? 'disabled' : ''}>Move here</button>
      ${!S.livingWithParents ? '<button class="small secondary" data-act="movehome">Move back with parents</button>' : ''}</div></div>`;

    // Japa
    const jr = E.japaRequirement(S);
    html += `<h2>✈️ Japa</h2><div class="card"><p>Relocate abroad and end this life story on a high. Needs proof of funds of ${naira(jr.need)}, a degree/HND (or coding skill) and age 21+. Visa, flights & settling-in cost ₦8,000,000.</p>
      ${jr.ok ? '' : `<p class="req">${h(jr.msg)}</p>`}<button data-act="japa" ${jr.ok ? '' : 'disabled'}>Japa now</button></div>`;
    return html;
  }

  // ----- assets -----

  function renderAssets() {
    let html = '<h2>🏠 What you own</h2>';
    if (!S.assets.length) html += '<p class="muted">Nothing yet.</p>';
    else {
      html += '<div class="card">' + S.assets.map((a) => `<div class="prog"><span><b>${h(E.ASSET[a.id].name)}</b><br><span class="small muted">Worth ${naira(a.value)} · bought ${a.boughtYear}</span></span><button class="small secondary" data-act="sell" data-uid="${a.uid}">Sell (${naira(Math.round(a.value * 0.9))})</button></div>`).join('') + '</div>';
    }
    html += '<h2>🛒 Shop</h2><div class="grid">';
    for (const a of D.ASSETS) {
      const extra = a.rentIncome ? ` · rent income ${naira(a.rentIncome)}/yr` : a.appreciation ? ' · appreciates' : '';
      html += `<div class="card"><h3>${h(a.name)}</h3><p><b>${naira(a.price)}</b><span class="small muted">${extra}</span></p>
        <button class="small" data-act="buy" data-id="${a.id}" ${S.money < a.price || S.age < 16 ? 'disabled' : ''}>Buy</button></div>`;
    }
    return html + '</div>';
  }

  // ---------- map popups ----------

  function transportSelect(target, id) {
    return `<select data-mode-for="${id}">${Object.entries(D.TRANSPORT).map(([k, t]) => {
      const q = E.tripQuote(S, target, k);
      return `<option value="${k}" ${q.ok ? '' : 'disabled'}>${h(t.name)} — ${q.ok ? naira(q.cost) : h(q.msg)}</option>`;
    }).join('')}</select>`;
  }

  function popup(type, id) {
    if (!S) return '';
    const here = E.TOWN[S.town];
    if (type === 'me') {
      return `<h3>${h(S.first)} ${h(S.last)} (you)</h3><p>${S.age} years old, living in ${h(here.name)}${S.livingWithParents ? ' with your parents' : ''}.</p>${S.job ? `<p>${h(S.job.title)} at ${h(S.job.employer)}</p>` : ''}`;
    }
    if (type === 'town') {
      const t = E.TOWN[id];
      const insts = D.INSTITUTIONS.filter((i) => i.town === id).map((i) => i.short);
      return `<h3>${h(t.name)}</h3><span class="pill">${h(E.lgaName(t.lga))} LGA</span><p>${h(t.blurb)}</p>
        <p class="small">Rent ≈ ${naira(t.rent)}/yr · ${km(here, t)} km from you${insts.length ? '<br>Institutions: ' + h(insts.join(', ')) : ''}</p>
        ${id !== S.town || S.livingWithParents ? `<button class="small" data-act="move-to" data-id="${id}" ${S.age < 16 ? 'disabled' : ''}>Move here</button>` : '<span class="pill ok">You live here</span>'}`;
    }
    if (type === 'inst') {
      const i = E.INST[id];
      return `<h3>${h(i.name)}</h3><span class="pill ${i.owner}">${i.owner}</span> <span class="pill">${i.kind === 'coe' ? 'college of education' : i.kind}</span>
        <p class="small">Fees ${naira(i.fees)}/yr · JAMB cut-off ${i.cutoff} · ${km(here, i)} km from you</p>
        <p class="small">${i.courses.map((c) => h(D.COURSES[c].name)).join(', ')}</p>
        <button class="small" data-act="goto-inst" data-id="${id}">Admission & courses</button>`;
    }
    if (type === 'sec') {
      const sc = E.SEC[id];
      return `<h3>${h(sc.name)}</h3><span class="pill">${sc.tier}</span><p>${h(sc.blurb)}</p><p class="small">Fees ${naira(sc.fees)}/yr${sc.gender !== 'any' ? ' · ' + (sc.gender === 'male' ? 'boys only' : 'girls only') : ''}</p>`;
    }
    if (type === 'place') {
      const p = E.PLACE[id];
      let html = `<h3>${M.KIND_ICON[p.kind]} ${h(p.name)}</h3><p>${h(p.blurb)}</p><p class="small">${h(E.TOWN[p.town].name)} · ${km(here, p)} km from you${p.fee ? ' · entry/fee ' + naira(p.fee) : ''}</p>`;
      if (E.placeVisitable(p)) {
        const done = S.yearActs['visit-' + id];
        html += done ? '<span class="pill">Visited this year</span>' : `${transportSelect(p, id)}<br><button class="small" data-act="visit" data-id="${id}">Go now</button>`;
      }
      const jobs = D.JOBS.filter((j) => j.place === id);
      if (jobs.length) {
        html += '<p><b>Vacancies</b></p>' + jobs.map((j) => {
          const why = E.jobEligibility(S, j.id);
          return `<div class="small">${h(j.title)} — ${naira(j.salary)}/mo ${why ? `<span class="req">(${h(why)})</span>` : `<button class="small" data-act="apply-job" data-id="${j.id}">Apply</button>`}</div>`;
        }).join('');
      }
      return html;
    }
    return '';
  }

  function closePopups() {
    const btn = document.querySelector('.leaflet-popup-close-button');
    if (btn) btn.click();
  }

  // ---------- modals ----------

  function openModal(html) {
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function showModalForState() {
    if (S.ended) return showEnding();
    const ev = S.events[0];
    if (!ev) return closeModal();
    openModal(`<h2>${h(ev.title)}</h2><p>${h(ev.text)}</p><div class="choices">${ev.choices.map((c, i) => `<button data-act="choose" data-i="${i}">${h(c.label)}</button>`).join('')}</div>`);
  }

  function showEnding() {
    const sum = E.lifeSummary(S);
    const end = S.ended;
    const headline = end.type === 'japa' ? `✈️ ${h(sum.name)} japa'd to ${h(end.dest)} at ${end.age}` : `🕊️ ${h(sum.name)} died at ${end.age}`;
    openModal(`<h2>${headline}</h2>${end.type === 'death' ? `<p class="muted">Cause: ${h(end.cause)}</p>` : ''}
      <dl class="kv"><dt>Net worth</dt><dd>${naira(sum.netWorth)}</dd><dt>Education</dt><dd>${h(sum.education)}</dd><dt>Career</dt><dd>${h(sum.career)}</dd><dt>Children</dt><dd>${sum.children}</dd><dt>Towns lived/visited</dt><dd>${sum.townsVisited}</dd><dt>Karma</dt><dd>${sum.karma}/100</dd></dl>
      <div class="choices"><button data-ui="new">✨ Live a new life</button><button class="secondary" data-ui="close">Look back at this life</button></div>`);
  }

  function showNewGame() {
    const towns = D.TOWNS.slice().sort((a, b) => a.name.localeCompare(b.name));
    openModal(`<h2>✨ A new life in Ogun State</h2>
      <form class="form" id="new-form">
        <div class="seg"><label><input type="radio" name="gender" value="male" checked>👦🏾 Boy</label><label><input type="radio" name="gender" value="female">👧🏾 Girl</label></div>
        <label>First name<input name="first" required maxlength="20" placeholder="e.g. Ayomide"></label>
        <label>Surname<input name="last" required maxlength="20" placeholder="e.g. Odusanya"></label>
        <label>Hometown<select name="town">${towns.map((t) => `<option value="${t.id}" ${t.id === 'abeokuta' ? 'selected' : ''}>${h(t.name)} (${h(E.lgaName(t.lga))})</option>`).join('')}</select></label>
        <label>Family background<select name="wealth"><option value="">🎲 Random</option>${Object.entries(E.WEALTH).map(([k, w]) => `<option value="${k}">${w.label}</option>`).join('')}</select></label>
        <div class="row"><button type="button" class="secondary" data-ui="random-name">🎲 Random name</button><button type="submit" style="flex:1">Be born 👶🏾</button></div>
        ${S ? '<button type="button" class="secondary" data-ui="close">Cancel</button>' : ''}
      </form>`);
    $('#new-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      S = E.newGame({ first: fd.get('first').trim(), last: fd.get('last').trim(), gender: fd.get('gender'), town: fd.get('town'), wealth: fd.get('wealth') || undefined });
      closeModal();
      switchTab('life');
      afterAction();
      if (mapReady) M.focusMe(S);
    });
  }

  function randomName() {
    const f = $('#new-form');
    if (!f) return;
    const g = f.querySelector('input[name=gender]:checked').value;
    const r = (arr) => arr[Math.floor(Math.random() * arr.length)];
    f.first.value = r(D.NAMES[g]);
    f.last.value = r(D.NAMES.surname);
  }

  // ---------- tabs ----------

  function switchTab(name) {
    tab = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'map') {
      if (!mapReady && root.L) {
        M.init($('#map'), popup);
        mapReady = true;
        if (S) { M.updatePlayer(S); M.focusMe(S); }
      } else if (!root.L) {
        $('#map').innerHTML = '<p style="padding:16px">The map library could not load. Check your internet connection and reload.</p>';
      }
      M.invalidate();
    } else {
      renderPanel(name);
    }
    window.scrollTo({ top: 0 });
  }

  // ---------- events ----------

  function handleAct(el) {
    const a = el.dataset.act;
    const d = el.dataset;
    switch (a) {
      case 'choose': {
        const r = E.resolveEvent(S, +d.i);
        save(); render();
        if (S.events.length || S.ended) showModalForState(); else closeModal();
        if (r.msg) toast(r.msg);
        return;
      }
      case 'apply-inst': return result(E.applyTertiary(S, d.inst, d.course, d.mode));
      case 'jamb': return result(E.retakeJamb(S));
      case 'waec': return result(E.resitWaec(S));
      case 'dropout': if (confirm('Really drop out?')) result(E.dropOut(S)); return;
      case 'train': return result(E.startTraining(S, d.id));
      case 'apply-job': closePopups(); return result(E.applyJob(S, d.id));
      case 'quit': if (confirm('Resign from your job?')) result(E.quitJob(S)); return;
      case 'retire': return result(E.retire(S));
      case 'workhard': return result(E.workHard(S));
      case 'raise': return result(E.askRaise(S));
      case 'activity': return result(E.doActivity(S, d.id));
      case 'interact': return result(E.interact(S, d.person, d.action));
      case 'buy': return result(E.buyAsset(S, d.id));
      case 'sell': return result(E.sellAsset(S, d.uid));
      case 'move': return result(E.moveOut(S, $('#move-town').value));
      case 'move-to': closePopups(); return result(E.moveOut(S, d.id));
      case 'movehome': return result(E.moveBackHome(S));
      case 'japa': if (confirm('Leave Nigeria and end this life story?')) result(E.japa(S)); return;
      case 'visit': {
        const sel = document.querySelector(`select[data-mode-for="${d.id}"]`);
        const mode = d.mode || (sel && sel.value) || 'bus';
        closePopups();
        return result(E.visitPlace(S, d.id, mode));
      }
      case 'show-map': switchTab('map'); M.openAt(+d.lat, +d.lng); return;
      case 'goto-inst': closePopups(); ui.edu = { kind: 'all', owner: 'all', q: E.INST[d.id].short }; switchTab('education'); return;
      case 'clear-place': ui.jobs.place = null; renderPanel('career'); return;
    }
  }

  function handleUi(el) {
    switch (el.dataset.ui) {
      case 'save': if (S) exportSave(); return;
      case 'load': $('#load-file').click(); return;
      case 'new': showNewGame(); return;
      case 'close': closeModal(); return;
      case 'random-name': randomName(); return;
    }
  }

  function bind() {
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act],[data-ui],[data-tab]');
      if (!t || t.disabled) return;
      if (t.dataset.tab) return switchTab(t.dataset.tab);
      if (t.dataset.ui) return handleUi(t);
      if (!S) return;
      handleAct(t);
    });

    document.addEventListener('input', (ev) => {
      const f = ev.target.dataset && ev.target.dataset.filter;
      if (!f) return;
      if (f === 'edu-kind') ui.edu.kind = ev.target.value;
      if (f === 'edu-owner') ui.edu.owner = ev.target.value;
      if (f === 'jobs-eligible') ui.jobs.eligibleOnly = ev.target.checked;
      if (f === 'edu-q') {
        ui.edu.q = ev.target.value;
        clearTimeout(bind._t);
        bind._t = setTimeout(() => {
          renderPanel('education');
          const inp = document.querySelector('[data-filter="edu-q"]');
          if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }, 250);
        return;
      }
      renderPanel(tab);
    });

    $('#age-btn').addEventListener('click', () => {
      if (!S || S.ended) return showNewGame();
      if (S.events.length) return showModalForState();
      E.ageUp(S);
      afterAction();
    });

    $('#load-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        S = E.deserialize(await file.text());
        closeModal();
        afterAction();
        toast('Save loaded.', 'good');
      } catch (e) { toast('That file is not a valid OGS Lifestyle save.', 'bad'); }
      ev.target.value = '';
    });

    $('#map-search').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const q = $('#map-q').value.trim();
      const box = $('#search-results');
      if (!q) return;
      box.hidden = false;
      box.innerHTML = '<p class="small muted" style="padding:8px">Searching OpenStreetMap…</p>';
      try {
        const results = await M.search(q);
        if (!results.length) { box.innerHTML = '<p class="small muted" style="padding:8px">No places found in Ogun State.</p>'; return; }
        box.innerHTML = results.map((r, i) => `<button data-sr="${i}">${h(r.name)}</button>`).join('');
        box.querySelectorAll('[data-sr]').forEach((b) => b.addEventListener('click', () => { M.showSearchResult(results[+b.dataset.sr]); box.hidden = true; }));
      } catch (e) {
        box.innerHTML = '<p class="small muted" style="padding:8px">Search is unavailable right now.</p>';
      }
    });

    $('#live-btn').addEventListener('click', async () => {
      const btn = $('#live-btn');
      btn.disabled = true;
      btn.textContent = '📡 Loading…';
      try { const r = await M.loadLive(); toast(r.msg, r.ok ? 'good' : 'bad'); } catch (e) { toast('Could not reach OpenStreetMap. Check your connection.', 'bad'); }
      btn.disabled = false;
      btn.textContent = '📡 Live OSM places';
    });

    $('#me-btn').addEventListener('click', () => { if (S && mapReady) M.focusMe(S); });
  }

  // ---------- boot ----------

  function boot() {
    bind();
    S = loadSaved();
    if (S) {
      render();
      if (S.events.length || S.ended) showModalForState();
    } else {
      showNewGame();
    }
  }

  // Expose a tiny API for debugging in the console.
  root.OGS.UI = { get state() { return S; }, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
