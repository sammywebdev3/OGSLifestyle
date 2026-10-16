/*
 * OGS Lifestyle — 3D test street (Three.js).
 *
 * One street in Abeokuta, with real-time sun, sky, shadows and
 * reflections. Every model and texture is generated in code: plastered
 * walls with rain stains, rusty corrugated zinc, cracked asphalt,
 * laterite, adire and ankara cloth, palm fronds, granite for Olumo Rock.
 * Doors use the same action sheet as the 2D town.
 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const OGS = window.OGS;

// ---------- seeded random ----------
function makeRand(seed) { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let x = Math.imul(t ^ (t >>> 15), t | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
let R = makeRand(11);
const rr = (a, b) => a + R() * (b - a);

// ---------- canvas textures ----------
const texCache = {};
function canvasTex(key, w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const k = key + repeat.join('x');
  if (texCache[k]) return texCache[k];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texCache[k] = t;
  return t;
}
function speckle(ctx, w, h, cols, n, size = 2) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = cols[(R() * cols.length) | 0]; const s = size * (0.5 + R()); ctx.fillRect(R() * w, R() * h, s, s); }
}
function blotch(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha)); g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

const TX = {
  asphalt: (rep) => canvasTex('asphalt', 512, 512, (c, w, h) => {
    c.fillStyle = '#3b3b3d'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#2e2e30', '#48484b', '#555558', '#333336', '#5c5a55'], 26000, 2);
    for (let i = 0; i < 10; i++) blotch(c, R() * w, R() * h, rr(20, 70), 'rgba(15,15,15,A)', 0.35);
    c.strokeStyle = 'rgba(20,20,20,.7)'; c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { c.beginPath(); let x = R() * w; let y = R() * h; c.moveTo(x, y); for (let k = 0; k < 14; k++) { x += rr(-14, 14); y += rr(-14, 14); c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < 3; i++) { blotch(c, R() * w, R() * h, rr(18, 32), 'rgba(10,10,10,A)', 0.8); } // potholes
  }, { repeat: rep }),
  asphaltRough: (rep) => canvasTex('asphaltR', 256, 256, (c, w, h) => { c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#bdbdbd', '#f0f0f0', '#a8a8a8'], 9000, 2); }, { repeat: rep, srgb: false }),
  laterite: (rep) => canvasTex('laterite', 512, 512, (c, w, h) => {
    c.fillStyle = '#9c5530'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#8a4826', '#b0663b', '#7a3f22', '#c27a4c', '#6e3a20'], 30000, 2.5);
    for (let i = 0; i < 25; i++) blotch(c, R() * w, R() * h, rr(20, 80), 'rgba(120,60,30,A)', 0.4);
    for (let i = 0; i < 18; i++) blotch(c, R() * w, R() * h, rr(10, 40), 'rgba(80,110,40,A)', 0.55); // weeds
  }, { repeat: rep }),
  concrete: (rep) => canvasTex('concrete', 512, 512, (c, w, h) => {
    c.fillStyle = '#a19c92'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#8f8a80', '#b3ada2', '#7d786f', '#c2bcb0'], 22000, 2);
    for (let i = 0; i < 14; i++) blotch(c, R() * w, R() * h, rr(20, 60), 'rgba(60,55,45,A)', 0.25);
    c.fillStyle = 'rgba(60,55,50,.6)'; for (let x = 0; x < w; x += 128) c.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 128) c.fillRect(0, y, w, 2);
  }, { repeat: rep }),
  plaster: (color, rep) => canvasTex('plaster' + color, 512, 512, (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.08)'], 26000, 3);
    const g = c.createLinearGradient(0, h, 0, h * 0.6); g.addColorStop(0, 'rgba(120,70,40,.55)'); g.addColorStop(1, 'rgba(120,70,40,0)');
    c.fillStyle = g; c.fillRect(0, h * 0.6, w, h * 0.4); // red-earth splash at the bottom
    for (let i = 0; i < 40; i++) { const x = R() * w; const y0 = R() * h * 0.4; const gg = c.createLinearGradient(0, y0, 0, y0 + rr(60, 220)); gg.addColorStop(0, 'rgba(60,60,50,.18)'); gg.addColorStop(1, 'rgba(60,60,50,0)'); c.fillStyle = gg; c.fillRect(x, y0, rr(2, 8), rr(60, 220)); } // rain streaks
    for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(140,135,125,.9)'; const x = R() * w; const y = R() * h; c.beginPath(); c.ellipse(x, y, rr(6, 22), rr(4, 12), R(), 0, Math.PI * 2); c.fill(); } // chipped plaster
  }, { repeat: rep }),
  zinc: (rep) => canvasTex('zinc', 256, 256, (c, w, h) => {
    for (let x = 0; x < w; x++) { const v = 150 + Math.sin(x / w * Math.PI * 32) * 45; c.fillStyle = `rgb(${v},${v + 4},${v + 8})`; c.fillRect(x, 0, 1, h); }
    for (let i = 0; i < 26; i++) blotch(c, R() * w, R() * h, rr(8, 40), 'rgba(140,62,20,A)', rr(0.35, 0.8)); // rust
    speckle(c, w, h, ['rgba(90,40,10,.5)', 'rgba(255,255,255,.15)'], 1500, 2);
  }, { repeat: rep }),
  zincBump: (rep) => canvasTex('zincB', 256, 4, (c, w, h) => { for (let x = 0; x < w; x++) { const v = 128 + Math.sin(x / w * Math.PI * 32) * 127; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, 0, 1, h); } }, { repeat: rep, srgb: false }),
  adire: (variant = 0) => canvasTex('adire' + variant, 256, 256, (c, w, h) => {
    c.fillStyle = ['#1b2a6b', '#152259', '#22357d'][variant % 3]; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(210,225,255,.85)'; c.fillStyle = 'rgba(210,225,255,.85)';
    for (let y = 16; y < h; y += 42) for (let x = 16; x < w; x += 42) {
      if (variant % 2) { for (let r = 4; r < 16; r += 5) { c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke(); } }
      else { c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.5; c.strokeRect(x - 12, y - 12, 24, 24); }
    }
    speckle(c, w, h, ['rgba(255,255,255,.12)', 'rgba(0,0,20,.25)'], 4000, 2);
  }),
  ankara: (seed) => canvasTex('ankara' + seed, 256, 256, (c, w, h) => {
    const pal = [['#e67e22', '#2c3e50', '#f1c40f', '#c0392b'], ['#27ae60', '#f39c12', '#8e44ad', '#ecf0f1'], ['#c0392b', '#f1c40f', '#16a085', '#2c3e50']][seed % 3];
    c.fillStyle = pal[0]; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      c.fillStyle = pal[1]; c.beginPath(); c.arc(x + 16, y + 16, 12, 0, Math.PI * 2); c.fill();
      c.fillStyle = pal[2]; c.beginPath(); c.arc(x + 16, y + 16, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = pal[3]; c.fillRect(x, y, 6, 6);
    }
  }),
  asoOke: () => canvasTex('asooke', 128, 128, (c, w, h) => {
    c.fillStyle = '#5b2a7a'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 10) { c.fillStyle = 'rgba(232,163,23,.9)'; c.fillRect(0, y, w, 2); }
    speckle(c, w, h, ['rgba(255,255,255,.1)', 'rgba(0,0,0,.2)'], 2000, 1.5);
  }),
  denim: () => canvasTex('denim', 128, 128, (c, w, h) => { c.fillStyle = '#2f4a72'; c.fillRect(0, 0, w, h); speckle(c, w, h, ['#3a5885', '#253c5e', '#4a6a99'], 4000, 1.5); }),
  bark: () => canvasTex('bark', 64, 256, (c, w, h) => {
    c.fillStyle = '#6b5236'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 9) { c.fillStyle = 'rgba(40,28,15,.7)'; c.fillRect(0, y, w, 3); c.fillStyle = 'rgba(160,130,95,.35)'; c.fillRect(0, y + 3, w, 2); }
  }),
  frond: () => canvasTex('frond', 256, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#4a6b23'; c.lineWidth = 6; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 0); c.stroke();
    for (let y = 20; y < h - 10; y += 9) {
      const len = Math.sin((y / h) * Math.PI) * (w / 2 - 6);
      for (const s of [-1, 1]) {
        c.strokeStyle = ['#2f6b1f', '#3c8227', '#2a5e1b', '#4f9a33'][(y / 9 + (s > 0 ? 1 : 0)) % 4 | 0];
        c.lineWidth = 5; c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 + s * len * 0.6, y - 18, w / 2 + s * len, y + 24); c.stroke();
      }
    }
  }),
  granite: (rep) => canvasTex('granite', 512, 512, (c, w, h) => {
    c.fillStyle = '#7d776c'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#6a645a', '#8f897d', '#a39d90', '#55504a', '#b3ab9b'], 30000, 3);
    for (let i = 0; i < 30; i++) blotch(c, R() * w, R() * h, rr(20, 90), 'rgba(50,48,42,A)', 0.45);
    for (let i = 0; i < 20; i++) blotch(c, R() * w, R() * h, rr(10, 40), 'rgba(110,120,70,A)', 0.4); // lichen
  }, { repeat: rep }),
  grass: (rep) => canvasTex('grass', 512, 512, (c, w, h) => {
    c.fillStyle = '#5a7f2f'; c.fillRect(0, 0, w, h);
    speckle(c, w, h, ['#4c6e26', '#6b9238', '#7a9c40', '#3f5e1f', '#8a7a45'], 30000, 3);
    for (let i = 0; i < 20; i++) blotch(c, R() * w, R() * h, rr(20, 70), 'rgba(150,90,50,A)', 0.4);
  }, { repeat: rep }),
  wood: () => canvasTex('wood', 128, 128, (c, w, h) => {
    c.fillStyle = '#7a5230'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { c.fillStyle = `rgba(${40 + R() * 30},${25 + R() * 15},10,.35)`; c.fillRect(0, y, w, 1); }
  }),
  sign: (lines, bg, fg, w = 512, h = 160) => canvasTex('sign' + lines.join('|') + bg, w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => { c.font = `900 ${i === 0 ? Math.min(64, (w * 1.6) / Math.max(8, t.length)) : 30}px Arial Black, Arial, sans-serif`; c.fillText(t, w / 2, h * (n === 1 ? 0.52 : 0.36 + i * 0.36)); });
    speckle(c, w, h, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.08)'], 3000, 2); // weathering
    for (let i = 0; i < 5; i++) blotch(c, R() * w, R() * h, rr(10, 40), 'rgba(90,60,30,A)', 0.2);
  }),
};

// ---------- materials ----------
const M = {};
function mat(key, opts) { return M[key] || (M[key] = new THREE.MeshStandardMaterial(opts)); }

// ---------- builders ----------
function box(w, h, d, material, x, y, z, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function plane(w, h, material, x, y, z, rx = -Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.rotation.x = rx; m.position.set(x, y, z); m.receiveShadow = true;
  return m;
}

const colliders = [];
function collide(cx, cz, w, d) { colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }); }

const nightGlow = []; // window glass materials that glow at night
const streetLights = [];

function windowUnit(g, x, y, z, w = 1.2, h = 1.2, face = 1) {
  // One shared glass material, so every window glows at night in a single draw call.
  const glass = M.winglass || (M.winglass = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.08, metalness: 0.6, emissive: '#ffb860', emissiveIntensity: 0 }));
  if (!nightGlow.includes(glass)) nightGlow.push(glass);
  const frame = mat('frame', { color: '#e8e2d4', roughness: 0.7 });
  g.add(box(w + 0.16, h + 0.16, 0.06, frame, x, y, z + 0.02 * face));
  const gl = box(w, h, 0.04, glass, x, y, z + 0.05 * face); gl.castShadow = false; g.add(gl);
  const bar = mat('bars', { color: '#202020', roughness: 0.5, metalness: 0.7 });
  for (let i = 1; i < 5; i++) g.add(box(0.035, h, 0.035, bar, x - w / 2 + (w / 5) * i, y, z + 0.11 * face, { cast: false }));
  g.add(box(w, 0.035, 0.035, bar, x, y, z + 0.11 * face, { cast: false }));
  g.add(box(w + 0.3, 0.08, 0.22, frame, x, y - h / 2 - 0.08, z + 0.1 * face)); // sill
}

// A bungalow/shop facing +z (towards the street when placed on the north side).
function building({ w, d, h, color, roof = 'gable', door = true, windows = 2, sign = null, signColor = ['#fff', '#b03a2e'], storeys = 1 }) {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ map: TX.plaster(color, [w / 4, h / 3]), roughness: 0.92 });
  const walls = box(w, h, d, wallMat, 0, h / 2, 0); g.add(walls);
  g.add(box(w + 0.04, 0.35, d + 0.04, mat('skirting', { color: '#7b5a45', roughness: 0.9 }), 0, 0.17, 0)); // painted skirting
  const per = storeys > 1 ? h / storeys : h;
  for (let s = 0; s < storeys; s++) {
    const cy = per * s + per * 0.58;
    for (let i = 0; i < windows; i++) {
      const x = -w / 2 + (w / (windows + (door && s === 0 ? 1 : 0))) * (i + 0.5 + (door && s === 0 && i >= windows / 2 ? 1 : 0));
      windowUnit(g, x, cy, d / 2, 1.1, 1.1);
    }
  }
  if (door) {
    g.add(box(1.1, 2.1, 0.08, mat('door', { map: TX.wood(), roughness: 0.6 }), 0, 1.05, d / 2 + 0.04));
    g.add(box(0.08, 0.08, 0.05, mat('brass', { color: '#d4a90b', metalness: 1, roughness: 0.3 }), 0.4, 1.05, d / 2 + 0.11));
  }
  // Roof
  const zinc = new THREE.MeshStandardMaterial({ map: TX.zinc([w / 2, 2]), bumpMap: TX.zincBump([w / 2, 1]), bumpScale: 0.05, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
  if (roof === 'gable') {
    const pitch = 0.42; const half = d / 2 + 0.5; const slope = half / Math.cos(pitch);
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.05, slope), zinc);
      r.position.set(0, h + Math.tan(pitch) * half / 2 + 0.02, s * half / 2);
      r.rotation.x = s * pitch; r.castShadow = true; r.receiveShadow = true; g.add(r);
    }
    const gableMat = wallMat;
    const shape = new THREE.Shape(); shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, Math.tan(pitch) * d / 2); shape.lineTo(-d / 2, 0);
    for (const s of [-1, 1]) { const tri = new THREE.Mesh(new THREE.ShapeGeometry(shape), gableMat); tri.rotation.y = Math.PI / 2; tri.position.set(s * w / 2, h, 0); tri.castShadow = true; g.add(tri); }
  } else {
    const r = box(w + 0.8, 0.06, d + 1.2, zinc, 0, h + 0.35, 0.2); r.rotation.x = -0.12; g.add(r);
    g.add(box(w, 0.4, 0.15, wallMat, 0, h + 0.2, d / 2)); // parapet
  }
  // Fascia board
  g.add(box(w + 0.8, 0.25, 0.06, mat('fascia', { color: '#efe6d2', roughness: 0.8 }), 0, h + 0.05, d / 2 + 0.62));
  if (sign) {
    const sm = new THREE.MeshStandardMaterial({ map: TX.sign(sign, signColor[0], signColor[1]), roughness: 0.7 });
    g.add(box(Math.min(w - 0.4, 6), 1.2, 0.08, sm, 0, storeys > 1 ? per + 0.2 : h - 0.75, d / 2 + 0.06));
  }
  return g;
}

function compoundWall(g, w, d, color, gateW = 3) {
  const wm = new THREE.MeshStandardMaterial({ map: TX.plaster(color, [w / 4, 0.6]), roughness: 0.95 });
  const hgt = 2;
  const segs = [[0, -d / 2, w, 0.25], [-w / 2, 0, 0.25, d], [w / 2, 0, 0.25, d]];
  for (const [x, z, sw, sd] of segs) g.add(box(sw, hgt, sd, wm, x, hgt / 2, z));
  const side = (w - gateW) / 2;
  g.add(box(side, hgt, 0.25, wm, -w / 2 + side / 2, hgt / 2, d / 2));
  g.add(box(side, hgt, 0.25, wm, w / 2 - side / 2, hgt / 2, d / 2));
  // black metal gate (open)
  const gm = mat('gate', { color: '#1c1c1c', metalness: 0.8, roughness: 0.45 });
  for (const s of [-1, 1]) { // two open leaves of iron bars
    const leaf = new THREE.Group();
    const lw = gateW / 2;
    leaf.add(box(lw, 0.08, 0.06, gm, lw / 2, 1.85, 0)); leaf.add(box(lw, 0.08, 0.06, gm, lw / 2, 0.15, 0)); leaf.add(box(lw, 0.06, 0.05, gm, lw / 2, 1.0, 0));
    for (let i = 0; i <= 7; i++) leaf.add(box(0.035, 1.9, 0.035, gm, (lw / 7) * i, 0.97, 0, { cast: true }));
    leaf.position.set(s * gateW / 2, 0, d / 2); leaf.rotation.y = s > 0 ? Math.PI - 1.1 : 1.1; g.add(leaf);
  }
  for (let i = 0; i < 6; i++) g.add(box(0.03, 0.25, 0.03, gm, -w / 2 + i * (w / 6), hgt + 0.12, -d / 2)); // spikes
}

function palm(x, z, s = 1) {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(rr(-0.4, 0.4), 3 * s, rr(-0.3, 0.3)), new THREE.Vector3(rr(-0.9, 0.9), 6 * s, rr(-0.8, 0.8)), new THREE.Vector3(rr(-1.2, 1.2), 8 * s, rr(-1, 1))]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.2 * s, 8), mat('bark', { map: TX.bark(), roughness: 0.95 }));
  trunk.castShadow = true; g.add(trunk);
  const top = curve.getPoint(1);
  const fm = mat('frond', { map: TX.frond(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  const n = 11;
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * s, 3.4 * s, 1, 6), fm);
    const pos = f.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) { const yy = pos.getY(k) + 1.7 * s; pos.setZ(k, -0.12 * yy * yy / s); } // droop
    f.geometry.translate(0, 1.7 * s, 0);
    f.geometry.computeVertexNormals();
    const pivot = new THREE.Group();
    pivot.position.copy(top);
    pivot.rotation.y = (i / n) * Math.PI * 2 + rr(-0.2, 0.2);
    f.rotation.x = rr(0.9, 1.35);
    f.castShadow = true;
    pivot.add(f); g.add(pivot);
  }
  g.position.set(x, 0, z);
  collide(x, z, 0.6, 0.6);
  return g;
}

function pole(x, z) {
  const g = new THREE.Group();
  const wood = mat('pole', { color: '#5a4630', roughness: 0.95 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 9, 8), wood); p.position.y = 4.5; p.castShadow = true; g.add(p);
  g.add(box(1.6, 0.12, 0.12, wood, 0, 8.4, 0));
  const lamp = box(0.5, 0.12, 0.25, mat('lamp', { color: '#888', metalness: 0.7, roughness: 0.4 }), 0.5, 7.6, 0.4); g.add(lamp);
  const bulbMat = M.bulb || (M.bulb = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffcf7a', emissiveIntensity: 0 }));
  g.add(box(0.3, 0.05, 0.15, bulbMat, 0.5, 7.52, 0.4, { cast: false }));
  // A soft pool of light on the ground instead of a real light (much cheaper on phones).
  const poolMat = M.pool || (M.pool = new THREE.MeshBasicMaterial({ map: canvasTex('pool', 128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,200,120,.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); }), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(0.5, 0.25, 0.8); pool.userData.dynamic = true; g.add(pool);
  if (!streetLights.length) streetLights.push({ bulbMat, poolMat });
  g.position.set(x, 0, z);
  collide(x, z, 0.4, 0.4);
  return g;
}

function wires(scene, xs, z) {
  const wm = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 });
  for (let i = 0; i < xs.length - 1; i++) {
    for (const off of [-0.6, 0, 0.6]) {
      const a = new THREE.Vector3(xs[i] + off, 8.4, z); const b = new THREE.Vector3(xs[i + 1] + off, 8.4, z);
      const mid = a.clone().lerp(b, 0.5); mid.y -= 0.9;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.015, 4), wm);
      scene.add(tube);
    }
  }
}

// ---------- people ----------
const SKINS = ['#5a3420', '#6b3e26', '#7c4a2d', '#8d5524'];
function person({ female = false, skin = SKINS[1], outfit = 'tee', tray = false }) {
  const g = new THREE.Group();
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55 });
  const topMat = outfit === 'adire' ? new THREE.MeshStandardMaterial({ map: TX.adire(1), roughness: 0.85 })
    : outfit === 'asooke' ? new THREE.MeshStandardMaterial({ map: TX.asoOke(), roughness: 0.6, metalness: 0.1 })
      : outfit === 'anago' ? new THREE.MeshStandardMaterial({ map: TX.ankara(1), roughness: 0.8 })
        : outfit === 'corporate' ? new THREE.MeshStandardMaterial({ color: '#1f2638', roughness: 0.6 })
          : outfit === 'trader' ? new THREE.MeshStandardMaterial({ map: TX.ankara(0), roughness: 0.8 })
            : outfit === 'trace' ? new THREE.MeshStandardMaterial({ color: '#c9a66b', roughness: 0.8 })
              : new THREE.MeshStandardMaterial({ color: ['#c0392b', '#2980b9', '#27ae60', '#ecf0f1'][Math.floor(R() * 4)], roughness: 0.85 });
  const botMat = ['asooke', 'adire', 'anago', 'corporate', 'trader'].includes(outfit) ? topMat : new THREE.MeshStandardMaterial({ map: TX.denim(), roughness: 0.9 });
  const shoe = mat('shoe', { color: '#1a1a1a', roughness: 0.5 });
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.11, 0.92, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.68, 4, 8), female ? skinM : botMat); leg.position.y = -0.42; leg.castShadow = true;
    const foot = box(0.12, 0.08, 0.26, shoe, 0, -0.86, 0.05); hip.add(leg, foot); g.add(hip); legs.push(hip);
  }
  if (female) { const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.75, 14), botMat); wrap.position.y = 0.66; wrap.castShadow = true; g.add(wrap); }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 12), topMat); torso.position.y = 1.25; torso.scale.set(1, 1, 0.72); torso.castShadow = true; g.add(torso);
  if (outfit === 'corporate') { g.add(box(0.12, 0.3, 0.02, mat('shirt', { color: '#fff', roughness: 0.6 }), 0, 1.37, 0.15)); g.add(box(0.05, 0.26, 0.02, mat('tie', { color: '#b03a2e', roughness: 0.5 }), 0, 1.33, 0.165)); }
  if (outfit === 'trace') { g.add(box(0.42, 0.28, 0.32, mat('vest', { color: '#ff7a00', emissive: '#331500', roughness: 0.6 }), 0, 1.3, 0)); }
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 1.5, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), outfit === 'tee' || outfit === 'trader' ? skinM : topMat); arm.position.y = -0.3; arm.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinM); hand.position.y = -0.6;
    sh.add(arm, hand); g.add(sh); arms.push(sh);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), skinM); neck.position.y = 1.62; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), skinM); head.position.y = 1.78; head.scale.set(0.95, 1.08, 1); head.castShadow = true; g.add(head);
  const eyeM = mat('eye', { color: '#111', roughness: 0.2 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eyeM); e.position.set(s * 0.055, 1.8, 0.135); g.add(e); }
  if (female || outfit === 'trader') {
    const geleMat = outfit === 'asooke' ? topMat : new THREE.MeshStandardMaterial({ map: TX.ankara(2), roughness: 0.7 });
    const gele = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.08, 8, 16), geleMat); gele.position.y = 1.92; gele.rotation.x = Math.PI / 2.4; gele.scale.set(1.2, 1, 1); g.add(gele);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 10), geleMat); top.position.set(0, 2.02, -0.04); top.rotation.x = -0.4; g.add(top);
  } else if (outfit === 'asooke') {
    const fila = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.16, 14), topMat); fila.position.set(0.02, 1.95, 0); fila.rotation.z = 0.25; g.add(fila);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), mat('hair', { color: '#0e0e0e', roughness: 0.9 })); hair.position.y = 1.8; g.add(hair);
  }
  if (tray) { // trader with a basin of goods on her head
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.14, 16), mat('basin', { color: '#c0c6c8', metalness: 0.8, roughness: 0.35 })); basin.position.y = 2.12; g.add(basin);
    for (let i = 0; i < 6; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), mat('orange', { color: '#e67e22', roughness: 0.6 })); o.position.set(rr(-0.18, 0.18), 2.22, rr(-0.18, 0.18)); g.add(o); }
  }
  g.userData = { legs, arms, phase: R() * 6 };
  return g;
}
function animatePerson(p, speed, t) {
  const sw = speed > 0.05 ? Math.sin(t * 9 + p.userData.phase) * 0.55 : 0;
  p.userData.legs[0].rotation.x = sw; p.userData.legs[1].rotation.x = -sw;
  p.userData.arms[0].rotation.x = -sw * 0.8; p.userData.arms[1].rotation.x = sw * 0.8;
}

// ---------- vehicles ----------
function wheel(r, wdt) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 18), mat('tyre', { color: '#141414', roughness: 0.9 })); tyre.rotation.x = Math.PI / 2; tyre.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wdt + 0.02, 12), mat('rim', { color: '#9aa0a6', metalness: 0.9, roughness: 0.3 })); rim.rotation.x = Math.PI / 2;
  g.add(tyre, rim); return g;
}
function danfo() {
  const g = new THREE.Group();
  const yellow = mat('danfoY', { color: '#f2c00f', metalness: 0.35, roughness: 0.38 });
  const black = mat('stripe', { color: '#0d0d0d', roughness: 0.5 });
  const glass = mat('vglass', { color: '#18222b', metalness: 0.7, roughness: 0.06 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(4.8, 1.85, 2.0, 4, 0.22), yellow); body.position.y = 1.35; body.castShadow = true; body.receiveShadow = true; g.add(body);
  for (const s of [-1, 1]) {
    g.add(box(4.82, 0.13, 0.02, black, 0, 1.0, s * 1.005));
    g.add(box(4.82, 0.13, 0.02, black, 0, 1.25, s * 1.005));
    for (let i = 0; i < 4; i++) g.add(box(0.85, 0.55, 0.02, glass, -1.6 + i * 0.95, 1.85, s * 1.01));
  }
  g.add(box(0.03, 0.75, 1.75, glass, 2.41, 1.75, 0)); // windscreen
  g.add(box(0.03, 0.6, 1.6, glass, -2.41, 1.8, 0));
  const rear = new THREE.MeshStandardMaterial({ map: TX.sign(['NO CONDITION', 'IS PERMANENT'], '#f2c00f', '#111', 512, 200), roughness: 0.5 });
  const rp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.55), rear); rp.rotation.y = -Math.PI / 2; rp.position.set(-2.42, 1.15, 0); g.add(rp);
  const lightM = mat('headlight', { color: '#fff', emissive: '#fff4d0', emissiveIntensity: 0.6 });
  for (const s of [-0.7, 0.7]) g.add(box(0.05, 0.18, 0.3, lightM, 2.42, 0.95, s, { cast: false }));
  const rack = mat('rack', { color: '#2b2b2b', metalness: 0.8, roughness: 0.4 });
  g.add(box(3.6, 0.05, 1.7, rack, -0.2, 2.35, 0)); g.add(box(1.2, 0.45, 0.9, mat('luggage', { map: TX.ankara(1), roughness: 0.9 }), -0.8, 2.6, 0.2));
  const wheels = [];
  for (const [x, z] of [[1.55, 0.92], [1.55, -0.92], [-1.55, 0.92], [-1.55, -0.92]]) { const w = wheel(0.42, 0.28); w.position.set(x, 0.42, z); g.add(w); wheels.push(w); }
  g.userData.wheels = wheels;
  return g;
}
function keke() {
  const g = new THREE.Group();
  const y = mat('kekeY', { color: '#f2c00f', metalness: 0.3, roughness: 0.4 });
  const grn = mat('kekeG', { color: '#1e7d43', metalness: 0.3, roughness: 0.45 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.0, 1.35, 3, 0.18), y); body.position.y = 0.85; body.castShadow = true; g.add(body);
  g.add(box(2.62, 0.12, 1.37, grn, 0, 0.72, 0));
  const canopy = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.08, 1.4, 2, 0.04), mat('canvas', { color: '#151515', roughness: 0.95 })); canopy.position.set(-0.15, 1.95, 0); canopy.castShadow = true; g.add(canopy);
  for (const [x, z] of [[-1.1, 0.62], [-1.1, -0.62], [0.95, 0.62], [0.95, -0.62]]) g.add(box(0.05, 0.95, 0.05, grn, x, 1.45, z));
  g.add(box(0.03, 0.6, 1.2, mat('vglass'), 1.15, 1.55, 0));
  const wheels = [];
  for (const [x, z] of [[1.0, 0], [-0.8, 0.62], [-0.8, -0.62]]) { const w = wheel(0.3, 0.18); w.position.set(x, 0.3, z); g.add(w); wheels.push(w); }
  g.userData.wheels = wheels;
  return g;
}
function okada() {
  const g = new THREE.Group();
  const red = mat('bikeR', { color: '#a93226', metalness: 0.5, roughness: 0.35 });
  g.add(box(1.0, 0.3, 0.3, red, 0, 0.75, 0));
  g.add(box(0.7, 0.14, 0.32, mat('seat', { color: '#151515', roughness: 0.7 }), -0.25, 0.95, 0));
  g.add(box(0.06, 0.6, 0.6, mat('rack'), 0.55, 1.05, 0));
  const wheels = [];
  for (const x of [0.65, -0.65]) { const w = wheel(0.33, 0.1); w.position.set(x, 0.33, 0); g.add(w); wheels.push(w); }
  const rider = person({ outfit: 'tee', skin: SKINS[2] }); rider.position.set(-0.15, -0.05, 0); rider.rotation.y = Math.PI / 2;
  rider.userData.legs.forEach((l) => { l.rotation.x = -1.2; });
  rider.userData.arms.forEach((a) => { a.rotation.x = -1.1; });
  g.add(rider);
  g.userData.wheels = wheels;
  return g;
}

// ---------- Olumo Rock & hills ----------
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf); const w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}
function rock(radius, seed, texRep = [3, 3]) {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = vnoise(v.x * 2 + seed, v.y * 2, v.z * 2) * 0.5 + vnoise(v.x * 5, v.y * 5 + seed, v.z * 5) * 0.2 + vnoise(v.x * 11, v.y * 11, v.z * 11 + seed) * 0.08;
    v.multiplyScalar(1 + n * 0.55);
    if (v.y < -0.2) v.y = -0.2;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: TX.granite(texRep), roughness: 0.95, flatShading: false }));
  m.scale.setScalar(radius);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}


// ---------- the town of Abeokuta ----------
// Two east–west roads and two north–south roads. Every place sits on a road
// frontage; its model is built "front at z=0, extending into -z" and then
// rotated to face its road.
const ROADS = [
  { id: 'kuto', name: 'Kuto Road', axis: 'x', at: 0, from: -95, to: 95 },
  { id: 'olumo', name: 'Olumo Road', axis: 'x', at: -60, from: -95, to: 95 },
  { id: 'panseke', name: 'Panseke Road', axis: 'z', at: -30, from: -95, to: 32 },
  { id: 'ibara', name: 'Ibara Road', axis: 'z', at: 40, from: -95, to: 32 },
];
const CROSS = 8; // half-size of an intersection
const FRONT = 8.4; // distance from road centre to a property's front line

// [placeId, road, side, along]
const LAYOUT = [
  ['home', 'kuto', -1, -70], ['buka', 'kuto', -1, -52], ['game', 'kuto', -1, -8], ['mosque', 'kuto', -1, 12], ['billboard', 'kuto', -1, 62],
  ['itoku', 'kuto', 1, -66], ['kuto', 'kuto', 1, 3], ['motor-park', 'kuto', 1, 66],
  ['olumo', 'olumo', -1, -66], ['church', 'olumo', -1, 1], ['hall', 'olumo', -1, 18], ['duplex', 'olumo', -1, 70],
  ['okada-park', 'olumo', 1, -68], ['trace', 'olumo', 1, -52], ['panseke', 'olumo', 1, -4], ['gym', 'olumo', 1, 12], ['agent', 'olumo', 1, 64],
];
const PLACES3D = [];

function roadOf(id) { return ROADS.find((r) => r.id === id); }
// Local (front-relative) offset → world position for a frontage.
function frontage(road, side, along) {
  if (road.axis === 'x') return { x: along, z: road.at + side * FRONT, rot: side < 0 ? 0 : Math.PI };
  return { x: road.at + side * FRONT, z: along, rot: side < 0 ? Math.PI / 2 : -Math.PI / 2 };
}
function toWorld(f, lx, lz) {
  const c = Math.cos(f.rot); const s = Math.sin(f.rot);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}
function collideLocal(f, lx, lz, w, d) {
  const p = toWorld(f, lx, lz);
  const swap = Math.abs(Math.sin(f.rot)) > 0.5;
  collide(p.x, p.z, swap ? d : w, swap ? w : d);
}
function signBoard(lines, bg, fg, w, h, y, z = 0.06, posts = false) {
  const g = new THREE.Group();
  g.add(box(w, h, 0.1, new THREE.MeshStandardMaterial({ map: TX.sign(lines, bg, fg), roughness: 0.7 }), 0, y, z));
  if (posts) for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) g.add(box(0.15, y, 0.15, mat('steel'), x, y / 2, z));
  return g;
}

// ----- place models (front at z = 0, extending into -z) -----
const BUILD = {
  home(f) {
    const g = new THREE.Group(); const inner = new THREE.Group();
    compoundWall(inner, 16, 12, '#d9cfb8');
    const b = building({ w: 10, d: 6, h: 3.2, color: '#e7dcc0', windows: 2, sign: ["GOD'S GRACE VILLA"], signColor: ['#f5f0e6', '#1f5c3a'] }); b.position.set(0, 0, -1.5); inner.add(b);
    inner.position.z = -6.2; g.add(inner);
    collideLocal(f, 0, -12.2, 16, 0.4); collideLocal(f, -8, -6.2, 0.4, 12); collideLocal(f, 8, -6.2, 0.4, 12);
    collideLocal(f, -4.75, -0.2, 6.5, 0.4); collideLocal(f, 4.75, -0.2, 6.5, 0.4); collideLocal(f, 0, -7.7, 10, 6);
    return g;
  },
  buka(f) {
    const g = new THREE.Group();
    const wood = mat('post', { map: TX.wood(), roughness: 0.8 });
    for (const [x, z] of [[-3.5, -6.5], [3.5, -6.5], [-3.5, -1.5], [3.5, -1.5]]) g.add(box(0.2, 3, 0.2, wood, x, 1.5, z));
    const zinc = new THREE.MeshStandardMaterial({ map: TX.zinc([4, 2]), bumpMap: TX.zincBump([4, 1]), bumpScale: 0.05, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
    const roof = box(8, 0.06, 6.4, zinc, 0, 3.1, -4); roof.rotation.x = -0.1; g.add(roof);
    g.add(box(6.5, 0.8, 0.12, new THREE.MeshStandardMaterial({ map: TX.plaster('#cfe3d6', [2, 1]) }), 0, 0.4, -6.9));
    for (const z of [-4.6, -2.8]) { g.add(box(5, 0.08, 0.9, wood, 0, 0.85, z)); g.add(box(5, 0.06, 0.35, wood, 0, 0.45, z + 0.8)); for (const x of [-2.2, 2.2]) g.add(box(0.1, 0.85, 0.1, wood, x, 0.42, z)); }
    for (const x of [-2.2, -1]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, 18), mat('pot', { color: '#1d1d1d', metalness: 0.6, roughness: 0.45 })); pot.position.set(x, 0.5, -6.2); pot.castShadow = true; g.add(pot);
      for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), mat('stone', { color: '#555', roughness: 1 })); st.position.set(x + Math.cos(i * 2.1) * 0.35, 0.1, -6.2 + Math.sin(i * 2.1) * 0.35); g.add(st); }
    }
    g.add(signBoard(['IYA BASIRA BUKA', 'AMALA • EWEDU • OFADA'], '#fdf2d0', '#8e1b10', 5, 1.3, 3.0, -0.75));
    const sm = toWorld(f, -1.6, -6.2); smokeSources.push(new THREE.Vector3(sm.x, 1.1, sm.z));
    collideLocal(f, 0, -6.9, 7, 0.6);
    return g;
  },
  game(f) {
    const g = new THREE.Group();
    const b = building({ w: 12, d: 8, h: 6.4, storeys: 2, color: '#bfd8e6', windows: 3, sign: ['GAME CENTRE • LIVE EPL', 'FIFA ₦1,000 • VIEWING ₦500'], signColor: ['#0f1c2e', '#3fd0ff'] });
    b.position.z = -5.2; g.add(b);
    const rail = mat('rail', { color: '#2b2b2b', metalness: 0.7, roughness: 0.4 });
    g.add(box(12, 0.15, 1.4, mat('slab', { map: TX.concrete([2, 0.3]), roughness: 0.95 }), 0, 3.2, -0.5));
    for (let i = 0; i < 25; i++) g.add(box(0.04, 1, 0.04, rail, -6 + i * 0.5, 3.75, 0.15, { cast: false }));
    g.add(box(12, 0.06, 0.06, rail, 0, 4.25, 0.15));
    collideLocal(f, 0, -5.2, 12, 8);
    return g;
  },
  mosque(f) {
    const g = new THREE.Group();
    const wallM = new THREE.MeshStandardMaterial({ map: TX.plaster('#f1eee4', [3, 2]), roughness: 0.9 });
    g.add(box(10, 5, 8, wallM, 0, 2.5, -5));
    const green = mat('dome', { color: '#1e7d43', metalness: 0.4, roughness: 0.35 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), green); dome.position.set(0, 5, -5); dome.castShadow = true; g.add(dome);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1, 8), mat('gold', { color: '#d4a90b', metalness: 1, roughness: 0.25 })); fin.position.set(0, 8.3, -5); g.add(fin);
    const min = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 12, 12), wallM); min.position.set(4.3, 6, -7.8); min.castShadow = true; g.add(min);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 12), green); cap.position.set(4.3, 12.8, -7.8); g.add(cap);
    for (let i = 0; i < 3; i++) g.add(box(1.2, 2.2, 0.1, mat('archdoor', { color: '#1e7d43', roughness: 0.5 }), -3 + i * 3, 1.1, -0.98));
    collideLocal(f, 0, -5, 10, 8);
    return g;
  },
  billboard(f) {
    const ad = (window.OGS.AdBoard && window.OGS.Store && !window.OGS.Store.adsRemoved() && window.OGS.AdBoard.active()[0]) || { business: 'Your Business Here', tagline: 'Advertise on OGS Lifestyle', color: '#e8a317' };
    const g = new THREE.Group(); const steel = mat('steel', { color: '#5d6166', metalness: 0.8, roughness: 0.4 });
    for (const x of [-3, 3]) g.add(box(0.3, 7, 0.3, steel, x, 3.5, -3));
    g.add(box(10, 4, 0.2, new THREE.MeshStandardMaterial({ map: TX.sign([ad.business.toUpperCase(), ad.tagline.slice(0, 40)], ad.color || '#0b6e4f', '#ffffff', 1024, 400), roughness: 0.6 }), 0, 7.5, -3));
    collideLocal(f, 0, -3, 7, 0.6);
    return g;
  },
  market(f, opts) {
    const g = new THREE.Group(); const wood = mat('post', { map: TX.wood(), roughness: 0.8 });
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
      const sx = -7.5 + i * 5; const sz = -3 - row * 6;
      for (const [dx, dz] of [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5]]) g.add(box(0.12, 2.6, 0.12, wood, sx + dx, 1.3, sz + dz));
      const cover = new THREE.MeshStandardMaterial({ map: TX.ankara(i + row + opts.seed), roughness: 0.85, side: THREE.DoubleSide });
      const c = box(4.6, 0.05, 3.6, cover, sx, 2.65, sz); c.rotation.x = -0.08; g.add(c);
      g.add(box(4, 0.9, 1.2, wood, sx, 0.45, sz + 0.6));
      if (opts.kind === 'adire') {
        for (let k = 0; k < 5; k++) g.add(box(0.7, 0.18 + R() * 0.25, 0.6, new THREE.MeshStandardMaterial({ map: TX.adire(k), roughness: 0.9 }), sx - 1.5 + k * 0.75, 1.0, sz + 0.6));
        for (let k = 0; k < 3; k++) { const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshStandardMaterial({ map: TX.adire(k + i), roughness: 0.9, side: THREE.DoubleSide })); cl.position.set(sx - 1.3 + k * 1.3, 1.55, sz - 1.45); cl.castShadow = true; g.add(cl); }
      } else { // produce: tomato & pepper pyramids, yams, plastic basins
        const fruit = [['#c0392b', 0.09], ['#e74c3c', 0.07], ['#f39c12', 0.08], ['#27ae60', 0.09]];
        for (let k = 0; k < 4; k++) {
          const [col, r] = fruit[(k + i) % fruit.length];
          for (let n = 0; n < 6; n++) { const fr = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat('fruit' + col, { color: col, roughness: 0.5 })); fr.position.set(sx - 1.5 + k * 1 + (n % 3) * r * 2 - r * 2, 0.97 + Math.floor(n / 3) * r * 1.6, sz + 0.6 + (n % 2) * 0.1); g.add(fr); }
        }
        for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.25, 16), mat('basin' + k, { color: ['#2e86c1', '#e74c3c'][k], roughness: 0.4 })); b.position.set(sx - 1 + k * 2, 0.12, sz - 1); g.add(b); }
        for (let k = 0; k < 3; k++) { const yam = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), mat('yam', { color: '#6e4b2a', roughness: 1 })); yam.rotation.z = Math.PI / 2; yam.position.set(sx + 1.2, 0.1 + k * 0.18, sz - 1.2 + k * 0.1); g.add(yam); }
      }
    }
    g.add(signBoard(opts.sign, opts.signBg, '#f5f0e6', 6, 1.5, 3.6, 0.3, true));
    for (let row = 0; row < 2; row++) collideLocal(f, 0, -3 + 0.6 - row * 6, 20, 1.4);
    return g;
  },
  motorpark(f) {
    const g = new THREE.Group();
    const shed = new THREE.MeshStandardMaterial({ map: TX.zinc([6, 2]), bumpMap: TX.zincBump([6, 1]), bumpScale: 0.05, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
    g.add(box(18, 0.06, 5, shed, 0, 4, -12)); for (const x of [-8.5, 0, 8.5]) g.add(box(0.2, 4, 0.2, mat('steel'), x, 2, -10.3));
    g.add(signBoard(['KUTO MOTOR PARK', 'LAGOS • IBADAN • IJEBU'], '#0b6e4f', '#ffffff', 7, 1.6, 4.2, -0.6, true));
    for (let i = 0; i < 3; i++) { const d = danfo(); d.position.set(-6 + i * 6, 0, -8); d.rotation.y = -Math.PI / 2; g.add(d); collideLocal(f, -6 + i * 6, -8, 2.2, 5); }
    return g;
  },
  olumo(f) {
    const g = new THREE.Group();
    const conc = mat('steps', { map: TX.concrete([1, 0.3]), roughness: 0.95 });
    for (let i = 0; i < 8; i++) g.add(box(4, 0.25, 1, conc, 0, 0.12 + i * 0.25, -1 - i));
    g.add(signBoard(['OLUMO ROCK', 'TOURIST CENTRE • ₦3,000'], '#5b4a35', '#f5e6c8', 4.5, 1.2, 2.6, 0.2, true));
    collideLocal(f, 0, -11, 5, 4);
    return g;
  },
  church(f) {
    const g = new THREE.Group();
    const b = building({ w: 9, d: 12, h: 5, color: '#fbfbf8', windows: 2, sign: ['REDEMPTION PARISH'], signColor: ['#ffffff', '#7b241c'] });
    b.position.z = -7; g.add(b);
    const wallM = new THREE.MeshStandardMaterial({ map: TX.plaster('#fbfbf8', [1, 3]), roughness: 0.9 });
    g.add(box(2.6, 10, 2.6, wallM, -3.5, 5, -2.2));
    const gold = mat('gold', { color: '#d4a90b', metalness: 1, roughness: 0.25 });
    g.add(box(0.2, 1.8, 0.2, gold, -3.5, 11, -2.2)); g.add(box(1, 0.2, 0.2, gold, -3.5, 11.4, -2.2));
    collideLocal(f, 0, -7, 9, 12); collideLocal(f, -3.5, -2.2, 2.6, 2.6);
    return g;
  },
  hall(f) {
    const g = new THREE.Group();
    const b = building({ w: 15, d: 10, h: 5.5, roof: 'flat', color: '#fef6e4', windows: 4, sign: ['GATEWAY EVENT HALL', 'OWAMBE EVERY SATURDAY'], signColor: ['#8e44ad', '#ffe600'] });
    b.position.z = -6; g.add(b);
    const pal = ['#e74c3c', '#f1c40f', '#27ae60', '#8e44ad', '#2980b9'];
    for (let i = 0; i < 18; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 3), mat('flag' + (i % 5), { color: pal[i % 5], roughness: 0.7, side: THREE.DoubleSide })); fl.rotation.x = Math.PI; fl.position.set(-7.5 + i * 0.88, 5.0 - Math.sin((i / 17) * Math.PI) * 0.5, -0.8); g.add(fl); }
    collideLocal(f, 0, -6, 15, 10);
    return g;
  },
  duplex(f) {
    const g = new THREE.Group(); const inner = new THREE.Group();
    compoundWall(inner, 18, 16, '#efe3c6', 4);
    const tiles = new THREE.MeshStandardMaterial({ color: '#8f2c1f', roughness: 0.6 });
    const b = building({ w: 12, d: 8, h: 6.6, storeys: 2, color: '#f3e5c3', windows: 3, sign: ['IBARA GRA'], signColor: ['#2c3e50', '#f1c40f'] });
    b.traverse((o) => { if (o.isMesh && o.material.map && o.material.map === TX.zinc([12 / 2, 2])) o.material = tiles; });
    b.position.set(0, 0, -2); inner.add(b);
    const car = new THREE.Mesh(new RoundedBoxGeometry(4.4, 1.3, 1.9, 4, 0.35), mat('benz', { color: '#1b1b1f', metalness: 0.9, roughness: 0.18 })); car.position.set(-4, 0.85, 4); car.castShadow = true; inner.add(car);
    for (const [x, z] of [[-1.4, 0.85], [1.4, 0.85], [-1.4, -0.85], [1.4, -0.85]]) { const w = wheel(0.38, 0.25); w.position.set(-4 + x, 0.38, 4 + z); inner.add(w); }
    inner.position.z = -8.2; g.add(inner);
    collideLocal(f, 0, -16.2, 18, 0.4); collideLocal(f, -9, -8.2, 0.4, 16); collideLocal(f, 9, -8.2, 0.4, 16);
    collideLocal(f, -5.5, -0.2, 7, 0.4); collideLocal(f, 5.5, -0.2, 7, 0.4); collideLocal(f, 0, -10.2, 12, 8); collideLocal(f, -4, -4.2, 4.6, 2.2);
    return g;
  },
  shop(f, o) {
    const g = new THREE.Group();
    const b = building({ w: o.w || 8, d: o.d || 7, h: o.h || 3.6, color: o.color, windows: 2, sign: o.sign, signColor: o.signColor, roof: o.roof || 'gable' });
    b.position.z = -(o.d || 7) / 2 - 0.6; g.add(b);
    if (o.neon) for (const [c, y] of [['#ff2d95', 3.75], ['#00e5ff', 3.55]]) g.add(box((o.w || 8) + 0.6, 0.06, 0.06, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2 }), 0, y, 0.3, { cast: false }));
    if (o.extra) o.extra(g);
    collideLocal(f, 0, -(o.d || 7) / 2 - 0.6, o.w || 8, o.d || 7);
    return g;
  },
  okadapark(f) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 10), mat('bark', { map: TX.bark(), roughness: 0.95 })); trunk.position.set(0, 2, -7); trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 5; i++) { const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), mat('canopy', { color: '#2f6b1f', roughness: 0.9, flatShading: true })); leaf.position.set(rr(-2.2, 2.2), 5 + rr(-0.5, 1), -7 + rr(-2, 2)); leaf.castShadow = true; g.add(leaf); }
    collideLocal(f, 0, -7, 1, 1);
    for (let i = 0; i < 4; i++) { const b = okada(); b.children.filter((c) => c.userData && c.userData.legs).forEach((c) => b.remove(c)); b.position.set(-5 + i * 2.6, 0, -3.5); b.rotation.y = -Math.PI / 2 + rr(-0.3, 0.3); g.add(b); }
    g.add(signBoard(['OKADA PARK', 'HIRE A BIKE • ₦3,000'], '#a93226', '#fff', 4, 1.1, 2.4, 0.2, true));
    return g;
  },
};

function buildPlace(id, f) {
  switch (id) {
    case 'itoku': return BUILD.market(f, { kind: 'adire', seed: 0, sign: ['ITOKU ADIRE MARKET', 'HAND-DYED IN ABEOKUTA'], signBg: '#1b2a6b' });
    case 'kuto': return BUILD.market(f, { kind: 'produce', seed: 1, sign: ['KUTO MARKET', 'FOODSTUFF • PROVISIONS'], signBg: '#7b241c' });
    case 'motor-park': return BUILD.motorpark(f);
    case 'okada-park': return BUILD.okadapark(f);
    case 'panseke': return BUILD.shop(f, { w: 12, d: 8, h: 4, color: '#2a2440', sign: ['PANSEKE JUNCTION LOUNGE', 'SUYA • DRINKS • MUSIC'], signColor: ['#120f1f', '#ff2d95'], neon: true, roof: 'flat',
      extra: (g) => { for (let i = 0; i < 3; i++) { g.add(box(0.8, 0.05, 0.8, mat('pchair', { color: '#e74c3c', roughness: 0.5 }), -4 + i * 3, 0.75, 1.8)); g.add(box(0.06, 0.75, 0.06, mat('pchair'), -4 + i * 3, 0.37, 1.8)); } } });
    case 'gym': return BUILD.shop(f, { w: 8, d: 7, color: '#9aa5ab', sign: ['IRON GYM', 'NO PAIN NO GAIN'], signColor: ['#111', '#e74c3c'] });
    case 'agent': return BUILD.shop(f, { w: 8, d: 7, color: '#f5deb3', sign: ['KUTO LANDS & PROPERTIES', 'TO LET • FOR SALE'], signColor: ['#fff', '#8e5a2b'] });
    case 'trace': return BUILD.shop(f, { w: 9, d: 7, color: '#f4f4f0', sign: ['TRACE OFFICE', 'TRAFFIC COMPLIANCE'], signColor: ['#ff7a00', '#fff'],
      extra: (g) => { for (let i = 0; i < 3; i++) { const b = okada(); b.children.filter((c) => c.userData && c.userData.legs).forEach((c) => b.remove(c)); b.position.set(-3 + i * 2.2, 0, -0.1); b.rotation.y = 0.15; g.add(b); } } });
    default: return BUILD[id](f);
  }
}

// Draw a road segment (with sidewalks, curbs and open gutters) between two along-coordinates.
function roadSegment(group, road, a0, a1, mats) {
  const L = a1 - a0; const mid = (a0 + a1) / 2;
  const put = (mesh, off, y) => { // off = across-road offset
    if (road.axis === 'x') mesh.position.set(mid, y, road.at + off); else { mesh.position.set(road.at + off, y, mid); mesh.rotation.y = Math.PI / 2; }
    group.add(mesh); return mesh;
  };
  const flat = (w, h, m, off, y) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.rotation.x = -Math.PI / 2; p.receiveShadow = true; const g2 = new THREE.Group(); g2.add(p); return put(g2, off, y); };
  flat(L, 9, mats.asphalt, 0, 0.02);
  for (let x = a0 + 2; x < a1 - 2; x += 6) { const d = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.15), mats.line); d.rotation.x = -Math.PI / 2; const g2 = new THREE.Group(); g2.add(d); if (road.axis === 'x') g2.position.set(x + 1.5, 0.03, road.at); else { g2.position.set(road.at, 0.03, x + 1.5); g2.rotation.y = Math.PI / 2; } group.add(g2); }
  for (const s of [-1, 1]) {
    put(new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 2.6), mats.conc), s * 5.8, 0.09).children;
    put(new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, 0.15), mats.curb), s * 4.55, 0.11);
    put(new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, 0.12), mats.conc), s * 7.15, 0.05);
    put(new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, 0.12), mats.conc), s * 7.95, 0.05);
    flat(L, 0.7, mats.water, s * 7.55, -0.15);
    // gutter collider
    if (road.axis === 'x') collide(mid, road.at + s * 7.55, L, 0.9); else collide(road.at + s * 7.55, mid, 0.9, L);
  }
}

function buildTown(root) {
  R = makeRand(11);
  const mats = {
    asphalt: new THREE.MeshStandardMaterial({ map: TX.asphalt([2.5, 1.2]), roughnessMap: TX.asphaltRough([2.5, 1.2]), roughness: 0.9 }),
    line: mat('roadline', { color: '#e3bf3c', roughness: 0.7 }),
    conc: new THREE.MeshStandardMaterial({ map: TX.concrete([4, 0.6]), roughness: 0.95 }),
    curb: mat('curb', { color: '#c9c3b6', roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: '#2a3a33', roughness: 0.15, metalness: 0.2 }),
  };
  root.add(plane(600, 600, new THREE.MeshStandardMaterial({ map: TX.grass([80, 80]), roughness: 1 }), 0, -0.02, -40));
  root.add(plane(200, 135, new THREE.MeshStandardMaterial({ map: TX.laterite([26, 18]), roughness: 1 }), 0, 0.0, -32));

  // Roads: split each road around intersections
  const xs = ROADS.filter((r) => r.axis === 'z').map((r) => r.at);
  const zs = ROADS.filter((r) => r.axis === 'x').map((r) => r.at);
  for (const road of ROADS) {
    const cuts = (road.axis === 'x' ? xs : zs).filter((c) => c > road.from && c < road.to).sort((a, b) => a - b);
    let a = road.from;
    for (const c of cuts) { roadSegment(root, road, a, c - CROSS, mats); a = c + CROSS; }
    roadSegment(root, road, a, road.to, mats);
  }
  for (const x of xs) for (const z of zs) root.add(plane(CROSS * 2, CROSS * 2, mats.asphalt, x, 0.021, z));
  // Gutters end at intersections: let people cross there.
  for (const x of xs) for (const z of zs) colliders.push({ hole: true, minX: x - CROSS - 0.5, maxX: x + CROSS + 0.5, minZ: z - CROSS - 0.5, maxZ: z + CROSS + 0.5 });

  // Places
  for (const [id, roadId, side, along] of LAYOUT) {
    const road = roadOf(roadId);
    const f = frontage(road, side, along);
    const g = buildPlace(id, f);
    g.position.set(f.x, 0, f.z); g.rotation.y = f.rot;
    root.add(g);
    // slab over the gutter + a hole in its collider
    const slab = box(3, 0.12, 1.1, mats.conc, 0, 0.22, 0);
    const sp = road.axis === 'x' ? { x: along, z: road.at + side * 7.55 } : { x: road.at + side * 7.55, z: along };
    slab.position.set(sp.x, 0.22, sp.z); if (road.axis === 'z') slab.rotation.y = Math.PI / 2; root.add(slab);
    colliders.push({ hole: true, minX: sp.x - 1.6, maxX: sp.x + 1.6, minZ: sp.z - 1.6, maxZ: sp.z + 1.6 });
    if (id !== 'billboard') {
      const door = road.axis === 'x' ? { x: along, z: road.at + side * 9.3 } : { x: road.at + side * 9.3, z: along };
      PLACES3D.push({ id, x: door.x, z: door.z, road: road.name });
    }
  }

  // Palms, poles & wires along the roads
  const palmSpots = [[-86, -9.5], [-44, -9.5], [-16, -9.5], [26, 9.5], [52, -9.5], [-80, 9.5], [-50, 9.5], [-22, 9.5], [18, 9.5], [52, 9.5], [86, 9.5],
    [-86, -69.5], [-40, -69.5], [30, -69.5], [56, -69.5], [-80, -50.5], [-40, -50.5], [30, -50.5], [50, -50.5],
    [-39.5, -30], [-20.5, -40], [-39.5, 20], [30.5, -25], [49.5, -35], [49.5, 18], [-20.5, 22], [30.5, 24]];
  for (const [x, z] of palmSpots) root.add(palm(x, z, rr(0.85, 1.15)));
  for (const road of ROADS.filter((r) => r.axis === 'x')) {
    const px = []; for (let x = -90; x <= 90; x += 20) if (!xs.some((c) => Math.abs(c - x) < CROSS + 1)) px.push(x);
    for (const x of px) root.add(pole(x, road.at - 4.9));
    wires(root, px, road.at - 4.9);
  }

  // Olumo Rock rising behind the north of town, plus far hills
  const olumo = new THREE.Group();
  const big = rock(22, 3, [4, 4]); big.scale.set(26, 20, 18); olumo.add(big);
  const r2 = rock(12, 8, [3, 3]); r2.position.set(-24, 0, 6); r2.scale.set(14, 16, 12); olumo.add(r2);
  const r3 = rock(9, 13, [2, 2]); r3.position.set(20, 0, 10); r3.scale.set(12, 9, 10); olumo.add(r3);
  olumo.position.set(-62, 0, -112); root.add(olumo);
  for (let i = 0; i < 7; i++) { const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), mat('hill', { map: TX.grass([6, 6]), roughness: 1 })); hill.scale.set(rr(30, 60), rr(8, 18), rr(20, 40)); hill.position.set(-150 + i * 50, -2, rr(-200, -160)); root.add(hill); }
}

// Merge static meshes by material: thousands of meshes become a few dozen draw calls.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.clearGroups();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) return;
    g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? 'c' : '');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast; m.receiveShadow = true;
    out.add(m);
  }
  return out;
}

// ---------- scene setup ----------
let renderer; let scene; let camera; let sky; let sun; let hemi; let skyLight; let stars; let minimap;
let running = false; let raf = 0; let hooks = null; let player = null; let lastT = 0;
const traffic = []; const npcs = []; const smoke = []; const smokeSources = [];
let camYaw = 0; const camFocus = new THREE.Vector3(); let manualUntil = 0; let nearId = null; let pmrem = null; let envRT = null; let lastSunKey = ''; let mapAt = 0;
const keys = {};

function outfitOf(s) {
  const drip = (s.hustle && s.hustle.drip) || [];
  return drip.includes('aso-oke') ? 'asooke' : drip.includes('corporate') ? 'corporate' : drip.includes('anago') ? 'anago' : drip.includes('adire-fit') ? 'adire' : 'tee';
}
function makePlayer(s) {
  const p = person({ female: s.gender === 'female', skin: SKINS[s.seed % SKINS.length], outfit: outfitOf(s) });
  p.userData.outfitKey = s.gender + outfitOf(s);
  return p;
}

export async function mount(el, h) {
  hooks = h;
  if (renderer) return;
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.25 : 1.6));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 700);

  sky = new Sky(); sky.scale.setScalar(4500); scene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = 8; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.85;
  pmrem = new THREE.PMREMGenerator(renderer);

  hemi = new THREE.HemisphereLight('#cfe6ff', '#7a4a2a', 0.6); scene.add(hemi);
  sun = new THREE.DirectionalLight('#fff1d6', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  skyLight = new THREE.DirectionalLight('#6f86c9', 0); skyLight.position.set(-30, 60, 20); scene.add(skyLight);
  scene.fog = new THREE.Fog('#cfd9e3', 80, 360);

  const sg = new THREE.BufferGeometry(); const sp = [];
  for (let i = 0; i < 1500; i++) { const th = Math.random() * Math.PI * 2; const ph = Math.random() * Math.PI * 0.45; sp.push(Math.cos(th) * Math.sin(ph) * 400, Math.cos(ph) * 400, Math.sin(th) * Math.sin(ph) * 400); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);

  const root = new THREE.Group();
  buildTown(root);
  scene.add(mergeStatic(root));

  const s = hooks.state();
  player = makePlayer(s);
  const home = PLACES3D.find((p) => p.id === 'home');
  const start = s.world3d && s.world3d.v === 2 ? s.world3d : { x: home.x, z: home.z + 3.3 };
  player.position.set(start.x, 0, start.z);
  scene.add(player);

  // Traffic on every road
  const lanes = [
    ['kuto', danfo, -1, 9], ['kuto', keke, 1, 7], ['kuto', okada, 1, 11], ['kuto', danfo, -1, 8],
    ['olumo', keke, -1, 7], ['olumo', danfo, 1, 8], ['olumo', okada, -1, 12],
    ['panseke', okada, 1, 10], ['panseke', keke, -1, 6], ['ibara', danfo, -1, 8], ['ibara', okada, 1, 11],
  ];
  lanes.forEach(([rid, make, dir, speed], i) => {
    const road = roadOf(rid); const v = make();
    const lane = road.at + (road.axis === 'x' ? -dir : dir) * 2.2;
    if (road.axis === 'x') { v.rotation.y = dir > 0 ? 0 : Math.PI; v.position.set(road.from + ((i * 37) % (road.to - road.from)), 0, lane); }
    else { v.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2; v.position.set(lane, 0, road.from + ((i * 29) % (road.to - road.from))); }
    scene.add(v); traffic.push({ v, road, dir, speed, make, honk: 0 });
  });
  // Pedestrians on the sidewalks
  const peds = [
    ['kuto', 1, 'trader', true, true, -80, -40], ['kuto', -1, 'tee', false, false, -60, 20], ['kuto', 1, 'trader', true, false, -10, 30], ['kuto', -1, 'trace', false, false, 30, 30.5],
    ['kuto', 1, 'tee', false, false, 50, 80], ['olumo', -1, 'trader', true, true, -10, 25], ['olumo', 1, 'tee', false, false, -80, -55], ['olumo', 1, 'anago', true, false, 0, 30],
    ['panseke', -1, 'tee', false, false, -50, -10], ['ibara', 1, 'corporate', false, false, -50, -10],
  ];
  peds.forEach(([rid, side, outfit, female, tray, a0, a1], i) => {
    const road = roadOf(rid);
    const p = person({ female, outfit, tray, skin: SKINS[i % 4] });
    scene.add(p);
    npcs.push({ p, road, off: road.at + side * 5.6, a0, a1, a: a0 + R() * (a1 - a0), dir: R() < 0.5 ? 1 : -1, still: a1 - a0 < 1 });
  });
  const smokeTex = canvasTex('smoke', 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(220,220,220,.6)'); g.addColorStop(1, 'rgba(220,220,220,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  for (const src of smokeSources) for (let i = 0; i < 12; i++) { const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); sm.userData = { t: i / 12, src }; scene.add(sm); smoke.push(sm); }

  // Minimap
  minimap = document.createElement('canvas');
  minimap.width = 150; minimap.height = 120; minimap.className = 'minimap';
  el.appendChild(minimap);

  window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if ((e.key === 'e' || e.key === 'Enter') && running) hooks.enter(); });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: camYaw }; });
  window.addEventListener('pointermove', (e) => { if (drag) { camYaw = drag.yaw - (e.clientX - drag.x) * 0.006; manualUntil = performance.now() + 5000; } });
  window.addEventListener('pointerup', () => { drag = null; });
  new ResizeObserver(() => { const w = el.clientWidth; const hh = el.clientHeight; if (!w || !hh) return; renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix(); }).observe(el);

  running = true;
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
}

function updateSky(s) {
  const hr = (s.clock ? s.clock.min : 720) / 60;
  const dayT = (hr - 6.4) / 12.4;
  const elev = Math.sin(Math.PI * Math.min(Math.max(dayT, -0.15), 1.15)) * 65;
  const azim = 90 + dayT * 180;
  const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azim));
  sky.material.uniforms.sunPosition.value.copy(dir);
  const day = THREE.MathUtils.clamp((elev + 4) / 14, 0, 1);
  const golden = THREE.MathUtils.clamp(1 - Math.abs(elev - 6) / 14, 0, 1);
  sun.intensity = 3.2 * day;
  sun.color.set('#fff1d6').lerp(new THREE.Color('#ff9a4d'), golden * 0.8);
  hemi.intensity = 0.05 + 0.65 * day;
  skyLight.intensity = 0.22 * (1 - day);
  renderer.toneMappingExposure = 0.5 + (1 - day) * 0.2;
  stars.material.opacity = (1 - day) * 0.9;
  scene.fog.color.copy(new THREE.Color('#0b1020').lerp(new THREE.Color('#cfd9e3'), day).lerp(new THREE.Color('#e8b98c'), golden * 0.35));
  const nightAmt = 1 - day;
  for (const m of nightGlow) m.emissiveIntensity = nightAmt * 1.2;
  for (const l of streetLights) { l.bulbMat.emissiveIntensity = nightAmt * 4; l.poolMat.opacity = nightAmt * 0.75; }
  sun.position.copy(player.position).addScaledVector(dir, 120);
  sun.target.position.copy(player.position);
  const key = Math.round(elev / 2);
  if (key !== lastSunKey) {
    lastSunKey = key;
    if (envRT) envRT.dispose();
    const tmp = new THREE.Scene(); tmp.add(sky.clone());
    envRT = pmrem.fromScene(tmp, 0, 0.1, 1000);
    scene.environment = envRT.texture;
  }
}

function blockedAt(x, z) {
  for (const c of colliders) {
    if (c.hole) continue;
    if (x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) {
      if (colliders.some((hh) => hh.hole && x > hh.minX && x < hh.maxX && z > hh.minZ && z < hh.maxZ)) continue;
      return true;
    }
  }
  return x < -94 || x > 94 || z < -94 || z > 31;
}

function nearestRoad(x, z) {
  let best = null; let bd = 1e9;
  for (const r of ROADS) {
    const along = r.axis === 'x' ? x : z;
    if (along < r.from || along > r.to) continue;
    const d = Math.abs((r.axis === 'x' ? z : x) - r.at);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

function drawMinimap() {
  const c = minimap.getContext('2d');
  const W = minimap.width; const H = minimap.height;
  const sx = (x) => ((x + 96) / 192) * W; const sz = (z) => ((z + 100) / 133) * H;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(30,40,35,.72)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = '#9aa0a6'; c.lineWidth = 4;
  for (const r of ROADS) { c.beginPath(); if (r.axis === 'x') { c.moveTo(sx(r.from), sz(r.at)); c.lineTo(sx(r.to), sz(r.at)); } else { c.moveTo(sx(r.at), sz(r.from)); c.lineTo(sx(r.at), sz(r.to)); } c.stroke(); }
  for (const p of PLACES3D) { c.fillStyle = p.id === nearId ? '#ffe600' : p.id === 'home' ? '#2ecc71' : '#e8a317'; c.fillRect(sx(p.x) - 2, sz(p.z) - 2, 4, 4); }
  c.fillStyle = '#7f7a6e'; c.beginPath(); c.arc(sx(-62), sz(-100), 6, 0, Math.PI * 2); c.fill();
  // player arrow
  c.save(); c.translate(sx(player.position.x), sz(player.position.z)); c.rotate(-player.rotation.y + Math.PI);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4, 4); c.lineTo(-4, 4); c.closePath(); c.fill(); c.restore();
  const road = nearestRoad(player.position.x, player.position.z);
  c.fillStyle = '#fff'; c.font = 'bold 10px Arial'; c.fillText(road ? road.name : 'Abeokuta', 5, H - 5);
}

function loop(now) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;
  const s = hooks.state();
  if (!s) return;

  const ok = s.gender + outfitOf(s);
  if (player.userData.outfitKey !== ok) { const p2 = makePlayer(s); p2.position.copy(player.position); p2.rotation.copy(player.rotation); scene.remove(player); player = p2; scene.add(player); }

  const joy = (window.OGS.World && window.OGS.World.joy) || { x: 0, y: 0 };
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x;
  let iz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.y;
  const len = Math.hypot(ix, iz);
  let speed = 0;
  if (len > 0.15 && !hooks.blocked()) {
    ix /= Math.max(1, len); iz /= Math.max(1, len);
    const cos = Math.cos(camYaw); const sin = Math.sin(camYaw);
    const mx = ix * cos + iz * sin; const mz = -ix * sin + iz * cos;
    const tired = s.needs && s.needs.energy < 15;
    speed = (tired ? 2.6 : 5) * Math.min(1, len);
    const nx = player.position.x + mx * speed * dt; const nz = player.position.z + mz * speed * dt;
    if (!blockedAt(nx, player.position.z)) player.position.x = nx;
    if (!blockedAt(player.position.x, nz)) player.position.z = nz;
    const target = Math.atan2(mx, mz);
    let d = target - player.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    player.rotation.y += d * Math.min(1, dt * 12);
  }
  animatePerson(player, speed, t);
  s.world3d = { v: 2, x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2) };

  // Camera: from the road side, looking at the buildings you're near
  if (now > manualUntil) {
    const road = nearestRoad(player.position.x, player.position.z);
    let want = camYaw;
    if (road && road.axis === 'x') want = player.position.z < road.at ? 0 : Math.PI;
    else if (road) want = player.position.x < road.at ? Math.PI / 2 : -Math.PI / 2;
    let dy = want - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * Math.min(1, dt * 2.5);
  }
  // Follow a smoothed focus point and orbit around it, so camera swings arc around you.
  if (camFocus.distanceTo(player.position) > 15) camFocus.copy(player.position);
  camFocus.lerp(player.position, 1 - Math.pow(0.001, dt));
  camera.position.set(camFocus.x + Math.sin(camYaw) * 10, 5.2, camFocus.z + Math.cos(camYaw) * 10);
  camera.lookAt(camFocus.x, 2.2, camFocus.z);

  let near = null;
  for (const p of PLACES3D) if (Math.hypot(player.position.x - p.x, player.position.z - p.z) < 2.6) { near = p; break; }
  const id = near && near.id;
  if (id !== nearId) {
    nearId = id;
    const def = id && window.OGS.World.PLACES.find((x) => x.id === id);
    hooks.near(def || null);
  }

  for (const tv of traffic) {
    const r = tv.road; const span = r.to - r.from + 20;
    const key = r.axis === 'x' ? 'x' : 'z';
    let a = tv.v.position[key] + tv.dir * tv.speed * dt;
    if (a > r.to + 10) a -= span; if (a < r.from - 10) a += span;
    tv.v.position[key] = a;
    for (const w of tv.v.userData.wheels) w.rotation.z -= tv.speed * dt / 0.4;
    const d = Math.hypot(tv.v.position.x - player.position.x, tv.v.position.z - player.position.z);
    if (d < 3 && t > tv.honk) { tv.honk = t + 4; if (hooks.say) hooks.say(tv.make === danfo ? '"Kpo kpo! Comot for road!"' : '"Oga shift!"'); }
  }
  for (const n of npcs) {
    if (!n.still) {
      n.a += n.dir * 1.2 * dt;
      if (n.a > n.a1) n.dir = -1; if (n.a < n.a0) n.dir = 1;
      if (n.road.axis === 'x') { n.p.position.set(n.a, 0, n.off); n.p.rotation.y = n.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { n.p.position.set(n.off, 0, n.a); n.p.rotation.y = n.dir > 0 ? 0 : Math.PI; }
      animatePerson(n.p, 1, t);
    } else {
      if (n.road.axis === 'x') n.p.position.set(n.a0, 0, n.off); else n.p.position.set(n.off, 0, n.a0);
      n.p.rotation.y = Math.atan2(player.position.x - n.p.position.x, player.position.z - n.p.position.z);
    }
  }
  for (const sm of smoke) {
    sm.userData.t = (sm.userData.t + dt * 0.12) % 1;
    const k = sm.userData.t; const src = sm.userData.src;
    sm.position.set(src.x + Math.sin(k * 6 + t) * 0.3 * k, src.y + k * 4, src.z + k * 0.5);
    sm.scale.setScalar(0.6 + k * 2.2);
    sm.material.opacity = (1 - k) * 0.5;
  }

  updateSky(s);
  renderer.render(scene, camera);
  if (now > mapAt) { mapAt = now + 200; drawMinimap(); }
}

export function pause() { running = false; cancelAnimationFrame(raf); }
export function resume() { if (!renderer || running) return; running = true; lastT = performance.now(); raf = requestAnimationFrame(loop); }
export function isMounted() { return !!renderer; }
export function debug() { return { scene, camera, player, renderer, places: PLACES3D, teleport: (x, z) => { player.position.set(x, 0, z); camFocus.set(x, 0, z); const r = nearestRoad(x, z); if (r) camYaw = r.axis === 'x' ? (z < r.at ? 0 : Math.PI) : (x < r.at ? Math.PI / 2 : -Math.PI / 2); } }; }
