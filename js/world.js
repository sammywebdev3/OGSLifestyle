/*
 * OGS Lifestyle — 2D walkable Abeokuta (Hustle Mode).
 *
 * A top-down pixel-art town built with Phaser 3. Every texture (tiles,
 * people, danfo, keke, okada, buildings, Olumo Rock…) is drawn in code
 * below, so there are no image files to download. Walk up to a door and
 * press Enter / tap the prompt to use that place; the actions come from
 * the same game engine as the rest of the app.
 */
(function (root) {
  'use strict';

  const T = 16; // tile size in world pixels
  const MW = 64; // map width in tiles
  const MH = 48; // map height in tiles

  // ---------- places (tile coords: x, y, w, h; door is bottom-centre) ----------

  const PLACES = [
    { id: 'olumo', name: 'Olumo Rock', kind: 'rock', x: 2, y: 1, w: 13, h: 10, actions: ['content-olumo'], blurb: 'Climb the rock that sheltered the Egba. Best content spot in Abeokuta.' },
    { id: 'itoku', name: 'Itoku Adire Market', kind: 'market', x: 24, y: 3, w: 10, h: 7, actions: ['adire-buy', 'adire-local'], blurb: 'Dyers sell fresh adire here every morning.', awning: ['#23408e', '#e8a317', '#c0392b'] },
    { id: 'mosque', name: 'Central Mosque', kind: 'mosque', x: 36, y: 3, w: 6, h: 7, actions: ['worship'], blurb: 'Jumat prayers every Friday.' },
    { id: 'duplex', name: 'Ibara GRA Duplex', kind: 'duplex', x: 50, y: 2, w: 9, h: 8, actions: [], extra: 'houses', blurb: 'Big compound, gate man, generator house. Upgrade when you can afford it.' },
    { id: 'home', name: 'Your Self-contain', kind: 'house', x: 3, y: 19, w: 6, h: 6, actions: ['sleep', 'nap', 'relax', 'shower', 'cook', 'phone'], extra: 'home', blurb: 'Your 1-room self-contain. Rent is due every Saturday.' },
    { id: 'buka', name: 'Iya Basira Buka', kind: 'buka', x: 11, y: 20, w: 6, h: 5, actions: ['buka', 'ofada', 'lafun', 'ikokore', 'street-food', 'beg-food'], blurb: 'Amala, ofada, lafun, ikokore. Mama put dey kampe.' },
    { id: 'kuto', name: 'Kuto Market', kind: 'market', x: 24, y: 18, w: 12, h: 7, actions: ['adire-local', 'hustle', 'content-adire'], blurb: 'Busy market. Sell your adire, run small hustles.', awning: ['#0b6e4f', '#e8a317', '#8e44ad'] },
    { id: 'game', name: 'Game Centre & Viewing Centre', kind: 'shop', x: 37, y: 19, w: 6, h: 6, actions: ['game-centre', 'viewing'], blurb: 'FIFA ₦1,000, live EPL ₦500.', wall: '#2c3e50', roof: '#1abc9c' },
    { id: 'panseke', name: 'Panseke Junction Lounge', kind: 'club', x: 48, y: 18, w: 8, h: 6, actions: ['club', 'hangout', 'date', 'content-skit'], blurb: 'Nightlife, suya and gist. Clubs open after 8pm.' },
    { id: 'gym', name: 'Iron Gym', kind: 'shop', x: 57, y: 19, w: 6, h: 5, actions: ['gym'], blurb: 'Pump iron, get drip-ready.', wall: '#7f8c8d', roof: '#c0392b' },
    { id: 'okada-park', name: 'Okada Park', kind: 'park', x: 3, y: 37, w: 8, h: 6, actions: ['okada-ride'], extra: 'bike', blurb: 'Hire a bike for ₦3,000 balance and carry passengers.' },
    { id: 'church', name: 'Redemption Parish', kind: 'church', x: 12, y: 36, w: 6, h: 7, actions: ['worship', 'community'], blurb: 'Sunday service and community work.' },
    { id: 'motor-park', name: 'Kuto Motor Park (Lagos!)', kind: 'motorpark', x: 24, y: 36, w: 12, h: 8, actions: ['adire-lagos'], blurb: '"Lagos, Lagos! Oshodi, Balogun!" Danfos leave early.' },
    { id: 'hall', name: 'Gateway Event Hall', kind: 'hall', x: 37, y: 37, w: 6, h: 6, actions: [], extra: 'owambe', blurb: 'Owambe every Saturday. Wear your aso-oke!' },
    { id: 'agent', name: 'Kuto Lands & Properties', kind: 'shop', x: 48, y: 37, w: 6, h: 5, actions: [], extra: 'houses', blurb: 'House agent: face-me-I-face-you, self-contain, duplex. Also land in Obafemi-Owode.', wall: '#f5deb3', roof: '#8e5a2b' },
    { id: 'trace', name: 'TRACE Office', kind: 'shop', x: 56, y: 37, w: 6, h: 5, actions: [], extra: 'trace', blurb: 'Traffic Compliance & Enforcement. Impounded bikes wait here.', wall: '#ecf0f1', roof: '#e67e22' },
  ];
  const BILLBOARD_SPOTS = [[6, 29], [28, 29], [51, 29], [59, 11]];

  // ---------- tiny seeded RNG for consistent art ----------
  function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- map layout ----------
  const G = { GRASS: 0, GRASS2: 1, DIRT: 2, ROAD: 3, LINE_H: 4, LINE_V: 5, WALK: 6, GUTTER: 7, YARD: 8, ROCKGROUND: 9 };
  const H_ROADS = [14, 32];
  const V_ROADS = [20, 44];

  function buildMap() {
    const r = rng(42);
    const m = [];
    for (let y = 0; y < MH; y++) { m.push([]); for (let x = 0; x < MW; x++) m[y].push(r() < 0.18 ? G.GRASS2 : G.GRASS); }
    const isRoad = (x, y) => H_ROADS.some((ry) => y === ry || y === ry + 1) || V_ROADS.some((rx) => x === rx || x === rx + 1);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const hr = H_ROADS.find((ry) => y === ry || y === ry + 1);
      const vr = V_ROADS.find((rx) => x === rx || x === rx + 1);
      if (hr != null && vr != null) m[y][x] = G.ROAD;
      else if (hr != null) m[y][x] = x % 4 < 2 && y === hr ? G.LINE_H : G.ROAD;
      else if (vr != null) m[y][x] = y % 4 < 2 && x === vr ? G.LINE_V : G.ROAD;
    }
    // Walkways beside roads, gutter on the far side.
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (isRoad(x, y)) continue;
      const near = isRoad(x, y - 1) || isRoad(x, y + 1) || isRoad(x - 1, y) || isRoad(x + 1, y);
      if (near) m[y][x] = G.WALK;
    }
    // Yards & laterite in front of places, rocky ground around Olumo.
    for (const p of PLACES) {
      for (let y = p.y + p.h; y < p.y + p.h + 2 && y < MH; y++) for (let x = p.x - 1; x <= p.x + p.w && x < MW; x++) if (x >= 0 && m[y][x] <= G.GRASS2 || (m[y] && m[y][x] === G.GUTTER)) m[y][x] = p.kind === 'market' || p.kind === 'motorpark' || p.kind === 'park' ? G.DIRT : G.YARD;
      if (p.kind === 'rock') for (let y = Math.max(0, p.y - 1); y <= p.y + p.h; y++) for (let x = Math.max(0, p.x - 1); x <= p.x + p.w; x++) if (m[y][x] <= G.GRASS2) m[y][x] = G.ROCKGROUND;
    }
    return m;
  }

  // ---------- pixel art ----------

  function canvasTex(scene, key, w, h, draw) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx, (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); });
    tex.refresh();
    return tex;
  }

  function drawTiles(scene) {
    const n = 10;
    canvasTex(scene, 'tiles', T * n, T, (ctx, px) => {
      const r = rng(7);
      const speck = (ox, base, cols, count) => { px(ox, 0, T, T, base); for (let i = 0; i < count; i++) px(ox + Math.floor(r() * T), Math.floor(r() * T), 1, 1, cols[Math.floor(r() * cols.length)]); };
      speck(0, '#5f9e3f', ['#4f8a33', '#6fb04a', '#558f38'], 26); // grass
      speck(T, '#5f9e3f', ['#4f8a33', '#6fb04a'], 18); px(T + 4, 5, 1, 1, '#f1c40f'); px(T + 11, 10, 1, 1, '#e74c3c'); px(T + 7, 12, 1, 1, '#fff'); // flowers
      speck(T * 2, '#b5653b', ['#a2552f', '#c27548', '#8e4a2a'], 30); // laterite
      speck(T * 3, '#3d3d42', ['#35353a', '#47474d', '#2f2f33'], 30); // road
      speck(T * 4, '#3d3d42', ['#35353a', '#47474d'], 20); px(T * 4 + 2, 15, 12, 1, '#e8c547'); // centre line (horizontal)
      speck(T * 5, '#3d3d42', ['#35353a', '#47474d'], 20); px(T * 5 + 15, 2, 1, 12, '#e8c547'); // centre line (vertical)
      px(T * 6, 0, T, T, '#b9b2a3'); for (let i = 0; i < T; i += 8) { px(T * 6 + i, 0, 1, T, '#a39c8e'); px(T * 6, i, T, 1, '#a39c8e'); } // walkway slabs
      px(T * 7, 0, T, T, '#8c8c84'); px(T * 7 + 3, 3, 10, 10, '#2c3a3a'); px(T * 7 + 4, 6, 8, 2, '#3f5a50'); // gutter
      speck(T * 8, '#cdbb92', ['#bfae86', '#d8c79f'], 22); // compound yard
      speck(T * 9, '#8d8778', ['#7a7466', '#9d9788', '#6c675b'], 34); // rocky ground
    });
  }

  const SKIN = ['#6b3e26', '#7c4a2d', '#8d5524', '#5a3420'];
  const OUTFITS = {
    tee: { top: '#e74c3c', bottom: '#2c3e50' },
    adire: { top: '#23408e', bottom: '#23408e', dots: '#dfe8ff' },
    anago: { top: '#16a085', bottom: '#16a085', stripes: '#f1c40f' },
    corporate: { top: '#1f2a44', bottom: '#1f2a44', shirt: '#ffffff', tie: '#c0392b' },
    asooke: { top: '#6c3483', bottom: '#6c3483', stripes: '#e8a317', cap: true },
    trader: { top: '#e67e22', bottom: '#d35400', dots: '#f9e79f', gele: '#e67e22' },
    singlet: { top: '#ecf0f1', bottom: '#34495e', arms: true },
    trace: { top: '#c9a66b', bottom: '#5d4e37', vest: '#ff7a00', beret: '#5d2e0c' },
  };

  // A person spritesheet: 4 directions × 3 frames (stand, step A, step B), 16×24 each.
  function drawPerson(scene, key, { female, skin, outfit, hair = '#151515' }) {
    const o = OUTFITS[outfit] || OUTFITS.tee;
    const W = 16; const Hh = 24;
    const tex = canvasTex(scene, key, W * 12, Hh, (ctx, px) => {
      const dirs = ['down', 'left', 'right', 'up'];
      dirs.forEach((dir, di) => {
        for (let f = 0; f < 3; f++) {
          const ox = (di * 3 + f) * W;
          const step = f === 0 ? 0 : f === 1 ? 1 : -1;
          // shadow
          px(ox + 3, 22, 10, 2, 'rgba(0,0,0,.25)');
          // legs
          const legY = female ? 19 : 17;
          if (dir === 'left' || dir === 'right') {
            px(ox + 6 + step, legY, 3, 21 - legY + 1, o.bottom); px(ox + 7 - step, legY, 3, 21 - legY + 1, shade(o.bottom));
            px(ox + 6 + step, 21, 3, 1, '#111'); px(ox + 7 - step, 21, 3, 1, '#111');
          } else {
            px(ox + 5, legY + (step > 0 ? -1 : 0), 3, 22 - legY - (step > 0 ? 1 : 0), o.bottom);
            px(ox + 9, legY + (step < 0 ? -1 : 0), 3, 22 - legY - (step < 0 ? 1 : 0), o.bottom);
            px(ox + 5, 21 + (step > 0 ? -1 : 0), 3, 1, '#111'); px(ox + 9, 21 + (step < 0 ? -1 : 0), 3, 1, '#111');
          }
          // body
          px(ox + 4, 10, 8, female ? 6 : 8, o.top);
          if (female) px(ox + 3, 15, 10, 5, o.bottom); // wrapper / skirt
          if (o.dots) for (let yy = 11; yy < 18; yy += 2) for (let xx = 5; xx < 12; xx += 3) px(ox + xx + (yy % 4 ? 1 : 0), yy, 1, 1, o.dots);
          if (o.stripes) for (let yy = 11; yy < 18; yy += 3) px(ox + 4, yy, 8, 1, o.stripes);
          if (o.shirt && dir !== 'up') { px(ox + 7, 10, 2, 5, o.shirt); px(ox + 7, 11, 2, 3, o.tie); }
          if (o.vest) { px(ox + 4, 11, 8, 3, o.vest); px(ox + 4, 12, 8, 1, '#fff7a8'); }
          // arms
          const swing = dir === 'left' || dir === 'right' ? 0 : step;
          const armCol = o.arms ? skin : o.top;
          if (dir !== 'right') { px(ox + 3, 11 + swing, 1, 5, armCol); px(ox + 3, 16 + swing, 1, 1, skin); }
          if (dir !== 'left') { px(ox + 12, 11 - swing, 1, 5, armCol); px(ox + 12, 16 - swing, 1, 1, skin); }
          // head
          px(ox + 5, 3, 6, 7, skin);
          px(ox + 6, 2, 4, 1, skin);
          // hair / headwear
          if (o.gele || (female && outfit !== 'corporate')) { const g = o.gele || o.top; px(ox + 4, 0, 8, 4, g); px(ox + 3, 1, 2, 2, g); px(ox + 11, 1, 2, 2, g); px(ox + 6, 0, 1, 1, shade(g)); }
          else if (o.cap) { px(ox + 4, 0, 8, 3, o.top); px(ox + 4, 2, 8, 1, o.stripes); }
          else if (o.beret) { px(ox + 4, 1, 8, 3, o.beret); }
          else { px(ox + 5, 2, 6, 2, hair); if (female) { px(ox + 4, 3, 1, 5, hair); px(ox + 11, 3, 1, 5, hair); } }
          // face
          if (dir === 'down') { px(ox + 6, 6, 1, 1, '#111'); px(ox + 9, 6, 1, 1, '#111'); px(ox + 7, 8, 2, 1, shade(skin)); }
          if (dir === 'left') { px(ox + 5, 6, 1, 1, '#111'); px(ox + 4, 7, 1, 1, skin); }
          if (dir === 'right') { px(ox + 10, 6, 1, 1, '#111'); px(ox + 11, 7, 1, 1, skin); }
          if (dir === 'up' && !(o.gele || female || o.cap || o.beret)) px(ox + 5, 2, 6, 5, hair);
        }
      });
    });
    ['down', 'left', 'right', 'up'].forEach((dir, di) => { for (let f = 0; f < 3; f++) tex.add(`${dir}${f}`, 0, (di * 3 + f) * W, 0, W, Hh); });
    for (const dir of ['down', 'left', 'right', 'up']) {
      const ak = `${key}-${dir}`;
      if (scene.anims.exists(ak)) scene.anims.remove(ak);
      scene.anims.create({ key: ak, frames: [1, 0, 2, 0].map((f) => ({ key, frame: `${dir}${f}` })), frameRate: 8, repeat: -1 });
    }
  }

  function shade(hex, k = 0.75) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
    return '#' + c(n >> 16) + c((n >> 8) & 255) + c(n & 255);
  }

  function drawVehicles(scene) {
    // Top-down, facing right. Rotated in game for other directions.
    canvasTex(scene, 'danfo', 34, 16, (ctx, px) => {
      px(1, 14, 32, 2, 'rgba(0,0,0,.25)');
      px(1, 1, 32, 13, '#f2c40f'); px(1, 4, 32, 2, '#111'); px(1, 9, 32, 2, '#111');
      px(27, 2, 5, 11, '#2c4a6b'); px(3, 2, 22, 2, '#d4a90b');
      px(5, 0, 3, 1, '#222'); px(5, 15, 3, 1, '#222'); px(24, 0, 3, 1, '#222'); px(24, 15, 3, 1, '#222');
      px(32, 3, 1, 2, '#fff8b0'); px(32, 10, 1, 2, '#fff8b0');
    });
    canvasTex(scene, 'keke', 22, 14, (ctx, px) => {
      px(1, 12, 20, 2, 'rgba(0,0,0,.25)');
      px(2, 1, 17, 11, '#f2c40f'); px(2, 5, 17, 2, '#1e8449'); px(15, 3, 5, 7, '#2c4a6b'); px(19, 5, 3, 3, '#111');
      px(3, 0, 3, 1, '#222'); px(3, 12, 3, 1, '#222');
    });
    canvasTex(scene, 'okada', 18, 10, (ctx, px) => {
      px(1, 8, 16, 2, 'rgba(0,0,0,.25)');
      px(1, 3, 16, 3, '#222'); px(4, 2, 9, 5, '#c0392b'); px(14, 1, 2, 7, '#555');
      px(6, 1, 5, 7, '#2980b9'); px(7, 3, 3, 3, '#6b3e26'); px(7, 2, 3, 1, '#151515');
    });
    canvasTex(scene, 'parked-bike', 18, 10, (ctx, px) => { px(1, 8, 16, 2, 'rgba(0,0,0,.25)'); px(1, 3, 16, 3, '#222'); px(4, 2, 9, 5, '#c0392b'); px(14, 1, 2, 7, '#555'); });
  }

  function drawNature(scene) {
    canvasTex(scene, 'palm', 20, 30, (ctx, px) => {
      px(5, 27, 10, 3, 'rgba(0,0,0,.25)');
      for (let y = 10; y < 28; y++) px(9 + (y % 6 < 3 ? 0 : 1), y, 2, 1, y % 3 ? '#7b5a36' : '#5e4428');
      const g = '#2e8b3e'; const g2 = '#3fae55';
      px(2, 6, 8, 2, g); px(10, 6, 8, 2, g); px(0, 8, 4, 2, g); px(16, 8, 4, 2, g);
      px(4, 3, 6, 2, g2); px(10, 3, 6, 2, g2); px(8, 1, 4, 3, g2); px(2, 10, 3, 2, g2); px(15, 10, 3, 2, g2);
      px(8, 7, 4, 4, '#c08a1e');
    });
    canvasTex(scene, 'bush', 14, 10, (ctx, px) => { px(1, 8, 12, 2, 'rgba(0,0,0,.2)'); px(1, 3, 12, 6, '#3d8b37'); px(3, 1, 8, 3, '#4fa646'); px(4, 4, 2, 2, '#e74c3c'); });
  }

  // Building art: a 3/4 front view, w×h tiles.
  function drawPlace(scene, p) {
    const w = p.w * T; const h = p.h * T;
    canvasTex(scene, 'place-' + p.id, w, h, (ctx, px) => {
      const r = rng(p.id.length * 99 + p.x);
      const door = (cx, col = '#5b3a1e') => { px(cx - 6, h - 20, 12, 20, col); px(cx - 6, h - 20, 12, 2, shade(col, 0.6)); px(cx + 3, h - 11, 2, 2, '#e8c547'); };
      const windows = (y, count, col = '#2c4a6b') => { for (let i = 0; i < count; i++) { const x = Math.round((i + 0.5) * w / count) - 6; px(x, y, 12, 10, col); for (let b = 2; b < 12; b += 3) px(x + b, y, 1, 10, '#999'); } };
      const zinc = (y0, y1, base = '#9aa3a8') => { px(0, y0, w, y1 - y0, base); for (let x = 0; x < w; x += 4) px(x, y0, 1, y1 - y0, shade(base, 0.8)); px(0, y1 - 2, w, 2, shade(base, 0.6)); };
      switch (p.kind) {
        case 'rock': {
          const cols = ['#7f7a6e', '#8f897c', '#6f6a5f', '#9b9586'];
          for (let i = 0; i < 26; i++) {
            const bw = 30 + r() * 70; const bh = 25 + r() * 60;
            const bx = r() * (w - bw); const by = 10 + r() * (h - bh - 30);
            ctx.fillStyle = cols[i % cols.length];
            ctx.beginPath(); ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2); ctx.fill();
          }
          for (let i = 0; i < 40; i++) px(r() * w, r() * (h - 30), 1 + r() * 6, 1, '#55514a');
          for (let i = 0; i < 6; i++) px(w / 2 - 14 + i * 2, h - 30 + i * 5, 28 - i * 4, 5, i % 2 ? '#b5aa91' : '#c9bfa6'); // steps
          px(w / 2 - 20, h - 6, 40, 6, '#c9bfa6');
          break;
        }
        case 'market': {
          px(0, h - 6, w, 6, '#a2552f');
          const stalls = Math.max(2, Math.floor(p.w / 3));
          for (let i = 0; i < stalls; i++) {
            const sx = i * (w / stalls) + 4; const sw = w / stalls - 8;
            for (let row = 0; row < 2; row++) {
              const sy = 6 + row * (h / 2 - 4);
              const col = p.awning[(i + row) % p.awning.length];
              px(sx, sy, sw, 10, col); for (let k = 0; k < sw; k += 8) px(sx + k, sy, 4, 10, shade(col, 0.82));
              px(sx + 2, sy + 10, 2, h / 2 - 22, '#6d4c2f'); px(sx + sw - 4, sy + 10, 2, h / 2 - 22, '#6d4c2f');
              px(sx + 4, sy + 18, sw - 8, 8, '#8e5a2b');
              // goods: adire cloth (blue patterned) or produce
              for (let k = 0; k < sw - 12; k += 7) {
                const c = r() < 0.5 ? '#23408e' : ['#e74c3c', '#f39c12', '#27ae60', '#8e44ad'][Math.floor(r() * 4)];
                px(sx + 6 + k, sy + 12, 5, 7, c); px(sx + 7 + k, sy + 14, 1, 1, '#dfe8ff'); px(sx + 9 + k, sy + 16, 1, 1, '#dfe8ff');
              }
            }
          }
          break;
        }
        case 'motorpark': {
          px(0, 0, w, h, '#a2552f');
          for (let i = 0; i < 40; i++) px(r() * w, r() * h, 2, 1, '#8e4a2a');
          px(6, 6, w - 12, 14, '#7f8c8d'); for (let x = 6; x < w - 6; x += 4) px(x, 6, 1, 14, '#6c7a7b'); // shed roof
          px(8, 20, 2, 18, '#555'); px(w - 10, 20, 2, 18, '#555');
          break;
        }
        case 'park': {
          px(0, 0, w, h, '#a2552f');
          for (let i = 0; i < 30; i++) px(r() * w, r() * h, 2, 1, '#8e4a2a');
          ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.ellipse(w / 2, 22, 34, 18, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3c9a40'; ctx.beginPath(); ctx.ellipse(w / 2 - 6, 18, 22, 11, 0, 0, Math.PI * 2); ctx.fill();
          px(w / 2 - 2, 34, 5, 16, '#6d4c2f');
          break;
        }
        case 'mosque': {
          px(0, 30, w, h - 30, '#f4f1e8'); px(0, h - 4, w, 4, '#cfc8b5');
          ctx.fillStyle = '#1e8449'; ctx.beginPath(); ctx.arc(w / 2, 34, 22, Math.PI, 0); ctx.fill();
          px(w / 2 - 1, 6, 2, 7, '#e8c547'); ctx.fillStyle = '#e8c547'; ctx.beginPath(); ctx.arc(w / 2, 6, 3, 0, Math.PI * 2); ctx.fill();
          px(w - 14, 4, 8, h - 8, '#f4f1e8'); px(w - 15, 2, 10, 6, '#1e8449');
          windows(48, 3, '#1e8449'); door(w / 2, '#1e8449');
          break;
        }
        case 'church': {
          px(0, 24, w, h - 24, '#fdfdfd'); px(0, h - 4, w, 4, '#d0d0d0');
          ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(-2, 26); ctx.lineTo(w / 2, 4); ctx.lineTo(w + 2, 26); ctx.fill();
          px(w / 2 - 1, 0, 3, 14, '#e8c547'); px(w / 2 - 5, 4, 11, 3, '#e8c547');
          windows(44, 2, '#5dade2'); door(w / 2, '#7b241c');
          break;
        }
        case 'duplex': {
          px(0, h - 18, w, 18, '#bdbdbd'); for (let x = 0; x < w; x += 10) px(x, h - 18, 2, 18, '#9e9e9e'); // fence
          px(10, 26, w - 20, h - 44, '#f3e5c3');
          ctx.fillStyle = '#a93226'; ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(w / 2, 4); ctx.lineTo(w - 4, 30); ctx.fill();
          windows(36, 3, '#5dade2'); windows(60, 3, '#5dade2');
          px(w / 2 - 12, h - 18, 24, 18, '#2c3e50'); px(w / 2, h - 18, 1, 18, '#7f8c8d'); // gate
          break;
        }
        case 'club': {
          px(0, 14, w, h - 14, '#1b1b2f'); zinc(4, 16, '#34495e');
          for (let i = 0; i < w; i += 6) px(i, 16, 3, 2, ['#ff2d95', '#00e5ff', '#ffe600'][(i / 6) % 3]);
          windows(44, 3, '#8e44ad'); door(w / 2, '#111');
          break;
        }
        case 'hall': {
          px(0, 22, w, h - 22, '#fef9e7'); px(0, 10, w, 14, '#d4ac0d'); for (let i = 0; i < w; i += 8) px(i, 22, 4, 4, '#8e44ad');
          windows(40, 2, '#f5b7b1'); door(w / 2, '#8e44ad');
          break;
        }
        case 'buka': {
          zinc(4, 22, '#a7b1b6'); px(4, 22, w - 8, h - 26, '#e9d8a6'); px(0, h - 4, w, 4, '#8e5a2b');
          px(8, 34, 18, 10, '#5d4037'); px(10, 30, 4, 4, '#555'); px(17, 30, 4, 4, '#555'); // pots on the fire
          px(11, 26, 1, 3, '#ccc'); px(18, 25, 1, 4, '#ccc');
          px(w - 34, 34, 26, 4, '#8e5a2b'); px(w - 32, 38, 2, 10, '#6d4c2f'); px(w - 12, 38, 2, 10, '#6d4c2f');
          door(w / 2 + 8, '#6d4c2f');
          break;
        }
        default: { // house / shop
          const wall = p.wall || (p.kind === 'house' ? '#d6c7a1' : '#e8dcc0');
          zinc(2, 22, p.roof ? p.roof : '#9aa3a8');
          px(0, 20, w, h - 20, wall); px(0, h - 4, w, 4, shade(wall, 0.7));
          for (let i = 0; i < 12; i++) px(r() * w, 24 + r() * (h - 30), 3, 2, shade(wall, 0.9)); // weathered paint
          windows(32, Math.max(2, Math.floor(p.w / 2.5)));
          door(w / 2);
        }
      }
    });
  }

  function drawBillboard(scene, key, color) {
    canvasTex(scene, key, 64, 34, (ctx, px) => {
      px(10, 18, 3, 16, '#555'); px(51, 18, 3, 16, '#555');
      px(0, 0, 64, 20, '#fff'); px(1, 1, 62, 18, color); px(0, 19, 64, 2, '#333');
    });
  }

  // ---------- the scene ----------

  let game = null;
  let api = null;
  let sceneRef = null;
  const joy = { x: 0, y: 0 };

  // Built lazily: Phaser.Scene only exists once the engine script has loaded.
  function makeTownClass() {
  return class Town extends root.Phaser.Scene {
    constructor() { super('town'); }

    create() {
      sceneRef = this;
      const s = api.state();
      drawTiles(this);
      drawVehicles(this);
      drawNature(this);

      const map = this.make.tilemap({ data: buildMap(), tileWidth: T, tileHeight: T });
      const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
      map.createLayer(0, ts, 0, 0).setDepth(-10);

      this.physics.world.setBounds(0, 0, MW * T, MH * T);
      this.solids = this.physics.add.staticGroup();
      const solid = (x, y, w, h) => { const rct = this.add.rectangle(x + w / 2, y + h / 2, w, h); this.physics.add.existing(rct, true); this.solids.add(rct); rct.setVisible(false); };

      // Places
      this.doors = [];
      for (const p of PLACES) {
        drawPlace(this, p);
        const img = this.add.image(p.x * T, p.y * T, 'place-' + p.id).setOrigin(0, 0).setDepth((p.y + p.h) * T);
        const open = ['market', 'motorpark', 'park'].includes(p.kind);
        if (open) solid(p.x * T + 2, p.y * T, p.w * T - 4, p.h * T * 0.55);
        else solid(p.x * T, p.y * T, p.w * T, p.h * T - 6);
        const label = this.add.text(p.x * T + (p.w * T) / 2, p.y * T - 2, p.name, { fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '7px', color: '#fff', backgroundColor: 'rgba(20,30,25,.78)', padding: { x: 3, y: 1 } })
          .setOrigin(0.5, 1).setResolution(4).setDepth(5000);
        this.doors.push({ place: p, zone: new root.Phaser.Geom.Rectangle(p.x * T + p.w * T / 2 - 22, (p.y + p.h) * T - 8, 44, 30), img, label });
        if (p.kind === 'park') for (let i = 0; i < 4; i++) this.add.image(p.x * T + 20 + i * 22, (p.y + p.h) * T - 12, 'parked-bike').setDepth((p.y + p.h) * T);
        if (p.kind === 'motorpark') for (let i = 0; i < 3; i++) this.add.image(p.x * T + 30 + i * 46, p.y * T + p.h * T * 0.62, 'danfo').setDepth((p.y + p.h) * T + 1);
      }

      // Billboards from the Ads Board
      const ads = api.ads();
      ads.slice(0, BILLBOARD_SPOTS.length).forEach((ad, i) => {
        const [bx, by] = BILLBOARD_SPOTS[i];
        drawBillboard(this, 'bb-' + i, ad.color || '#0b6e4f');
        this.add.image(bx * T, by * T, 'bb-' + i).setOrigin(0, 0).setDepth(by * T + 34);
        this.add.text(bx * T + 32, by * T + 10, ad.business, { fontFamily: 'Arial Black, Arial', fontSize: '6px', color: '#fff', align: 'center', wordWrap: { width: 58 } }).setOrigin(0.5).setResolution(4).setDepth(by * T + 35);
        solid(bx * T + 8, by * T + 28, 48, 6);
      });

      // Trees (avoid roads and places)
      const r = rng(3);
      const blocked = (tx, ty) => PLACES.some((p) => tx >= p.x - 1 && tx <= p.x + p.w && ty >= p.y - 1 && ty <= p.y + p.h + 2) || BILLBOARD_SPOTS.some(([bx, by]) => tx >= bx - 1 && tx <= bx + 4 && ty >= by - 1 && ty <= by + 2);
      const layout = buildMap();
      for (let i = 0; i < 70; i++) {
        const tx = Math.floor(r() * MW); const ty = Math.floor(r() * MH);
        const tile = layout[ty][tx];
        if (tile > 1 || blocked(tx, ty)) continue;
        const kind = r() < 0.6 ? 'palm' : 'bush';
        this.add.image(tx * T + 8, ty * T + 16, kind).setOrigin(0.5, 1).setDepth(ty * T + 16);
        if (kind === 'palm') solid(tx * T + 6, ty * T + 12, 4, 4);
      }

      // Player
      this.outfitKey = null;
      this.ensurePlayerTexture();
      const start = s.world && s.world.x ? s.world : { x: (PLACES[4].x + PLACES[4].w / 2) * T, y: (PLACES[4].y + PLACES[4].h + 1) * T };
      this.player = this.physics.add.sprite(start.x, start.y, this.outfitKey, 'down0');
      this.player.setCollideWorldBounds(true).setOrigin(0.5, 1);
      this.player.body.setSize(10, 6).setOffset(3, 17);
      this.facing = 'down';
      this.physics.add.collider(this.player, this.solids);

      // NPCs
      const npcDefs = [
        { outfit: 'trader', female: true, x: 28, y: 12, say: ['Oya, buy adire! Fine fine one!', 'Customer, come and price!', 'Na last price be that o.'] },
        { outfit: 'trader', female: true, x: 30, y: 26, say: ['Tomato, pepper, ewedu!', 'E don cost, no be my fault.'] },
        { outfit: 'singlet', female: false, x: 50, y: 26, say: ['Chairman! Drop something for the boys!', 'Owo ijoko!', 'Area na your area.'] },
        { outfit: 'tee', female: false, x: 16, y: 28, say: ['Bawo ni?', 'How far? You don chop?', 'NEPA don take light again.'] },
        { outfit: 'trace', female: false, x: 43, y: 31, say: ['Where your helmet?', 'Oya park well!', 'Show me your papers.'] },
        { outfit: 'tee', female: true, x: 8, y: 33, say: ['Okada, Panseke ₦500!', 'Abeg slow down o.'] },
        { outfit: 'adire', female: false, x: 37, y: 16, say: ['Owambe on Saturday, you dey come?', 'This adire na from Itoku.'] },
        { outfit: 'singlet', female: false, x: 7, y: 44, say: ['Bike dey for hire, ₦3,000 balance.', 'Rush hour na money.'] },
      ];
      this.npcs = npcDefs.map((d, i) => {
        const key = 'npc-' + i;
        drawPerson(this, key, { female: d.female, skin: SKIN[i % SKIN.length], outfit: d.outfit });
        const spr = this.physics.add.sprite(d.x * T, d.y * T, key, 'down0').setOrigin(0.5, 1);
        spr.body.setSize(10, 6).setOffset(3, 17);
        spr.setCollideWorldBounds(true);
        this.physics.add.collider(spr, this.solids);
        return { spr, key, home: { x: d.x * T, y: d.y * T }, say: d.say, next: 0, talked: 0, stillTrace: d.outfit === 'trace' };
      });

      // Traffic on the roads
      this.traffic = [];
      const lane = (kind, horizontal, fixed, dir, speed) => {
        const spr = this.add.image(0, 0, kind).setDepth(4000);
        const v = { spr, horizontal, fixed, dir, speed, pos: r() * (horizontal ? MW : MH) * T, honk: 0 };
        if (!horizontal) spr.setAngle(dir > 0 ? 90 : -90); else if (dir < 0) spr.setFlipX(true);
        this.traffic.push(v);
      };
      lane('danfo', true, H_ROADS[0] * T + 8, -1, 55); lane('okada', true, H_ROADS[0] * T + 24, 1, 80);
      lane('keke', true, H_ROADS[1] * T + 8, -1, 45); lane('danfo', true, H_ROADS[1] * T + 24, 1, 60);
      lane('okada', false, V_ROADS[0] * T + 8, 1, 75); lane('keke', false, V_ROADS[0] * T + 24, -1, 45);
      lane('danfo', false, V_ROADS[1] * T + 8, -1, 50); lane('okada', false, V_ROADS[1] * T + 24, 1, 85);

      // Night sky overlay
      this.night = this.add.rectangle(0, 0, 10, 10, 0x0a1030, 0).setOrigin(0).setScrollFactor(0).setDepth(9000);
      this.bubble = this.add.text(0, 0, '', { fontFamily: 'Arial', fontSize: '7px', color: '#111', backgroundColor: '#ffffff', padding: { x: 3, y: 2 }, wordWrap: { width: 110 } }).setOrigin(0.5, 1).setResolution(4).setDepth(9500).setVisible(false);
      this.bubbleUntil = 0;

      // Camera
      const cam = this.cameras.main;
      cam.setBounds(0, 0, MW * T, MH * T);
      cam.startFollow(this.player, true, 0.15, 0.15);
      cam.setRoundPixels(true);
      this.scale.on('resize', () => this.fitCamera());
      this.fitCamera();

      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,ENTER,SPACE');
      this.input.keyboard.on('keydown-E', () => api.enter());
      this.input.keyboard.on('keydown-ENTER', () => api.enter());
      this.nearId = null;
      this.saveAt = 0;
    }

    fitCamera() {
      const cam = this.cameras.main;
      const w = this.scale.width;
      cam.setZoom(Math.max(1.75, Math.min(3.2, w / (24 * T))));
      this.night.setSize(this.scale.width, this.scale.height);
    }

    ensurePlayerTexture() {
      const s = api.state();
      const drip = (s.hustle && s.hustle.drip) || [];
      const outfit = drip.includes('aso-oke') ? 'asooke' : drip.includes('corporate') ? 'corporate' : drip.includes('anago') ? 'anago' : drip.includes('adire-fit') ? 'adire' : 'tee';
      const key = `player-${s.gender}-${outfit}`;
      if (key === this.outfitKey) return;
      drawPerson(this, key, { female: s.gender === 'female', skin: SKIN[s.seed % SKIN.length], outfit });
      if (this.player) { this.player.setTexture(key, `${this.facing}0`); }
      this.outfitKey = key;
    }

    say(text, x, y) {
      this.bubble.setText(text).setPosition(x, y - 26).setVisible(true);
      this.bubbleUntil = this.time.now + 2200;
    }

    update(time, delta) {
      const s = api.state();
      if (!s || !this.player) return;
      this.ensurePlayerTexture();

      // Movement: keyboard or on-screen joystick
      const k = this.keys;
      let vx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + joy.x;
      let vy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + joy.y;
      const len = Math.hypot(vx, vy);
      const busy = api.blocked();
      const tired = s.needs && s.needs.energy < 15;
      const speed = (tired ? 45 : 78) * (len > 1 ? 1 / len : 1);
      if (len > 0.15 && !busy) {
        this.player.setVelocity(vx * speed, vy * speed);
        this.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
        this.player.anims.play(`${this.outfitKey}-${this.facing}`, true);
      } else {
        this.player.setVelocity(0, 0);
        this.player.anims.stop();
        this.player.setFrame(`${this.facing}0`);
      }
      this.player.setDepth(this.player.y);

      // Remember where you are
      if (time > this.saveAt) { s.world = { x: Math.round(this.player.x), y: Math.round(this.player.y) }; this.saveAt = time + 1000; }

      // Doors
      let near = null;
      for (const d of this.doors) if (root.Phaser.Geom.Rectangle.Contains(d.zone, this.player.x, this.player.y)) { near = d.place; break; }
      if ((near && near.id) !== this.nearId) { this.nearId = near && near.id; api.near(near); }

      // NPCs wander and talk
      for (const n of this.npcs) {
        if (time > n.next) {
          n.next = time + 1500 + Math.random() * 2500;
          if (n.stillTrace || Math.random() < 0.35) { n.spr.setVelocity(0, 0); n.dir = null; }
          else {
            const dx = n.home.x + (Math.random() - 0.5) * 120 - n.spr.x; const dy = n.home.y + (Math.random() - 0.5) * 80 - n.spr.y;
            const l = Math.hypot(dx, dy) || 1;
            n.spr.setVelocity(dx / l * 30, dy / l * 30);
            n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          }
        }
        if (n.dir) n.spr.anims.play(`${n.key}-${n.dir}`, true); else { n.spr.anims.stop(); n.spr.setFrame('down0'); }
        n.spr.setDepth(n.spr.y);
        const dist = root.Phaser.Math.Distance.Between(n.spr.x, n.spr.y, this.player.x, this.player.y);
        if (dist < 26 && time > n.talked) { n.talked = time + 8000; this.say(n.say[Math.floor(Math.random() * n.say.length)], n.spr.x, n.spr.y); }
      }
      if (this.bubble.visible && time > this.bubbleUntil) this.bubble.setVisible(false);

      // Traffic
      for (const v of this.traffic) {
        const span = (v.horizontal ? MW : MH) * T + 80;
        v.pos = (v.pos + v.dir * v.speed * delta / 1000 + span) % span;
        const p = v.pos - 40;
        if (v.horizontal) v.spr.setPosition(p, v.fixed); else v.spr.setPosition(v.fixed, p);
        const d = root.Phaser.Math.Distance.Between(v.spr.x, v.spr.y, this.player.x, this.player.y - 6);
        if (d < 18 && time > v.honk) {
          v.honk = time + 4000;
          this.say(v.spr.texture.key === 'danfo' ? '"Kpo kpo! Comot for road!"' : v.spr.texture.key === 'keke' ? '"Oga shift!"' : '"Watch am o!"', this.player.x, this.player.y);
          this.cameras.main.shake(120, 0.004);
        }
      }

      // Day & night
      const hr = (s.clock ? s.clock.min : 720) / 60;
      const a = hr < 5 ? 0.55 : hr < 7 ? 0.55 * (7 - hr) / 2 : hr < 18 ? 0 : hr < 20 ? 0.5 * (hr - 18) / 2 : 0.5 + Math.min(0.05, (hr - 20) * 0.02);
      this.night.setFillStyle(0x0a1030, a);
    }
  };
  }

  // ---------- public API ----------

  function loadPhaser() {
    if (root.Phaser) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://unpkg.com/phaser@3.80.1/dist/phaser.min.js';
      sc.onload = resolve;
      sc.onerror = () => reject(new Error('Could not load the 2D engine'));
      document.head.appendChild(sc);
    });
  }

  // On-screen joystick for phones.
  function bindJoystick(el) {
    if (!el || el.dataset.bound) return;
    el.dataset.bound = '1';
    const knob = el.querySelector('.knob');
    let id = null; let cx = 0; let cy = 0;
    const R = 44;
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx; let dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.x = dx / R; joy.y = dy / R;
    };
    const end = (e) => { if (e.pointerId !== id) return; id = null; joy.x = 0; joy.y = 0; knob.style.transform = ''; };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId; const rc = el.getBoundingClientRect(); cx = rc.left + rc.width / 2; cy = rc.top + rc.height / 2;
      el.setPointerCapture(id); move(e); e.preventDefault();
    });
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  async function mount(el, joystickEl, hooks) {
    api = hooks;
    await loadPhaser();
    if (game) return;
    // Scene class needs Phaser, so build the game after it loads.
    game = new root.Phaser.Game({
      type: root.Phaser.AUTO,
      parent: el,
      pixelArt: true,
      backgroundColor: '#5f9e3f',
      scale: { mode: root.Phaser.Scale.RESIZE, width: el.clientWidth || 360, height: el.clientHeight || 480 },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [makeTownClass()],
    });
    bindJoystick(joystickEl);
  }

  function pause() { if (game && sceneRef) { game.loop.sleep(); } }
  function resume() { if (game) { game.loop.wake(); game.scale.refresh(); } }

  const World = { PLACES, mount, pause, resume, joy, bindJoystick, isMounted: () => !!game, scene: () => sceneRef };

  root.OGS = root.OGS || {};
  root.OGS.World = World;
})(typeof globalThis !== 'undefined' ? globalThis : this);
