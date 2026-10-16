/*
 * OGS Lifestyle service worker: caches the app shell so the game opens
 * offline and loads fast on slow data. Map tiles and live OSM lookups
 * always come from the network.
 */
const CACHE = 'ogs-lifestyle-v5';
const SHELL = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png',
  './js/data.js', './js/engine.js', './js/life.js', './js/society.js', './js/hustle.js', './js/adboard.js', './js/store.js', './js/map.js', './js/world.js', './js/world3d.js', './js/ui.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/phaser@3.80.1/dist/phaser.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (/tile\.openstreetmap|nominatim|overpass/.test(url.host)) return; // network only
  // Network first for our own files (so updates arrive), cache as fallback.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && (url.origin === location.origin || url.host === 'unpkg.com')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
