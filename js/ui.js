/*
 * OGS Lifestyle — UI controller. Renders the game state into the page,
 * drives the real-time day clock and routes clicks (anything with
 * data-act / data-ui / data-tab) to the engine modules.
 */
(function (root) {
  'use strict';
  const D = root.OGS.Data;
  const E = root.OGS.Engine;
  const L = root.OGS.Life;
  const SO = root.OGS.Society;
  const HU = root.OGS.Hustle;
  const AB = root.OGS.AdBoard;
  const ST = root.OGS.Store;
  const M = root.OGS.Map;
  const h = M.escapeHtml;
  const naira = E.naira;
  const SAVE_KEY = 'ogs-lifestyle-v1';
  const TICK_MS = 250;

  let S = null;
  let tab = 'today';
  let mapReady = false;
  let lastMapTown = null;
  let overlayKey = null;
  let adTimer = null;
  const isH = () => !!(S && S.hustle);
  const LIFE_ONLY_TABS = ['education', 'career', 'politics'];
  const HUSTLE_ONLY_TABS = ['hustle', 'store', 'world'];
  const WO = root.OGS.World;
  let worldNear = null;
  let insideName = null; // the building you are inside (3D), if any
  let worldSheet = null;
  const clock = { running: false, speed: 1, acc: 0, saveAcc: 0 };
  const ui = {
    edu: { kind: 'all', owner: 'all', q: '' },
    jobs: { eligibleOnly: false, place: null },
  };

  const $ = (sel) => document.querySelector(sel);

  // Only touch the DOM when the markup actually changed, so buttons
  // are not swapped out from under the player's finger while the clock runs.
  function setHTML(el, html) {
    if (el && el._html !== html) { el.innerHTML = html; el._html = html; }
  }

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
    if (!msg) return;
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + kind;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 3400);
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
  function meter(label, v, color) {
    v = Math.round(v);
    return `<div class="stat"><div class="label"><span>${label}</span><span>${v}%</span></div><div class="bar"><i style="width:${v}%;background:${color || barColor(v)}"></i></div></div>`;
  }
  function mapBtn(lat, lng, label = '🗺️ Map') {
    return `<button class="small secondary" data-act="show-map" data-lat="${lat}" data-lng="${lng}">${label}</button>`;
  }
  function hrs(n) { return n >= 1 ? `${n}h` : `${Math.round(n * 60)}m`; }

  function stageLabel() {
    const c = S.edu.current;
    if (!c) return S.edu.stage === 'none' ? 'Not yet in school' : 'Not in school';
    if (c.kind === 'primary') return `Primary ${c.year}`;
    if (c.kind === 'secondary') return E.SEC_YEARS[c.year - 1];
    return `${c.level} year ${c.year}/${c.years}`;
  }

  function actionButtons(list) {
    return list.map((a) => `<button class="act" data-act="do" data-id="${a.id}" ${a.why ? `disabled title="${h(a.why)}"` : ''}>
      <span class="act-icon">${a.icon}</span><span class="act-name">${h(a.name)}</span>
      <span class="act-meta">${a.why ? h(a.why) : `${hrs(a.hours)}${a.cost ? ' · ' + naira(a.cost) : ''}`}</span></button>`).join('');
  }

  // ---------- render ----------

  function render() {
    if (!S) return;
    const t = E.TOWN[S.town];
    const st = S.stats;
    applyModeTabs();
    if (isH()) {
      const lv = HU.levelInfo(S);
      setHTML($('#who'), `<b>${h(S.first)} ${h(S.last)}</b> · ⭐ L${lv.level} ${h(lv.title)} · 📍${h(S.jail ? E.PLACE[S.jail.facility].name : t.name)}`);
      const sp = HU.sapa(S);
      setHTML($('#stats'), `<div class="stat money"><div class="label"><span>Bank balance</span></div><div class="value">${naira(S.money)}</div></div>`
        + meter('❤️ Health', st.health) + meter('😊 Morale', st.happiness) + meter('🔥 Clout', S.hustle.clout, 'var(--brand-2)') + meter(sp >= 70 ? '🪫 Sapa — trek mode!' : '🪫 Sapa meter', sp, sp >= 70 ? 'var(--bad)' : sp >= 40 ? 'var(--accent)' : 'var(--good)'));
    } else {
      setHTML($('#who'), `<b>${h(S.first)} ${h(S.last)}</b> · ${S.age} yrs · 📍${h(S.jail ? E.PLACE[S.jail.facility].name : t.name)}${S.edu.highest !== 'none' ? ' · ' + S.edu.highest : ''}`);
      setHTML($('#stats'), `<div class="stat money"><div class="label"><span>Bank balance</span></div><div class="value">${naira(S.money)}</div></div>`
        + meter('❤️ Health', st.health) + meter('😊 Happiness', st.happiness) + meter('🧠 Smarts', st.smarts) + meter('✨ Looks', st.looks));
    }
    renderClock();
    applyGameShell();
    renderPanel(tab);
    if (tab === 'world') renderWorldHud();
    renderGameHud();
    if (mapReady && lastMapTown !== S.town) { M.updatePlayer(S); lastMapTown = S.town; }
    updateOverlays();
  }

  function applyModeTabs() {
    const hustle = isH();
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.hidden = (hustle && LIFE_ONLY_TABS.includes(b.dataset.tab)) || (!hustle && HUSTLE_ONLY_TABS.includes(b.dataset.tab));
    });
    const cur = document.querySelector(`#tabs button[data-tab="${tab}"]`);
    if (cur && cur.hidden) switchTab('today');
  }

  function updateOverlays() {
    if (!mapReady) return;
    const ads = isH() && !ST.adsRemoved() ? AB.active() : [];
    const key = isH() ? `h${HU.levelInfo(S).level}:${ads.length}` : 'life';
    if (key === overlayKey) return;
    overlayKey = key;
    if (isH()) M.setOverlays(HU.ZONES, (id) => HU.zoneUnlocked(S, id), ads);
    else M.setOverlays([], () => true, []);
  }

  // The same sponsor all game-day, so the banner doesn't flicker.
  function sponsorOfDay() {
    if (ST.adsRemoved()) return null;
    const ads = AB.active();
    return ads.length ? ads[HU.dayKey(S) % ads.length] : null;
  }

  function renderClock() {
    $('#tb-time').textContent = L.timeLabel(S);
    $('#tb-date').textContent = L.dateLabel(S);
    $('#play-btn').textContent = clock.running ? '⏸' : '▶';
    $('#play-btn').classList.toggle('on', clock.running);
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === clock.speed));
    const over = !S.alive || !!S.ended;
    $('#day-btn').disabled = over;
    $('#year-btn').textContent = over ? '✨ New life' : '🎂 Year';
  }

  function renderPanel(name) {
    const fn = { today: renderToday, hustle: renderHustle, store: renderStore, life: renderLife, education: renderEducation, career: renderCareer, people: renderPeople, street: renderStreet, politics: renderPolitics, assets: renderAssets }[name];
    if (fn) setHTML($('#panel-' + name), fn());
  }

  // ----- today -----

  function renderToday() {
    const n = S.needs;
    const groups = {};
    for (const a of L.listActions(S)) {
      if (a.group === 'Street' || a.group === 'Politics') continue;
      (groups[a.group] = groups[a.group] || []).push(a);
    }
    let status;
    if (S.jail) {
      const yrs = (S.jail.daysLeft / E.DAYS_PER_YEAR).toFixed(1);
      status = `<div class="banner bad">⛓️ You are serving time at <b>${h(E.PLACE[S.jail.facility].name)}</b> — ${S.jail.daysLeft} days left (≈${yrs} yrs). Behaviour: ${Math.round(S.jail.behaviour)}/100${S.jail.gang ? ' · 🐍 gang member' : ''}</div>`;
    } else if (isH()) {
      const hu = S.hustle;
      const house = HU.HOUSES[hu.house];
      const rent = HU.weeklyRent(S);
      status = `<div class="banner ${hu.lockedOut ? 'bad' : ''}">${hu.lockedOut ? `🔒 <b>LOCKED OUT</b> of your ${h(house.name)} — you owe ${naira(hu.owed)}. Pay it in Home & Assets.` : `🏠 ${h(house.name)} · ${rent ? `rent ${naira(rent)} due Saturday` : 'you own it — no rent!'}${hu.owed ? ` · <span class="req">owing ${naira(hu.owed)}</span>` : ''}`}${HU.inSapa(S) ? ' · <span class="req">🪫 SAPA: trek only, clubs won\'t let you in</span>' : ''}${S.heat > 20 ? ` · <span class="req">🚨 Police heat ${Math.round(S.heat)}</span>` : ''}</div>`;
      const ad = sponsorOfDay();
      if (ad) status += `<div class="sponsor" style="--ac:${ad.color}"><span class="pill">Sponsored</span> <b>${h(ad.business)}</b> — ${h(ad.tagline)}</div>`;
    } else {
      const where = S.livingWithParents ? `at your parents' house in ${h(E.TOWN[S.homeTown].name)}` : `in your own place in ${h(E.TOWN[S.town].name)}`;
      const bills = L.weeklyBills(S);
      const pay = S.job ? `${naira(L.dailyPay(S))}/day worked` : 'no job';
      status = `<div class="banner">🏠 You live ${where}. Saturday: pay (${pay})${bills ? ` · bills ${naira(bills)}` : ''}${S.heat > 20 ? ` · <span class="req">🚨 Police heat ${Math.round(S.heat)}</span>` : ''}${S.flags.fugitive ? ' · <span class="req">WANTED</span>' : ''}</div>`;
    }
    let html = `<div class="card today-head">
      <div class="row between"><div><div class="big-clock">${L.timeLabel(S)}</div><div class="muted small">${L.dateLabel(S)} · ${S.year} · Age ${S.age}</div></div>
      <label class="switch"><input type="checkbox" data-act="auto" ${S.auto ? 'checked' : ''}> <span>🤖 Auto-routine</span></label></div>
      <div class="needs">${meter('🍲 Hunger', n.hunger)}${meter('⚡ Energy', n.energy)}${meter('🚿 Hygiene', n.hygiene)}${meter('🎮 Fun', n.fun)}${meter('💬 Social', n.social)}</div>
      <p class="small muted" style="margin:8px 0 0">${S.auto ? 'Auto-routine is ON: press ▶ and your character eats, sleeps, goes to school/work by themself. You can still do anything yourself.' : 'Auto-routine is OFF: the clock runs and you decide everything. Let your needs hit zero and you suffer.'}</p></div>
      ${status}`;
    const order = Object.keys(groups).sort((a, b) => (b === 'Hustle') - (a === 'Hustle'));
    for (const g of order) {
      html += `<h2>${g === 'Hustle' ? '🔥 Hustle' : h(g)}</h2><div class="acts">${actionButtons(groups[g])}</div>`;
      if (g === 'Hustle') {
        const why = HU.canDouble(S);
        html += `<div class="row" style="margin-top:8px"><button class="small secondary" data-act="watch-ad" ${why ? `disabled title="${h(why)}"` : ''}>📺 Watch ad: double today's hustle${why ? '' : ` (+${naira(S.hustle.lastEarn.amount)})`}</button><button class="small secondary" data-tab="hustle">More hustle details →</button></div>`;
      }
    }
    if (!S.jail) html += `<h2>Go out</h2><div class="row"><button class="secondary" data-tab="map">🗺️ Visit places on the map</button><button class="secondary" data-tab="street">🦹 The streets</button>${isH() ? '' : '<button class="secondary" data-tab="politics">🗳️ Politics</button>'}</div>`;
    // Today's diary
    const todays = [];
    for (let i = S.log.length - 1; i >= 0 && todays.length < 8; i--) { if (S.log[i].kind === 'year') break; todays.push(S.log[i]); }
    if (todays.length) html += '<h2>Recent</h2>' + todays.map((l) => `<div class="log-item ${l.kind}">${h(l.text)}</div>`).join('');
    return html;
  }

  // ----- 2D world -----

  const worldHooks = {
    state: () => S,
    ads: () => (ST.adsRemoved() ? [] : AB.active()),
    near: (p) => { worldNear = p; if (!p) worldSheet = null; renderWorldHud(); },
    enter: () => {
      if (!worldNear || modalOpen()) return;
      const w = window.__ogs3d;
      if (viewMode === '3d' && w && w.hasInterior(worldNear.id) && !w.insideId()) { if (worldHooks.tryEnter(worldNear.id)) w.enterBuilding(worldNear.id); return; }
      worldSheet = worldNear; renderWorldHud();
    },
    // Walking into a building: the landlord's padlock is the only thing that stops you.
    tryEnter: (id) => {
      if (worldHooks.blocked()) return false;
      if (id === 'home' && S.hustle && S.hustle.lockedOut) {
        toast('🔒 Your landlord locked the door. Pay your rent to get back in.', 'bad');
        worldSheet = WO.PLACES.find((p) => p.id === 'home'); renderWorldHud();
        return false;
      }
      return true;
    },
    inside: (name) => { insideName = name; worldSheet = null; renderWorldHud(); },
    blocked: () => modalOpen() || !!worldSheet || phone.open || !!(S && S.events.length),
  };

  function renderWorldHud() {
    if (!S) return;
    const n = S.needs;
    setHTML($('#world-needs'), meter('🍲', n.hunger) + meter('⚡', n.energy) + meter('🚿', n.hygiene) + meter('🎮', n.fun) + meter('💬', n.social));
    const prompt = $('#world-prompt');
    prompt.hidden = !worldNear || !!worldSheet;
    if (worldNear) {
      const canGoIn = !worldNear.icon && viewMode === '3d' && window.__ogs3d && window.__ogs3d.hasInterior(worldNear.id) && !insideName;
      prompt.textContent = `${worldNear.icon || '🚪'} ${canGoIn ? 'Enter ' : ''}${worldNear.name}`;
    }
    const leave = $('#world-leave');
    leave.hidden = !insideName || viewMode !== '3d' || !!worldSheet;
    if (insideName) { leave.textContent = '🚪 Leave'; leave.title = `Leave ${insideName}`; }
    const sheet = $('#world-sheet');
    sheet.hidden = !worldSheet;
    if (worldSheet && worldSheet.id === '__people') showPeopleNearby();
    else if (worldSheet) setHTML(sheet, placeSheet(worldSheet));
  }

  function placeSheet(p) {
    const acts = L.listActions(S).filter((a) => p.actions.includes(a.id));
    const order = (a) => p.actions.indexOf(a.id);
    acts.sort((a, b) => order(a) - order(b));
    const hu = S.hustle || {};
    let extra = '';
    if (p.extra === 'home' && hu.owed) extra = `<p class="req">${hu.lockedOut ? '🔒 You are locked out! ' : ''}You owe ${naira(hu.owed)} rent.</p><button class="small" data-act="arrears">Pay ${naira(hu.owed)}</button>`;
    if (p.extra === 'houses') extra = `<p class="small">You live in: <b>${h(HU.HOUSES[hu.house].name)}</b>.</p><button class="small" data-tab="assets">See houses & land</button>`;
    if (p.extra === 'bike') extra = E.hasAssetKind(S, 'motorbike') ? '<p class="small">You ride your own bike. 💪</p>' : `<button class="small secondary" data-act="buy" data-id="motorbike" ${S.money < E.ASSET.motorbike.price ? 'disabled' : ''}>Buy your own bike (${naira(E.ASSET.motorbike.price)})</button>`;
    if (p.extra === 'owambe') extra = `<p class="small">The next owambe is on <b>Saturday</b>${S.clock.dow === 5 ? ' — that\'s today!' : ''}. ${hu.drip && hu.drip.includes('aso-oke') ? 'Your aso-oke is ready. 🔥' : 'Buy aso-oke in the Hustle tab to look the part.'}</p>`;
    if (p.extra === 'trace') extra = `<p class="small">${hu.impound ? `🚫 Your bike is impounded for ${hu.impound} more day(s).` : 'You have nothing impounded. Keep it that way!'}</p>`;
    return `<div class="row between"><h3 style="margin:0">${h(p.name)}</h3><button class="small secondary" data-ui="world-close">✕ Leave</button></div>
      <p class="small muted">${h(p.blurb)}</p>${acts.length ? `<div class="acts">${actionButtons(acts)}</div>` : ''}${extra}`;
  }

  let viewMode = (() => { try { return localStorage.getItem('ogs-view') || '3d'; } catch (e) { return '3d'; } })();
  let w3d = null; // the 3D module, loaded on demand

  function load3D() {
    if (!w3d) w3d = import(new URL('js/world3d.js', document.baseURI).href).then((m) => { window.__ogs3d = m; return m; });
    return w3d;
  }

  function pauseWorlds() {
    if (WO && WO.isMounted()) WO.pause();
    if (w3d) w3d.then((m) => m.isMounted() && m.pause()).catch(() => {});
  }

  function openWorld() {
    if (!WO) return;
    WO.bindJoystick($('#joystick'));
    $('#view-2d').classList.toggle('on', viewMode === '2d');
    $('#view-3d').classList.toggle('on', viewMode === '3d');
    $('#world').hidden = viewMode !== '2d';
    $('#world3d').hidden = viewMode !== '3d';
    worldNear = null; worldSheet = null;
    pauseWorlds();
    if (viewMode === '3d') {
      const el = $('#world3d');
      load3D()
        .then((m) => (m.isMounted() ? m.resume() : m.mount(el, worldHooks)))
        .then(() => { const l = el.querySelector('.world-loading'); if (l) l.remove(); })
        .catch((e) => { console.error(e); el.innerHTML = '<p class="world-loading">Could not load the 3D engine. Check your internet connection, or switch to 2D.</p>'; });
      return;
    }
    if (WO.isMounted()) { WO.resume(); return; }
    WO.mount($('#world'), $('#joystick'), worldHooks)
      .then(() => { const l = $('#world').querySelector('.world-loading'); if (l) l.remove(); })
      .catch(() => { $('#world').innerHTML = '<p class="world-loading">Could not load the 2D engine. Check your internet connection and try again.</p>'; });
  }

  function setView(mode) {
    viewMode = mode;
    try { localStorage.setItem('ogs-view', mode); } catch (e) { /* ignore */ }
    openWorld();
  }

  // ===================== Game screen: HUD + Phone (Hustle Mode) =====================

  const phone = { open: false, app: null, thread: null };
  let classicView = false;

  const APPS = [
    { id: 'jobs', icon: '💼', name: 'Jobs', ac: '#2c3e50' },
    { id: 'bank', icon: '🏦', name: 'Bank', ac: '#0b6e4f' },
    { id: 'messages', icon: '💬', name: 'Messages', ac: '#25a35a' },
    { id: 'chopnow', icon: '🍔', name: 'ChopNow', ac: '#e67e22' },
    { id: 'goride', icon: '🚕', name: 'GoRide', ac: '#f1c40f' },
    { id: 'houses', icon: '🏠', name: 'Houses', ac: '#8e5a2b' },
    { id: 'cars', icon: '🚗', name: 'Cars', ac: '#c0392b' },
    { id: 'shop', icon: '🛍️', name: 'Shop', ac: '#8e44ad' },
    { id: 'social', icon: '📸', name: 'SocialGram', ac: '#d6249f' },
    { id: 'contacts', icon: '👥', name: 'Contacts', ac: '#2980b9' },
    { id: 'bet', icon: '🎰', name: 'SureOdds', ac: '#16a085' },
    { id: 'street', icon: '🦹', name: 'Street', ac: '#34495e' },
    { id: 'me', icon: '📊', name: 'Me', ac: '#23408e' },
    { id: 'news', icon: '📰', name: 'My Story', ac: '#7f8c8d' },
    { id: 'store', icon: '💎', name: 'Store', ac: '#6c3483' },
    { id: 'settings', icon: '⚙️', name: 'Settings', ac: '#555' },
  ];
  const NEED_ICONS = [['hunger', '🍲'], ['energy', '⚡'], ['hygiene', '🚿'], ['bladder', '🚽'], ['fun', '🎮'], ['social', '💬']];

  function inGame() { return isH() && !classicView; }

  function applyGameShell() {
    const g = inGame();
    document.body.classList.toggle('game', g);
    $('#hud').hidden = !g;
    $('#back-to-game').hidden = !(isH() && classicView);
    if (!g && phone.open) closePhone();
  }

  function renderGameHud() {
    if (!S || !inGame()) return;
    const lv = HU.levelInfo(S);
    $('#hud-avatar').textContent = S.gender === 'female' ? '🙋🏾‍♀️' : '🙋🏾‍♂️';
    $('#hud-name').textContent = S.first;
    $('#hud-level').textContent = `⭐ ${lv.level} · ${lv.title}`;
    const cash = $('#hud-cash');
    cash.textContent = naira(S.money);
    cash.classList.toggle('low', HU.inSapa(S));
    $('#hud-clock').textContent = L.timeLabel(S);
    $('#hud-day').textContent = `${L.DOW[S.clock.dow]} · Day ${S.clock.day}`;
    $('#hud-play').textContent = clock.running ? '⏸' : '▶';
    $('#hud-play').classList.toggle('on', clock.running);
    $('#hud-speed').textContent = clock.speed + '×';
    setHTML($('#hud-needs'), NEED_ICONS.map(([k, ic]) => {
      const v = Math.round(S.needs[k] ?? 100);
      const c = v >= 60 ? '#2ecc71' : v >= 30 ? '#f1c40f' : '#e74c3c';
      return `<div class="need ${v < 20 ? 'warn' : ''}" style="--v:${v};--c:${c}" title="${k} ${v}%"><span>${ic}</span></div>`;
    }).join(''));
    // Context buttons: the things you most likely want right now.
    const acts = Object.fromEntries(L.listActions(S).map((a) => [a.id, a]));
    const ok = (id) => acts[id] && !acts[id].why;
    const btns = [];
    if (ok('work')) btns.push(`<button class="hud-action work" data-act="do" data-id="work">💼 Go to work</button>`);
    const focus = { okada: 'okada-ride', adire: S.hustle.adire > 0 ? 'adire-local' : 'adire-buy', influencer: 'content-skit' }[S.hustle.focus];
    if (focus && ok(focus)) btns.push(`<button class="hud-action" data-act="do" data-id="${focus}">${acts[focus].icon} ${h(acts[focus].name.replace(/\(.*\)/, '').trim())}</button>`);
    else if (!S.hustle.focus && !S.job) btns.push('<button class="hud-action" data-ui="app" data-app="jobs">🔥 Find a hustle</button>');
    if (S.needs.bladder < 35 && (ok('toilet') || ok('public-toilet'))) btns.push(`<button class="hud-action" data-act="do" data-id="${ok('toilet') ? 'toilet' : 'public-toilet'}">🚽 Toilet</button>`);
    if (S.needs.hunger < 35 && ok('order-food')) btns.push('<button class="hud-action" data-act="do" data-id="order-food">🛵 Order food</button>');
    if (S.needs.energy < 25 || L.hour(S) >= 22) { if (ok('sleep')) btns.push('<button class="hud-action" data-act="do" data-id="sleep">🛏️ Sleep</button>'); else if (ok('nap')) btns.push('<button class="hud-action" data-act="do" data-id="nap">😪 Nap</button>'); }
    setHTML($('#hud-actions'), btns.slice(0, 3).join(''));
    const n = HU.unread(S);
    for (const id of ['#phone-badge', '#msg-badge']) { const b = $(id); b.hidden = !n; b.textContent = n; }
    if (phone.open) renderPhone();
  }

  function openPhone(app = null) {
    phone.open = true; phone.app = app; phone.thread = null;
    if (worldSheet) { worldSheet = null; $('#world-sheet').hidden = true; }
    $('#phone').hidden = false;
    renderPhone();
  }
  function closePhone() { phone.open = false; $('#phone').hidden = true; }

  function phoneHead(title, ac) {
    return `<div class="ph-head" style="--ac:${ac}"><button data-ui="ph-back">◀</button><h2>${title}</h2></div>`;
  }

  function renderPhone() {
    if (!S || !phone.open) return;
    $('#ph-time').textContent = L.timeLabel(S);
    const scr = $('#phone-screen');
    scr.classList.toggle('ph-home', !phone.app);
    if (!phone.app) {
      const lv = HU.levelInfo(S);
      const n = HU.unread(S);
      setHTML(scr, `<div class="ph-greet"><b>${L.timeLabel(S)}</b><span>${L.DOW[S.clock.dow]}, Day ${S.clock.day} · ${S.year} · ⭐ ${h(lv.title)}</span></div>
        <div class="ph-grid">${APPS.map((a) => `<button class="ph-app" data-ui="app" data-app="${a.id}"><i style="--ac:${a.ac}">${a.icon}</i>${h(a.name)}${a.id === 'messages' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</div>`);
      return;
    }
    const app = APPS.find((a) => a.id === phone.app) || APPS[0];
    setHTML(scr, phoneHead(`${app.icon} ${h(app.name)}`, app.ac) + (APP_VIEWS[app.id] || (() => ''))());
  }

  const listActs = (ids) => { const all = Object.fromEntries(L.listActions(S).map((a) => [a.id, a])); return actionButtons(ids.map((i) => all[i]).filter(Boolean)); };

  const APP_VIEWS = {
    jobs() {
      const why = HU.canDouble(S);
      let html = '';
      if (S.job) html += `<div class="ph-card"><b>${h(S.job.title)}</b><br><span class="small muted">${h(S.job.employer)} · ${naira(S.job.salary)}/month · ${naira(L.dailyPay(S))} per day you show up</span><div class="acts" style="margin-top:8px">${listActs(['work', 'overtime'])}</div></div>`;
      html += `<h2>🔥 Hustles</h2><div class="acts">${listActs(['adire-buy', 'adire-local', 'adire-lagos', 'okada-ride', 'content-olumo', 'content-skit', 'content-adire', 'hustle'])}</div>
        <div class="ph-row"><button class="small" data-act="watch-ad" ${why ? `disabled title="${h(why)}"` : ''}>📺 Watch ad: double today's hustle</button></div>
        <p class="small muted">Adire today: buy ${naira(HU.adirePrices(S).buy)} · Kuto ${naira(HU.adirePrices(S).local)} · Lagos ${naira(HU.adirePrices(S).lagos)} · stock ${S.hustle.adire}</p>`;
      return html + renderCareer();
    },
    bank() {
      const b = HU.bank(S);
      const lim = HU.loanLimit(S);
      const tx = S.log.filter((l) => l.kind === 'money').slice(-15).reverse();
      return `<div class="ph-card"><span class="small muted">Account balance</span><div class="ph-big">${naira(S.money)}</div>
          <span class="small muted">Savings: <b>${naira(b.savings)}</b> (1% weekly interest)</span>
          <div class="ph-row"><button class="small" data-ui="bank" data-op="deposit" data-amt="10000">Save ₦10k</button><button class="small" data-ui="bank" data-op="deposit" data-amt="50000">Save ₦50k</button><button class="small secondary" data-ui="bank" data-op="withdraw" data-amt="999999999">Withdraw all</button></div></div>
        <div class="ph-card"><b>Loan</b><br>${b.loan ? `<span class="req">You owe ${naira(b.loan)} · ${naira(b.weekly)} due every Saturday</span>
          <div class="ph-row"><button class="small" data-ui="bank" data-op="repay" data-amt="${b.weekly}">Repay ${naira(b.weekly)}</button><button class="small secondary" data-ui="bank" data-op="repay" data-amt="${b.loan}">Repay all</button></div>`
          : `<span class="small muted">Borrow up to ${naira(lim)} (20% interest, 6 weekly repayments). Your limit grows with your level.</span>
          <div class="ph-row">${[0.25, 0.5, 1].map((f) => `<button class="small" data-ui="bank" data-op="loan" data-amt="${Math.round(lim * f / 1000) * 1000}">Borrow ${naira(Math.round(lim * f / 1000) * 1000)}</button>`).join('')}</div>`}</div>
        <h2>Transactions</h2>${tx.length ? tx.map((l) => `<div class="log-item money">${h(l.text)}</div>`).join('') : '<p class="muted">No transactions yet.</p>'}`;
    },
    messages() {
      const inbox = S.hustle.inbox || [];
      if (phone.thread) {
        HU.markRead(S, phone.thread);
        const msgs = inbox.filter((m) => m.from === phone.thread);
        return `<p><button class="small secondary" data-ui="ph-thread" data-from="">← All chats</button></p><h2>${h(phone.thread)}</h2>
          <div class="chat">${msgs.map((m) => `<div class="bubble">${h(m.text)}<small>Day ${m.day % E.DAYS_PER_YEAR || E.DAYS_PER_YEAR} · ${String(Math.floor(m.time / 60) % 24).padStart(2, '0')}:${String(Math.floor(m.time % 60)).padStart(2, '0')}</small></div>`).join('')}</div>`;
      }
      const threads = [];
      for (let i = inbox.length - 1; i >= 0; i--) { const m = inbox[i]; if (!threads.some((t) => t.from === m.from)) threads.push({ from: m.from, last: m, unread: inbox.filter((x) => x.from === m.from && !x.read).length }); }
      return threads.length ? `<div class="ph-list">${threads.map((t) => `<button class="ph-item" data-ui="ph-thread" data-from="${h(t.from)}"><span><b>${h(t.from)}</b><small>${h(t.last.text.slice(0, 60))}${t.last.text.length > 60 ? '…' : ''}</small></span>${t.unread ? `<span class="badge" style="position:static">${t.unread}</span>` : ''}</button>`).join('')}</div>` : '<p class="muted">No messages yet.</p>';
    },
    chopnow() {
      return `<p class="small muted">Food delivered wherever you are. Hunger: ${Math.round(S.needs.hunger)}%</p><div class="acts">${listActs(['order-food', 'order-feast', 'street-food', 'lafun', 'ikokore', 'ofada', 'buka', 'cook', 'beg-food'])}</div>`;
    },
    goride() {
      const here = window.__ogs3d;
      const places = here ? here.placesList() : [];
      if (!places.length) return '<p class="muted">Open the 3D town to use GoRide.</p>';
      return `<p class="small muted">Book a ride to anywhere in Abeokuta. Faster than trekking!</p><div class="ph-list">${places.map((p) => {
        const def = WO.PLACES.find((x) => x.id === p.id);
        const dist = here.distanceTo(p.id);
        const fare = HU.rideFare(dist);
        return `<button class="ph-item" data-ui="ride" data-id="${p.id}" ${dist < 6 ? 'disabled' : ''}><span><b>${h(def ? def.name : p.id)}</b><small>${h(p.road)} · ${Math.round(dist)} m away</small></span><b>${dist < 6 ? 'Here' : naira(fare)}</b></button>`;
      }).join('')}</div>`;
    },
    houses() { return renderHustleHome(); },
    cars() {
      const kinds = ['motorbike', 'keke', 'car'];
      const own = S.assets.filter((a) => kinds.includes(E.ASSET[a.id].kind));
      return `${own.length ? '<h2>Your garage</h2><div class="ph-card">' + own.map((a) => `<div class="prog"><span><b>${h(E.ASSET[a.id].name)}</b><br><span class="small muted">Worth ${naira(a.value)}</span></span><button class="small secondary" data-act="sell" data-uid="${a.uid}">Sell</button></div>`).join('') + '</div>' : ''}
        <h2>Dealership</h2>${D.ASSETS.filter((a) => kinds.includes(a.kind)).map((a) => `<div class="ph-card"><b>${h(a.name)}</b><br><span class="ph-big" style="font-size:20px">${naira(a.price)}</span>${a.clout ? `<span class="small muted"> · clout +${a.clout}</span>` : ''}<div class="ph-row"><button class="small" data-act="buy" data-id="${a.id}" ${S.money < a.price ? 'disabled' : ''}>Buy</button></div></div>`).join('')}`;
    },
    shop() {
      const hu = S.hustle;
      return `<h2>👔 Drip</h2>${HU.DRIP.map((d) => `<div class="ph-card"><b>${h(d.name)}</b> <span class="small muted">· clout +${d.clout}</span><div class="ph-row"><b>${naira(d.price)}</b>${hu.drip.includes(d.id) ? '<span class="pill ok">Owned</span>' : `<button class="small" data-act="drip" data-id="${d.id}" ${S.money < d.price ? 'disabled' : ''}>Buy</button>`}</div></div>`).join('')}
        <h2>📱 Gadgets & property</h2>${D.ASSETS.filter((a) => ['phone', 'generator', 'land', 'house'].includes(a.kind)).map((a) => `<div class="ph-card"><b>${h(a.name)}</b><div class="ph-row"><b>${naira(a.price)}</b><button class="small" data-act="buy" data-id="${a.id}" ${S.money < a.price ? 'disabled' : ''}>Buy</button></div></div>`).join('')}`;
    },
    social() {
      const hu = S.hustle;
      return `<div class="ph-card" style="text-align:center"><div class="ph-big">${hu.followers.toLocaleString('en-US')}</div><span class="small muted">followers · clout ${Math.round(hu.clout)}</span>
        <p class="small">${hu.followers >= 1000 ? '💰 Brand deals pay you every Saturday.' : `Reach 1,000 followers to unlock weekly brand deals (${(1000 - hu.followers).toLocaleString('en-US')} to go).`}</p></div>
        <div class="acts">${listActs(['content-olumo', 'content-skit', 'content-adire', 'phone'])}</div>`;
    },
    contacts() { return renderPeople(); },
    bet() {
      const tickets = [[2, 1000], [2, 5000], [5, 2000], [5, 10000], [20, 1000], [20, 5000]];
      return `<div class="ph-card"><b>⚽ Today's matches</b><p class="small muted">Pick a ticket. Higher odds = bigger win, smaller chance. 18+ only. Bet responsibly.</p></div>
        ${tickets.map(([o, st]) => `<div class="ph-card"><div class="ph-row" style="justify-content:space-between;align-items:center;margin:0"><span><b>${o} odds</b><br><span class="small muted">Stake ${naira(st)} → win ${naira(st * o)}</span></span><button class="small" data-ui="bet" data-odds="${o}" data-stake="${st}" ${S.money < st || S.age < 18 ? 'disabled' : ''}>Place bet</button></div></div>`).join('')}`;
    },
    street() { return renderStreet(); },
    me() { return renderHustle(); },
    news() { return renderLife(); },
    store() { return renderStore(); },
    settings() {
      return `<div class="ph-card"><label class="switch"><input type="checkbox" data-act="auto" ${S.auto ? 'checked' : ''}> <span>🤖 Auto-routine (eat, sleep & hustle by yourself)</span></label></div>
        <div class="ph-card"><b>View</b><div class="ph-row"><button class="small ${viewMode === '3d' ? '' : 'secondary'}" data-ui="view-3d">3D</button><button class="small ${viewMode === '2d' ? '' : 'secondary'}" data-ui="view-2d">2D</button><button class="small secondary" data-ui="classic">Classic menus & Ogun map</button></div></div>
        <div class="ph-card"><b>Game</b><div class="ph-row"><button class="small" data-ui="save">💾 Export save</button><button class="small secondary" data-ui="load">📂 Import save</button><button class="small danger" data-ui="new">✨ New life</button></div></div>
        <p class="small muted">Rent every Saturday. Keep your needs up. From sapa to stardom!</p>`;
    },
  };

  function showPeopleNearby() {
    const w = window.__ogs3d;
    const people = w ? w.nearbyPeople() : [];
    worldSheet = { id: '__people', name: 'People nearby', actions: [], blurb: '' };
    $('#world-sheet').hidden = false;
    setHTML($('#world-sheet'), `<div class="row between"><h3 style="margin:0">👥 People nearby</h3><button class="small secondary" data-ui="world-close">✕ Close</button></div>
      ${people.length ? people.map((p) => `<div class="prog"><span>${p.female ? '👩🏾' : '👨🏾'} <b>${h(p.name)}</b></span><span class="row"><button class="small" data-ui="befriend" data-name="${h(p.name)}" data-g="${p.female ? 'female' : 'male'}">Gist & befriend</button></span></div>`).join('') : '<p class="muted">Nobody close by. Walk up to someone on the street first.</p>'}`);
  }

  // Birth lottery: Nepo, LAPO or Village.
  function lottery(base, village, done) {
    const keys = Object.keys(HU.STARTS);
    const roll = Math.random();
    const pickKey = roll < 0.25 ? 'nepo' : roll < 0.7 ? 'lapo' : 'village';
    openModal(`<h2>🎲 Birth lottery</h2><div class="lottery"><div class="spin" id="lot-emoji">🎲</div><div class="lname" id="lot-name">…</div><p id="lot-desc" class="muted"></p></div><div class="choices"><button id="lot-go" disabled>Spinning…</button></div>`);
    let i = 0;
    const t = setInterval(() => {
      const k = keys[i++ % keys.length];
      $('#lot-emoji').textContent = HU.STARTS[k].emoji; $('#lot-name').textContent = HU.STARTS[k].label;
    }, 120);
    setTimeout(() => {
      clearInterval(t);
      const st = HU.STARTS[pickKey];
      $('#lot-emoji').textContent = st.emoji; $('#lot-name').textContent = st.label; $('#lot-desc').textContent = st.desc;
      const go = $('#lot-go'); go.disabled = false; go.textContent = 'Start my life in Abeokuta 🚀';
      go.addEventListener('click', () => done(HU.newHustleGame({ ...base, village, start: pickKey })));
    }, 2200);
  }

  // ----- hustle -----

  function renderHustle() {
    if (!isH()) return '';
    const hu = S.hustle;
    const lv = HU.levelInfo(S);
    const p = HU.adirePrices(S);
    const acts = Object.fromEntries(L.listActions(S).map((a) => [a.id, a]));
    const pick = (...ids) => actionButtons(ids.map((id) => acts[id]).filter(Boolean));
    const pct = Math.round(lv.progress * 100);
    let html = `<div class="card"><div class="row between"><h2 style="margin:0">⭐ Level ${lv.level}: ${h(lv.title)}</h2><span class="pill">Clout ${Math.round(hu.clout)} · ${hu.followers.toLocaleString('en-US')} followers</span></div>
      <p class="small muted">Clout + Money = Your Level. Score ${naira(lv.score)}${lv.next ? ` · next: <b>${h(lv.nextTitle)}</b> at ${naira(lv.next)}` : ' · max level!'}</p>
      <div class="bar"><i style="width:${pct}%;background:var(--brand-2)"></i></div>
      <div class="zones">${HU.ZONES.map((z) => { const open = HU.zoneUnlocked(S, z.id); return `<div class="zone ${open ? '' : 'locked'}" style="--zc:${z.color}"><b>${open ? '🟢' : '🔒'} ${h(z.name)}</b><span>${h(z.theme)} · ${open ? 'open' : 'level ' + z.unlock}</span><small>${h(z.blurb)}</small></div>`; }).join('')}</div></div>`;

    const why = HU.canDouble(S);
    html += `<div class="card row between"><span>📺 <b>Watch an ad to double your last hustle income</b> (once a day).</span><button data-act="watch-ad" ${why ? `disabled title="${h(why)}"` : ''}>${why ? h(why) : `Double +${naira(hu.lastEarn.amount)}`}</button></div>`;

    html += `<div class="grid">
      <div class="card"><h3>🧵 Adire seller</h3><p class="small muted">Buy from the dyers at Itoku, sell around Kuto & Panseke, or carry it to Lagos for the best price.</p>
        <dl class="kv small"><dt>Stock</dt><dd>${hu.adire} piece(s)${hu.adire ? ` (avg cost ${naira(hu.adireCost)})` : ''}</dd><dt>Today at Itoku</dt><dd>${naira(p.buy)}/pc</dd><dt>Kuto/Panseke</dt><dd>${naira(p.local)}/pc</dd><dt>Lagos (Balogun)</dt><dd>${naira(p.lagos)}/pc</dd></dl>
        <div class="acts one">${pick('adire-buy', 'adire-local', 'adire-lagos')}</div></div>
      <div class="card"><h3>🛵 Okada rider</h3><p class="small muted">Rush hours (6–9am, 4–7pm) pay best. Watch out for TRACE and potholes.</p>
        <dl class="kv small"><dt>Bike</dt><dd>${E.hasAssetKind(S, 'motorbike') ? 'Your own Bajaj 💪' : 'Hired (₦3,000 daily balance)'}</dd>${hu.impound ? `<dt>Impounded</dt><dd class="req">${hu.impound} day(s)</dd>` : ''}</dl>
        <div class="acts one">${pick('okada-ride')}</div>
        ${E.hasAssetKind(S, 'motorbike') ? '' : `<button class="small secondary" data-act="buy" data-id="motorbike" ${S.money < E.ASSET.motorbike.price ? 'disabled' : ''}>Buy your own bike (${naira(E.ASSET.motorbike.price)})</button>`}</div>
      <div class="card"><h3>🎥 Influencer / TikToker</h3><p class="small muted">Grow followers; brand deals pay every Saturday from 1,000 followers.</p>
        <dl class="kv small"><dt>Followers</dt><dd>${hu.followers.toLocaleString('en-US')}</dd><dt>Phone</dt><dd>${E.hasAssetKind(S, 'phone') ? '✅' : '❌ buy one in Home & Assets'}</dd></dl>
        <div class="acts one">${pick('content-olumo', 'content-skit', 'content-adire')}</div></div>
    </div>`;

    html += '<h2>👔 Drip</h2><div class="grid">';
    for (const d of HU.DRIP) {
      const own = hu.drip.includes(d.id);
      html += `<div class="card"><h3>${h(d.name)}</h3><p class="small muted">${naira(d.price)} · clout +${d.clout}</p>${own ? '<span class="pill ok">Owned</span>' : `<button class="small" data-act="drip" data-id="${d.id}" ${S.money < d.price ? 'disabled' : ''}>Buy</button>`}</div>`;
    }
    return html + '</div>';
  }

  function renderStore() {
    let html = `<div class="card"><h2 style="margin-top:0">🛍️ Store</h2><p class="small">${ST.available() ? 'Purchases are processed securely by the payment provider.' : '⚠️ Payments are not connected in this version yet, so nothing can be bought or charged. In the Android release these buttons use Google Play Billing.'}</p></div><div class="grid">`;
    for (const p of ST.PRODUCTS) {
      const done = p.removeAds && ST.adsRemoved();
      html += `<div class="card"><h3>${h(p.name)}</h3><p class="small muted">${h(p.blurb)}</p><p><b>${h(p.price)}</b></p>${done ? '<span class="pill ok">Active</span>' : `<button class="small" data-act="store-buy" data-id="${p.id}" ${ST.available() ? '' : 'disabled'}>Buy</button>`}</div>`;
    }
    html += `</div><h2>📢 Ads Board</h2><p class="small muted">These billboards show on the map, in "watch ad" breaks and on the Today screen. ${h(AB.contact)}</p><div class="grid">`;
    for (const a of AB.active()) {
      html += `<div class="card" style="border-top:4px solid ${a.color}"><h3>${h(a.business)}</h3><p class="small">${h(a.tagline)}</p><p class="small muted">Billboard at ${h(a.where)} · until ${h(a.end)}${a.sample ? ' · sample' : ''}</p>${mapBtn(a.lat, a.lng)}</div>`;
    }
    return html + '</div>';
  }

  function showAd() {
    const why = HU.canDouble(S);
    if (why) return toast(why, 'bad');
    const ad = AB.random() || { business: 'OGS Lifestyle', tagline: 'From Sapa to Stardom in the Gateway State', color: '#0b6e4f' };
    let left = 5;
    openModal(`<p class="small muted">Advertisement</p><div class="ad-card" style="--ac:${ad.color}"><h2>📢 ${h(ad.business)}</h2><p>${h(ad.tagline)}</p></div>
      <div class="choices"><button id="ad-claim" data-act="claim-ad" disabled>Reward in ${left}s…</button></div>`);
    clearInterval(adTimer);
    adTimer = setInterval(() => {
      left--;
      const b = $('#ad-claim');
      if (!b) { clearInterval(adTimer); return; }
      if (left <= 0) { clearInterval(adTimer); b.disabled = false; b.textContent = `Claim +${naira(S.hustle.lastEarn.amount)}`; }
      else b.textContent = `Reward in ${left}s…`;
    }, 1000);
  }

  // ----- life -----

  function renderLife() {
    const t = E.TOWN[S.town];
    const job = S.job ? `${h(S.job.title)} · ${h(S.job.employer)} (${naira(S.job.salary)}/mo)` : S.nysc && S.nysc.status === 'serving' ? `NYSC corps member in ${h(S.nysc.state)}` : 'None';
    const home = S.jail ? `⛓️ ${h(E.PLACE[S.jail.facility].name)}` : S.livingWithParents ? `With parents in ${h(E.TOWN[S.homeTown].name)}` : `Own place in ${h(t.name)}`;
    const fam = S.family.politician ? `${E.WEALTH.politician.label} (${h(S.family.politician.title)})` : E.WEALTH[S.family.wealth].label;
    let html = `<div class="card"><div class="row between"><h2 style="margin:0">${h(S.first)} ${h(S.last)}</h2><span class="pill">${S.year}</span></div>
      <dl class="kv" style="margin-top:8px">
        <dt>Age</dt><dd>${S.age}</dd>
        <dt>Family</dt><dd>${fam}</dd>
        <dt>Hometown</dt><dd>${h(E.TOWN[S.homeTown].name)}, ${h(E.lgaName(E.TOWN[S.homeTown].lga))} LGA</dd>
        <dt>Living</dt><dd>${home}</dd>
        <dt>Education</dt><dd>${stageLabel()}${S.edu.current ? ' — ' + h(S.edu.current.name) : ''}</dd>
        <dt>Job</dt><dd>${job}</dd>
        <dt>Politics</dt><dd>${S.politics.office ? h(SO.OFFICE[S.politics.office.id].name) : S.politics.party ? 'Member, ' + h(SO.PARTY[S.politics.party].name) : '—'}</dd>
        <dt>Net worth</dt><dd>${naira(E.netWorth(S))}</dd>
        <dt>Karma</dt><dd>${Math.round(S.karma)}/100</dd>
        <dt>Criminal record</dt><dd>${S.record.length ? S.record.map((r) => `${h(r.crime)} (${r.year})`).join('; ') : 'Clean'}</dd>
        <dt>Towns visited</dt><dd>${S.visited.length} of ${D.TOWNS.length}</dd>
      </dl></div>`;
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
    if (S.jail) return 'You are in prison';
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
      html += `<p><b>${stageLabel()}</b> at ${h(c.name)}</p><p class="small muted">Study effort: ${Math.round(e.effort)}/15 · Days in class this year: ${e.daysAttended || 0}/${E.WORKDAYS_PER_YEAR}. Go to school on weekdays and study to raise your WAEC & JAMB scores.</p>`;
    } else if (c) {
      const inst = E.INST[c.instId];
      const gpa = c.gpN ? (c.gpSum / c.gpN).toFixed(2) : '—';
      html += `<p><b>${h(D.COURSES[c.courseId].name)}</b>${c.mode === 'hnd' ? ' (HND)' : c.mode === 'msc' ? ' (M.Sc)' : ''} at ${h(inst.name)}</p>
        <dl class="kv"><dt>Year</dt><dd>${c.year} of ${c.years}</dd><dt>CGPA so far</dt><dd>${gpa}</dd><dt>Fees</dt><dd>${c.scholarship ? 'Scholarship 🎉' : naira(c.fees) + '/yr'}</dd><dt>Study effort</dt><dd>${Math.round(e.effort)}/15</dd><dt>Lectures attended</dt><dd>${e.daysAttended || 0}/${E.WORKDAYS_PER_YEAR} this year</dd></dl>
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
      html += `<div class="card"><h3>${h(inst.name)}</h3>
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

    html += `<h2>🏫 Notable secondary schools</h2><p class="small muted">You choose one after your Common Entrance exam at age 10.</p><div class="grid">`;
    for (const sc of D.SECONDARY) {
      html += `<div class="card"><h3>${h(sc.name)}</h3><div class="row"><span class="pill">${sc.tier}</span>${sc.gender !== 'any' ? `<span class="pill">${sc.gender === 'male' ? 'boys' : 'girls'}</span>` : ''}</div><p class="small muted">${h(sc.blurb)} · ${naira(sc.fees)}/yr</p>${mapBtn(sc.lat, sc.lng)}</div>`;
    }
    html += '</div>';

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
        <dl class="kv"><dt>Salary</dt><dd>${naira(j.salary)}/month · paid ${naira(L.dailyPay(S))} per day you show up</dd><dt>Years</dt><dd>${j.years}</dd><dt>Attendance</dt><dd>${j.daysWorked || 0}/${E.WORKDAYS_PER_YEAR} days this year</dd><dt>Performance</dt><dd><div class="bar" style="width:160px"><i style="width:${j.perf}%;background:${barColor(j.perf)}"></i></div></dd></dl>
        <div class="row" style="margin-top:8px">
          <button class="small" data-act="workhard" ${S.yearActs.workhard ? 'disabled' : ''}>Work hard this year</button>
          <button class="small secondary" data-act="raise" ${S.yearActs.raise ? 'disabled' : ''}>Ask for a raise</button>
          ${S.age >= 50 ? '<button class="small secondary" data-act="retire">Retire</button>' : ''}
          <button class="small danger" data-act="quit">Resign</button>
        </div>`;
    } else {
      html += `<p>${S.nysc && S.nysc.status === 'serving' ? `You are serving with NYSC in ${h(S.nysc.state)}.` : 'You are not employed.'}${S.pension ? ` Pension: ${naira(S.pension)}/yr.` : ''}</p>`;
    }
    const pp = SO.politicianParent(S);
    if (pp) html += `<p class="small">📞 Your ${pp.role} is <b>${h(pp.title)}</b>. Once a year you can ask ${SO.parentWord(S)} to "make a call" for any job.</p>`;
    if (S.record.length) html += '<p class="small req">Your criminal record makes employers nervous.</p>';
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
      const where = j.institution ? 'Any university' : place ? `${place.name}, ${E.TOWN[place.town].name}` : 'Anywhere (your town)';
      const req = [j.req.level !== 'none' ? j.req.level : 'No certificate', j.req.fields ? j.req.fields.join('/') : '', j.req.nysc ? 'NYSC' : '', j.req.skill ? E.SKILL[j.req.skill].name : '', j.needsAsset ? 'own ' + j.needsAsset : ''].filter(Boolean).join(' · ');
      const applied = S.yearActs['job-' + j.id];
      html += `<div class="card"><h3>${h(j.title)}</h3><p class="small muted">${h(where)}</p>
        <p><b>${naira(j.salary)}</b>/month <span class="small muted">→ ${h(j.levels[j.levels.length - 1])}</span></p>
        <p class="small">${h(req)}</p>${why ? `<p class="req">${h(why)}</p>` : ''}
        <div class="row"><button class="small" data-act="apply-job" data-id="${j.id}" ${why || applied ? 'disabled' : ''}>${applied ? 'Applied this year' : 'Apply'}</button>
        ${pp && why && !S.yearActs.connection ? `<button class="small secondary" data-act="connect" data-id="${j.id}">📞 Call ${SO.parentWord(S)}</button>` : ''}
        ${place ? mapBtn(place.lat, place.lng) : ''}</div></div>`;
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
      ${S.age >= 16 && !E.partner(S) ? `<button class="small" data-act="findlove" ${S.yearActs.findlove ? 'disabled' : ''}>❤️ Find love</button>` : ''}</div><div class="grid" style="margin-top:10px">`;
    const order = ['spouse', 'fiancé(e)', 'partner', 'child', 'mother', 'father', 'sibling'];
    const people = S.relations.slice().sort((a, b) => (b.alive - a.alive) || ((order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99)));
    for (const r of people) {
      const acts = E.interactionsFor(r);
      html += `<div class="card"><div class="row between"><h3>${h(E.fullName(r))}</h3><span class="pill">${h(r.role)}</span></div>
        <p class="small muted">${r.alive ? `Age ${r.age}` : `Died at ${r.age}`}${r.title ? ' · ' + h(r.title) : ''}${r.town ? ' · ' + h(E.TOWN[r.town].name) : ''}</p>
        ${r.alive ? `<div class="bar"><i style="width:${r.closeness}%;background:${barColor(r.closeness)}"></i></div><p class="small muted">Relationship ${Math.round(r.closeness)}%</p>` : ''}
        <div class="row">${acts.map((a) => `<button class="small ${['argue', 'breakup', 'divorce'].includes(a.id) ? 'secondary' : ''}" data-act="interact" data-person="${r.id}" data-action="${a.id}" ${S.yearActs[`rel-${r.id}-${a.id}`] ? 'disabled' : ''}>${h(a.name)}</button>`).join('')}</div></div>`;
    }
    return html + '</div>';
  }

  // ----- street (crime) -----

  function renderStreet() {
    const crimes = L.listActions(S).filter((a) => a.group === 'Street');
    let html = `<div class="card"><h2 style="margin-top:0">🦹 The streets</h2>
      <p class="small">Crime pays… until it doesn't. Every job raises your <b>police heat</b>, which makes the next arrest more likely. Heat cools down by itself over time. If you get caught, you can try to bribe ("settle") the police, call a lawyer, run, or face the court.</p>
      ${meter('🚨 Police heat', S.heat || 0, 'var(--bad)')}
      <dl class="kv" style="margin-top:8px"><dt>Jobs pulled</dt><dd>${S.crimes.done}</dd><dt>Times caught</dt><dd>${S.crimes.caught}</dd><dt>Convictions</dt><dd>${S.record.length}</dd>${S.flags.fugitive ? '<dt>Status</dt><dd class="req">WANTED FUGITIVE</dd>' : ''}${S.flags.areaFriends ? '<dt>Connections</dt><dd>Area boys have your back</dd>' : ''}</dl></div>`;
    if (S.jail) return html + '<p class="muted">You are in prison. Check the Today tab for prison life.</p>';
    html += '<div class="grid">';
    for (const a of crimes) {
      const c = D.CRIMES.find((x) => 'crime-' + x.id === a.id);
      const odds = Math.round(SO.crimeOdds(S, c) * 100);
      html += `<div class="card"><h3>${h(c.name)}</h3>
        <p class="small muted">${c.id === 'embezzle' ? '2–10× your monthly salary' : `${naira(c.reward[0])} – ${naira(c.reward[1])}`} · ${c.hours}h · sentence ${c.years[0]}–${c.years[1]} yrs</p>
        <p class="small">Chance of arrest: <b class="${odds >= 30 ? 'req' : ''}">${odds}%</b></p>
        <button class="small danger" data-act="do" data-id="${a.id}" ${a.why ? 'disabled' : ''}>${a.why ? h(a.why) : 'Do it'}</button></div>`;
    }
    html += '</div>';
    if (S.record.length) html += '<h2>📁 Criminal record</h2><div class="card">' + S.record.map((r) => `<div class="prog"><span>${h(r.crime)}</span><span class="small muted">${r.years} yrs · ${r.year}</span></div>`).join('') + '</div>';
    return html;
  }

  // ----- politics -----

  function renderPolitics() {
    const P = S.politics;
    let html = `<div class="card"><h2 style="margin-top:0">🗳️ Politics</h2>
      ${meter('📣 Popularity', P.popularity)}
      <dl class="kv" style="margin-top:8px">
        <dt>Party</dt><dd>${P.party ? h(SO.PARTY[P.party].name) : 'None'}</dd>
        <dt>Office</dt><dd>${P.office ? `${h(SO.OFFICE[P.office.id].name)} (until ${P.office.until})` : 'None'}</dd>
        <dt>Campaign</dt><dd>${P.candidacy ? `${h(SO.OFFICE[P.candidacy.office].name)} — election ${P.candidacy.year}${P.candidacy.primary ? ' · party candidate ✅' : ''}${P.rigged ? ' · 🪓 thugs hired' : ''}` : '—'}</dd>
        ${S.family.politician ? `<dt>Family</dt><dd>Your ${S.family.politician.role} is ${h(S.family.politician.title)}</dd>` : ''}
        ${S.flags.godfather ? '<dt>Godfather</dt><dd>🎩 Yes, and he will want returns</dd>' : ''}
      </dl>
      <p class="small muted">Local elections (councillor, LG chairman) hold in ${[0, 1, 2, 3].map((i) => S.year + i).find((y) => y % 4 === 1)}, and general elections (Assembly, Reps, Senate, Governor) in ${[0, 1, 2, 3].map((i) => S.year + i).find((y) => y % 4 === 3)}, every 4 years. Results are announced on your next birthday after election year.</p></div>`;

    html += '<h2>Parties</h2><div class="grid">';
    for (const p of D.PARTIES) {
      html += `<div class="card"><h3 style="color:${p.color}">${h(p.name)}</h3>${P.party === p.id ? '<span class="pill ok">Member</span>' : `<button class="small" data-act="join-party" data-id="${p.id}" ${S.age < 18 || S.jail ? 'disabled' : ''}>${P.party ? 'Decamp to this party' : 'Join'} (₦50,000)</button>`}</div>`;
    }
    html += '</div>';

    const acts = L.listActions(S).filter((a) => a.group === 'Politics');
    html += `<h2>Campaign & office</h2>${acts.length ? `<div class="acts">${actionButtons(acts)}</div>` : '<p class="muted">Not available right now.</p>'}`;

    html += '<h2>Run for office</h2><div class="grid">';
    for (const o of D.OFFICES) {
      const why = SO.officeEligibility(S, o.id);
      html += `<div class="card"><h3>${h(o.name)}</h3><p class="small muted">Age ${o.minAge}+ · campaign budget ≈ ${naira(o.cost)} · nomination form ${naira(o.cost * 0.1)}</p>
        <p class="small">Pay & allowances: ${naira(o.salary)}/yr · next election ${SO.nextElection(S, o)}</p>
        ${why ? `<p class="req">${h(why)}</p>` : ''}<button class="small" data-act="declare" data-id="${o.id}" ${why ? 'disabled' : ''}>Declare & buy form</button></div>`;
    }
    return html + '</div>';
  }

  // ----- home & assets -----

  function renderHustleHome() {
    const hu = S.hustle;
    let html = `<h2>🏘️ Your house</h2><div class="card"><p><b>${h(HU.HOUSES[hu.house].name)}</b>${hu.ownsHouse === hu.house ? ' — you own it!' : ` — ${naira(HU.HOUSES[hu.house].weekly)}/week, due every Saturday.`}</p>
      ${hu.owed ? `<p class="req">${hu.lockedOut ? '🔒 Locked out! ' : ''}You owe ${naira(hu.owed)}.</p><button class="small" data-act="arrears">Pay ${naira(hu.owed)} arrears</button>` : ''}</div><div class="grid">`;
    for (const [id, hs] of Object.entries(HU.HOUSES)) {
      const here = hu.house === id;
      html += `<div class="card"><h3>${h(hs.name)}</h3><p class="small muted">${h(hs.blurb)}</p><p class="small">${naira(hs.weekly)}/week · clout +${hs.clout}</p>
        ${here ? '<span class="pill ok">You live here</span>' : `<button class="small" data-act="house-move" data-id="${id}">Rent (${naira(hs.weekly * 3 + hu.owed)} upfront)</button>`}
        ${hs.buy && hu.ownsHouse !== id ? `<button class="small secondary" data-act="house-buy" data-id="${id}" ${S.money < hs.buy ? 'disabled' : ''}>Buy for ${naira(hs.buy)}</button>` : ''}</div>`;
    }
    html += `</div><h2>🏗️ Build your own house</h2><div class="card"><p>Buy land in Obafemi-Owode (${naira(E.ASSET['land-owode'].price)}, in the shop below), then build for ₦10,000,000. Your family back home will finally stop asking "when will you build house?"</p>
      ${hu.houseBuilt ? '<span class="pill ok">House built 🏠</span>' : '<button class="small" data-act="build-house">Build house (₦10,000,000)</button>'}</div>`;
    return html;
  }

  function renderAssets() {
    const towns = D.TOWNS.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (isH()) return renderHustleHome() + renderShop();
    let html = `<h2>🏘️ Housing</h2><div class="card">
      <p>${S.livingWithParents ? `You live with your parents in ${h(E.TOWN[S.homeTown].name)} — free rent!` : `You rent in ${h(E.TOWN[S.town].name)}. Rent, food & bills ≈ ${naira(L.weeklyBills(S))} every Saturday.`}</p>
      <div class="row"><select id="move-town">${towns.map((t) => `<option value="${t.id}" ${t.id === S.town ? 'selected' : ''}>${h(t.name)} — rent ${naira(t.rent)}/yr</option>`).join('')}</select>
      <button class="small" data-act="move" ${S.age < 16 ? 'disabled' : ''}>Move here</button>
      ${!S.livingWithParents ? '<button class="small secondary" data-act="movehome">Move back with parents</button>' : ''}</div></div>`;

    return html + renderShop() + renderJapa();
  }

  function renderShop() {
    let html = '<h2>🏠 What you own</h2>';
    if (!S.assets.length) html += '<p class="muted">Nothing yet.</p>';
    else html += '<div class="card">' + S.assets.map((a) => `<div class="prog"><span><b>${h(E.ASSET[a.id].name)}</b><br><span class="small muted">Worth ${naira(a.value)} · bought ${a.boughtYear}</span></span><button class="small secondary" data-act="sell" data-uid="${a.uid}">Sell (${naira(Math.round(a.value * 0.9))})</button></div>`).join('') + '</div>';
    html += '<h2>🛒 Shop</h2><div class="grid">';
    for (const a of D.ASSETS) {
      const extra = a.rentIncome ? ` · rent income ${naira(a.rentIncome)}/yr` : a.appreciation ? ' · appreciates' : '';
      html += `<div class="card"><h3>${h(a.name)}</h3><p><b>${naira(a.price)}</b><span class="small muted">${extra}</span></p>
        <button class="small" data-act="buy" data-id="${a.id}" ${S.money < a.price || S.age < 16 ? 'disabled' : ''}>Buy</button></div>`;
    }
    html += '</div>';

    return html;
  }

  function renderJapa() {
    let html = '';
    const jr = E.japaRequirement(S);
    html += `<h2>✈️ Japa</h2><div class="card"><p>Relocate abroad and end this life story on a high. Needs proof of funds of ${naira(jr.need)}, a degree/HND (or coding skill) and age 21+. Visa, flights & settling-in cost ₦8,000,000.</p>
      ${jr.ok ? '' : `<p class="req">${h(jr.msg)}</p>`}<button data-act="japa" ${jr.ok ? '' : 'disabled'}>Japa now</button></div>`;
    return html;
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
      return `<h3>${h(S.first)} ${h(S.last)} (you)</h3><p>${S.age} years old, ${S.jail ? 'in prison' : `living in ${h(here.name)}${S.livingWithParents ? ' with your parents' : ''}`}.</p>${S.job ? `<p>${h(S.job.title)} at ${h(S.job.employer)}</p>` : ''}`;
    }
    if (type === 'town') {
      const t = E.TOWN[id];
      const insts = D.INSTITUTIONS.filter((i) => i.town === id).map((i) => i.short);
      return `<h3>${h(t.name)}</h3><span class="pill">${h(E.lgaName(t.lga))} LGA</span><p>${h(t.blurb)}</p>
        <p class="small">Rent ≈ ${naira(t.rent)}/yr · ${km(here, t)} km from you${insts.length ? '<br>Institutions: ' + h(insts.join(', ')) : ''}</p>
        ${isH() ? (HU.ZONE_OF[id] ? `<span class="pill ${HU.zoneUnlocked(S, HU.ZONE_OF[id]) ? 'ok' : 'no'}">${h(HU.ZONES.find((z) => z.id === HU.ZONE_OF[id]).name)}</span>` : '<span class="pill">Future update</span>')
          : id !== S.town || S.livingWithParents ? `<button class="small" data-act="move-to" data-id="${id}" ${S.age < 16 ? 'disabled' : ''}>Move here</button>` : '<span class="pill ok">You live here</span>'}`;
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
      let html = `<h3>${M.KIND_ICON[p.kind] || '📍'} ${h(p.name)}</h3><p>${h(p.blurb)}</p><p class="small">${h(E.TOWN[p.town].name)} · ${km(here, p)} km from you${p.fee ? ' · entry/fee ' + naira(p.fee) : ''}</p>`;
      if (p.kind === 'prison') html += S.jail && S.jail.facility === id ? '<span class="pill no">You are here</span>' : '<p class="small muted">Commit crimes and you may end up here.</p>';
      if (E.placeVisitable(p)) {
        const done = S.dayActs && S.dayActs['visit-' + id];
        html += done ? '<span class="pill">Visited today</span>' : `${transportSelect(p, id)}<br><button class="small" data-act="visit" data-id="${id}">Go now</button>`;
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

  function modalOpen() { return !$('#modal').hidden; }
  function openModal(html) {
    $('#modal-card').innerHTML = html;
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }

  function showModalForState() {
    if (S.ended || !S.alive) return showEnding();
    const ev = S.events[0];
    if (!ev) return closeModal();
    openModal(`<p class="small muted">${L.dateLabel(S)} · ${L.timeLabel(S)}</p><h2>${h(ev.title)}</h2><p>${h(ev.text)}</p><div class="choices">${ev.choices.map((c, i) => `<button data-act="choose" data-i="${i}" ${c.disabled ? `disabled title="${h(c.disabled)}"` : ''}>${h(c.label)}${c.disabled ? `<small class="why">${h(c.disabled)}</small>` : ''}</button>`).join('')}</div>`);
  }

  function showEnding() {
    clock.running = false;
    const sum = E.lifeSummary(S);
    const end = S.ended || { type: 'death', cause: 'unknown', age: S.age };
    const headline = end.type === 'japa' ? `✈️ ${h(sum.name)} left for ${h(end.dest)} at ${end.age}` : `🕊️ ${h(sum.name)} died at ${end.age}`;
    openModal(`<h2>${headline}</h2>${end.type === 'death' ? `<p class="muted">Cause: ${h(end.cause)}</p>` : ''}
      <dl class="kv"><dt>Net worth</dt><dd>${naira(sum.netWorth)}</dd><dt>Education</dt><dd>${h(sum.education)}</dd><dt>Career</dt><dd>${h(sum.career)}</dd><dt>Highest office</dt><dd>${sum.highestOffice ? h(SO.OFFICE[sum.highestOffice].name) : '—'}</dd><dt>Convictions</dt><dd>${sum.convictions}</dd><dt>Children</dt><dd>${sum.children}</dd><dt>Towns lived/visited</dt><dd>${sum.townsVisited}</dd><dt>Karma</dt><dd>${Math.round(sum.karma)}/100</dd></dl>
      <div class="choices"><button data-ui="new">✨ Live a new life</button><button class="secondary" data-ui="close">Look back at this life</button></div>`);
  }

  function showNewGame() {
    clock.running = false;
    const towns = D.TOWNS.slice().sort((a, b) => a.name.localeCompare(b.name));
    const villages = towns.filter((x) => x.id !== 'abeokuta');
    const bg = Object.entries(E.WEALTH);
    openModal(`<h2>✨ A new life in Ogun State</h2>
      <form class="form" id="new-form">
        <div class="seg mode-seg"><label><input type="radio" name="mode" value="hustle" checked>🔥 Hustle Mode</label><label><input type="radio" name="mode" value="life">👶 Life Mode</label></div>
        <p class="small muted" id="mode-desc"></p>
        <div class="seg"><label><input type="radio" name="gender" value="male" checked>👦🏾 Guy</label><label><input type="radio" name="gender" value="female">👧🏾 Babe</label></div>
        <label>First name<input name="first" required maxlength="20" placeholder="e.g. Ayomide"></label>
        <label>Surname<input name="last" required maxlength="20" placeholder="e.g. Odusanya"></label>
        <div id="hustle-fields"><p class="small muted">🎲 Your start is decided by the birth lottery: NEPO, LAPO or VILLAGE. No choosing — fate decides!</p>
          <label>Your village (where your family lives)<select name="village">${villages.map((x) => `<option value="${x.id}" ${x.id === 'ogbere' ? 'selected' : ''}>${h(x.name)} (${h(E.lgaName(x.lga))})</option>`).join('')}</select></label></div>
        <div id="life-fields" hidden>
          <label>Hometown<select name="town">${towns.map((x) => `<option value="${x.id}" ${x.id === 'abeokuta' ? 'selected' : ''}>${h(x.name)} (${h(E.lgaName(x.lga))})</option>`).join('')}</select></label>
          <label>Born into…<select name="wealth" id="bg-select"><option value="">🎲 Let fate decide</option>${bg.map(([k, w]) => `<option value="${k}">${h(w.label)}</option>`).join('')}</select></label>
          <p class="small muted" id="bg-desc">Fate will pick: poor, middle-class, comfortable, rich or a politician's family.</p>
        </div>
        <div class="row"><button type="button" class="secondary" data-ui="random-name">🎲 Random name</button><button type="submit" style="flex:1" id="born-btn">Start the hustle 🚌</button></div>
        ${S ? '<button type="button" class="secondary" data-ui="close">Cancel</button>' : ''}
      </form>`);
    const form = $('#new-form');
    const syncMode = () => {
      const hustle = form.querySelector('input[name=mode]:checked').value === 'hustle';
      $('#hustle-fields').hidden = !hustle;
      $('#life-fields').hidden = hustle;
      $('#born-btn').textContent = hustle ? 'Start the hustle 🚌' : 'Be born 👶🏾';
      $('#mode-desc').textContent = hustle
        ? `"Eko to the Gateway": you just moved from your village to Abeokuta with ${naira(HU.START_CASH)}. Hustle, pay rent every Saturday, avoid TRACE, spray money at owambes, and go from sapa to stardom.`
        : 'Live a whole life from birth to old age: school, WAEC/JAMB, university, NYSC, careers, crime, politics and family.';
    };
    form.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', syncMode));
    syncMode();
    $('#bg-select').addEventListener('change', (ev) => {
      const w = E.WEALTH[ev.target.value];
      $('#bg-desc').textContent = w ? w.desc : 'Fate will pick: poor, middle-class, comfortable, rich or a politician\'s family.';
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const base = { first: fd.get('first').trim(), last: fd.get('last').trim(), gender: fd.get('gender') };
      const begin = (state) => {
        if (window.__ogs3d) window.__ogs3d.exitBuilding();
        S = state;
        lastMapTown = null; overlayKey = null; classicView = false;
        closeModal();
        switchTab(isH() ? 'world' : 'today');
        afterAction();
        if (mapReady) M.focusMe(S);
        toast(isH() ? 'Press ▶ to start the clock. Open your 📱 Phone to find work.' : 'Press ▶ to start the clock.', 'good');
      };
      if (fd.get('mode') === 'hustle') {
        return lottery(base, fd.get('village'), begin);
      }
      S = E.newGame({ ...base, town: fd.get('town'), wealth: fd.get('wealth') || undefined });
      lastMapTown = null;
      overlayKey = null;
      closeModal();
      switchTab(isH() ? 'world' : 'today');
      afterAction();
      if (mapReady) M.focusMe(S);
      toast(isH() ? 'Pick a hustle, then press ▶ to start the clock.' : 'Press ▶ to start the clock.', 'good');
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

  // ---------- clock ----------

  function tick() {
    if (!S || !clock.running) return;
    if (!S.alive || S.ended) { clock.running = false; render(); showModalForState(); return; }
    if (modalOpen()) return;
    if (S.auto) {
      clock.acc += clock.speed;
      while (clock.acc >= 4 && !S.events.length && S.alive && !S.ended) {
        clock.acc -= 4;
        L.autoStep(S);
      }
      if (clock.acc >= 4) clock.acc = 0;
    } else {
      L.idle(S, 2.5 * clock.speed);
    }
    clock.saveAcc++;
    if (clock.saveAcc >= 20) { clock.saveAcc = 0; save(); }
    render();
    if (S.events.length || S.ended || !S.alive) { save(); showModalForState(); }
  }

  function fast(until) {
    if (!S) return;
    if (S.ended || !S.alive) return showNewGame();
    if (S.events.length) return showModalForState();
    L.fastForward(S, until);
    afterAction();
  }

  // ---------- tabs ----------

  function switchTab(name) {
    tab = name;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name !== 'world') pauseWorlds();
    if (name === 'world') { openWorld(); if (S) renderWorldHud(); window.scrollTo({ top: 0 }); return; }
    if (name === 'map') {
      if (!mapReady && root.L) {
        M.init($('#map'), popup);
        mapReady = true;
        overlayKey = null;
        if (S) updateOverlays();
        if (S) { M.updatePlayer(S); lastMapTown = S.town; M.focusMe(S); }
      } else if (!root.L) {
        $('#map').innerHTML = '<p style="padding:16px">The map library could not load. Check your internet connection and reload.</p>';
      }
      M.invalidate();
    } else if (S) {
      renderPanel(name);
    }
    window.scrollTo({ top: 0 });
  }

  // ---------- clicks ----------

  function handleAct(el) {
    const a = el.dataset.act;
    const d = el.dataset;
    switch (a) {
      case 'choose': {
        const r = E.resolveEvent(S, +d.i);
        save(); render();
        if (S.events.length || S.ended || !S.alive) showModalForState(); else closeModal();
        if (r.msg) toast(r.msg);
        return;
      }
      case 'do': return result(L.doAction(S, d.id));
      case 'auto': S.auto = el.checked; save(); render(); return;
      case 'apply-inst': return result(E.applyTertiary(S, d.inst, d.course, d.mode));
      case 'jamb': return result(E.retakeJamb(S));
      case 'waec': return result(E.resitWaec(S));
      case 'dropout': if (confirm('Really drop out?')) result(E.dropOut(S)); return;
      case 'train': return result(E.startTraining(S, d.id));
      case 'apply-job': closePopups(); return result(E.applyJob(S, d.id));
      case 'connect': return result(SO.useConnection(S, d.id));
      case 'quit': if (confirm('Resign from your job?')) result(E.quitJob(S)); return;
      case 'retire': return result(E.retire(S));
      case 'workhard': return result(E.workHard(S));
      case 'raise': return result(E.askRaise(S));
      case 'findlove': return result(E.findLove(S));
      case 'interact': return result(E.interact(S, d.person, d.action));
      case 'buy': return result(isH() ? HU.buyAsset(S, d.id) : E.buyAsset(S, d.id));
      case 'sell': {
        const a = S.assets.find((x) => x.uid === d.uid);
        if (isH() && a && a.living) S.hustle.ownsHouse = null; // sold the house you live in: rent is back
        return result(E.sellAsset(S, d.uid));
      }
      case 'watch-ad': return showAd();
      case 'claim-ad': { const r = HU.doubleLast(S); closeModal(); return result(r); }
      case 'drip': return result(HU.buyDrip(S, d.id));
      case 'house-move': if (confirm('Move house? You pay the first week plus agent & caution fees now.')) result(HU.moveHouse(S, d.id)); return;
      case 'house-buy': if (confirm('Buy this house outright?')) result(HU.buyHouse(S, d.id)); return;
      case 'arrears': return result(HU.payArrears(S));
      case 'build-house': return result(HU.buildHouse(S));
      case 'store-buy': ST.purchase(S, d.id).then(result); return;
      case 'move': return result(E.moveOut(S, $('#move-town').value));
      case 'move-to': closePopups(); return result(E.moveOut(S, d.id));
      case 'movehome': return result(E.moveBackHome(S));
      case 'japa': if (confirm('Leave Nigeria and end this life story?')) result(E.japa(S)); return;
      case 'join-party': return result(SO.joinParty(S, d.id));
      case 'declare': if (confirm('Buy the nomination form and declare your ambition?')) result(SO.declare(S, d.id)); return;
      case 'visit': {
        const sel = document.querySelector(`select[data-mode-for="${d.id}"]`);
        const mode = d.mode || (sel && sel.value) || 'bus';
        closePopups();
        return result(L.trip(S, d.id, mode));
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
      case 'close': clearInterval(adTimer); closeModal(); return;
      case 'world-enter': worldHooks.enter(); return;
      case 'view-2d': setView('2d'); return;
      case 'view-3d': setView('3d'); return;
      case 'world-close': worldSheet = null; renderWorldHud(); return;
      case 'leave-building': if (window.__ogs3d) window.__ogs3d.exitBuilding(); return;
      case 'random-name': randomName(); return;
      case 'phone': if (phone.open) closePhone(); else openPhone(); return;
      case 'app': openPhone(el.dataset.app); return;
      case 'ph-home': phone.app = null; phone.thread = null; renderPhone(); return;
      case 'ph-back': if (phone.thread) phone.thread = null; else if (phone.app) phone.app = null; else closePhone(); renderPhone(); return;
      case 'ph-thread': phone.thread = el.dataset.from || null; renderPhone(); save(); return;
      case 'hud-play': if (S) { if (S.ended || !S.alive) return showNewGame(); clock.running = !clock.running; if (clock.running && S.events.length) showModalForState(); renderGameHud(); renderClock(); } return;
      case 'hud-speed': clock.speed = clock.speed === 1 ? 3 : clock.speed === 3 ? 10 : 1; renderGameHud(); renderClock(); return;
      case 'people': showPeopleNearby(); return;
      case 'befriend': { const r = HU.befriend(S, el.dataset.name, el.dataset.g); toast(r.msg, r.ok ? 'good' : 'bad'); save(); render(); return; }
      case 'bank': {
        const amt = +el.dataset.amt; const op = el.dataset.op;
        const r = op === 'deposit' ? HU.deposit(S, amt) : op === 'withdraw' ? HU.withdraw(S, amt) : op === 'loan' ? HU.takeLoan(S, amt) : HU.repayLoan(S, amt);
        return result(r);
      }
      case 'bet': return result(HU.placeBet(S, +el.dataset.stake, +el.dataset.odds));
      case 'ride': {
        const w = window.__ogs3d; const id = el.dataset.id;
        if (!w) return;
        const def = WO.PLACES.find((x) => x.id === id);
        const r = HU.ride(S, w.distanceTo(id), def ? def.name : id);
        if (r.ok) { w.travelTo(id); closePhone(); }
        return result(r);
      }
      case 'classic': classicView = true; closePhone(); applyGameShell(); switchTab('today'); render(); return;
      case 'back-to-game': classicView = false; applyGameShell(); switchTab('world'); render(); return;
    }
  }

  function bind() {
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act],[data-ui],[data-tab],[data-speed]');
      if (!t || t.disabled) return;
      if (t.dataset.speed) { clock.speed = +t.dataset.speed; if (S) renderClock(); return; }
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

    $('#play-btn').addEventListener('click', () => {
      if (!S) return;
      if (S.ended || !S.alive) return showNewGame();
      clock.running = !clock.running;
      if (clock.running && S.events.length) showModalForState();
      renderClock();
    });
    $('#day-btn').addEventListener('click', () => fast('day'));
    $('#year-btn').addEventListener('click', () => fast('year'));

    $('#load-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        S = E.deserialize(await file.text());
        lastMapTown = null;
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

    // Pause when the tab is hidden so a life doesn't run away in the background.
    document.addEventListener('visibilitychange', () => { if (document.hidden && clock.running) { clock.running = false; save(); if (S) renderClock(); } });
    setInterval(tick, TICK_MS);
  }

  // ---------- boot ----------

  function boot() {
    bind();
    if ('serviceWorker' in navigator && /^(https:|http:\/\/localhost|http:\/\/127\.)/.test(location.href)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }
    S = loadSaved();
    if (S) {
      if (isH()) switchTab('world');
      render();
      if (S.events.length || S.ended || !S.alive) showModalForState();
    } else {
      showNewGame();
    }
  }

  root.OGS.UI = { get state() { return S; }, render, clock };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
