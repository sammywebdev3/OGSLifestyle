/*
 * OGS Lifestyle — interactive map of Ogun State built on Leaflet +
 * OpenStreetMap. Curated game locations are drawn as markers; the
 * "Live OSM" layer pulls every real school, hospital, market, place of
 * worship and attraction in view from the Overpass API.
 */
(function (root) {
  'use strict';
  const D = root.OGS.Data;
  const E = root.OGS.Engine;

  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const OVERPASS = 'https://overpass-api.de/api/interpreter';

  const KIND_ICON = {
    university: '🎓', polytechnic: '🏛️', coe: '📘', health: '⚕️',
    secondary: '🏫', landmark: '🗿', market: '🛍️', worship: '🛐',
    hospital: '🏥', workplace: '🏭', leisure: '🎉', prison: '🔒', housing: '🏡',
  };

  let map, layers, meMarker, liveLayer, searchMarker, popupBuilder, zoneLayer, adLayer;

  function emojiIcon(emoji, cls = '') {
    return L.divIcon({ className: '', html: `<div class="emoji-pin ${cls}">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -10] });
  }

  function init(el, buildPopup) {
    popupBuilder = buildPopup;
    map = L.map(el, { zoomControl: true, minZoom: 8, maxBounds: [[5.8, 2.2], [8.5, 5.2]] }).setView(D.OGUN_CENTER, 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    layers = {
      'Towns': L.layerGroup(),
      '🎓 Universities': L.layerGroup(),
      '🏛️ Polytechnics & Colleges': L.layerGroup(),
      '🏫 Secondary schools': L.layerGroup(),
      '🏥 Hospitals': L.layerGroup(),
      '🗿 Landmarks, markets & worship': L.layerGroup(),
      '🏭 Workplaces': L.layerGroup(),
      '🔒 Prisons': L.layerGroup(),
    };
    liveLayer = L.layerGroup();

    for (const t of D.TOWNS) {
      const r = t.size === 'city' ? 9 : t.size === 'town' ? 6 : 4;
      L.circleMarker([t.lat, t.lng], { radius: r, color: '#0b6e4f', weight: 2, fillColor: '#2fb487', fillOpacity: 0.6 })
        .bindTooltip(t.name, { permanent: t.size === 'city', direction: 'right', className: 'town-label', offset: [6, 0] })
        .bindPopup(() => popupBuilder('town', t.id), { maxWidth: 300 })
        .addTo(layers['Towns']);
    }
    for (const i of D.INSTITUTIONS) {
      const group = i.kind === 'university' ? '🎓 Universities' : '🏛️ Polytechnics & Colleges';
      L.marker([i.lat, i.lng], { icon: emojiIcon(KIND_ICON[i.kind]), title: i.name })
        .bindPopup(() => popupBuilder('inst', i.id), { maxWidth: 320 })
        .addTo(layers[group]);
    }
    for (const sc of D.SECONDARY) {
      L.marker([sc.lat, sc.lng], { icon: emojiIcon(KIND_ICON.secondary), title: sc.name })
        .bindPopup(() => popupBuilder('sec', sc.id), { maxWidth: 300 })
        .addTo(layers['🏫 Secondary schools']);
    }
    for (const p of D.PLACES) {
      const group = p.kind === 'hospital' ? '🏥 Hospitals' : p.kind === 'workplace' ? '🏭 Workplaces' : p.kind === 'prison' ? '🔒 Prisons' : '🗿 Landmarks, markets & worship';
      L.marker([p.lat, p.lng], { icon: emojiIcon(KIND_ICON[p.kind]), title: p.name })
        .bindPopup(() => popupBuilder('place', p.id), { maxWidth: 320 })
        .addTo(layers[group]);
    }
    Object.values(layers).forEach((l) => l.addTo(map));
    L.control.layers(null, Object.assign({}, layers, { '📡 Live OSM places': liveLayer }), { collapsed: true }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    loadBoundary();
    return map;
  }

  // Draw the real Ogun State outline from OpenStreetMap (best effort).
  async function loadBoundary() {
    try {
      const url = `${NOMINATIM}?format=json&polygon_geojson=1&polygon_threshold=0.002&limit=1&q=${encodeURIComponent('Ogun State, Nigeria')}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const js = await res.json();
      if (js[0] && js[0].geojson) {
        L.geoJSON(js[0].geojson, { style: { color: '#23408e', weight: 2, dashArray: '6 4', fill: false }, interactive: false }).addTo(map);
      }
    } catch (e) { /* offline — the game still works */ }
  }

  // Hustle Mode: the four zones (locked ones greyed out) and sponsor billboards.
  function setOverlays(zones, unlocked, ads) {
    if (!map) return;
    if (!zoneLayer) { zoneLayer = L.layerGroup().addTo(map); adLayer = L.layerGroup().addTo(map); }
    zoneLayer.clearLayers();
    adLayer.clearLayers();
    for (const z of zones || []) {
      const open = unlocked(z.id);
      L.circle([z.lat, z.lng], { radius: z.radius, color: open ? z.color : '#888', weight: 2, dashArray: open ? null : '6 6', fillColor: open ? z.color : '#555', fillOpacity: open ? 0.06 : 0.18, interactive: false }).addTo(zoneLayer);
      L.marker([z.lat + z.radius / 111000 * 0.75, z.lng], { icon: L.divIcon({ className: '', html: `<div class="zone-label ${open ? '' : 'locked'}" style="--zc:${z.color}">${open ? '' : '🔒 '}${escapeHtml(z.name)}<small>${escapeHtml(z.theme)}${open ? '' : ' · level ' + z.unlock}</small></div>`, iconSize: [160, 34], iconAnchor: [80, 17] }), interactive: false }).addTo(zoneLayer);
    }
    for (const a of ads || []) {
      L.marker([a.lat, a.lng], { icon: emojiIcon('📢'), title: a.business })
        .bindPopup(`<h3>📢 ${escapeHtml(a.business)}</h3><p>${escapeHtml(a.tagline)}</p><p class="small">Billboard at ${escapeHtml(a.where)}${a.sample ? ' · sample ad' : ''}</p>`)
        .addTo(adLayer);
    }
  }

  function updatePlayer(s) {
    if (!map) return;
    const t = E.TOWN[s.town];
    const latlng = [t.lat + 0.004, t.lng - 0.004];
    if (!meMarker) {
      meMarker = L.marker(latlng, { icon: emojiIcon(s.gender === 'female' ? '🙋🏾‍♀️' : '🙋🏾‍♂️', 'me'), zIndexOffset: 1000, title: 'You' })
        .bindPopup(() => popupBuilder('me'))
        .addTo(map);
    } else {
      meMarker.setLatLng(latlng);
      meMarker.setIcon(emojiIcon(s.gender === 'female' ? '🙋🏾‍♀️' : '🙋🏾‍♂️', 'me'));
    }
  }

  function focus(lat, lng, zoom = 14) {
    if (map) map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }

  function focusMe(s) {
    const t = E.TOWN[s.town];
    focus(t.lat, t.lng, 12);
    setTimeout(() => meMarker && meMarker.openPopup(), 900);
  }

  function invalidate() { if (map) setTimeout(() => map.invalidateSize(), 50); }

  // Open the popup for a curated marker near the given point.
  function openAt(lat, lng) {
    focus(lat, lng, 15);
    setTimeout(() => {
      map.eachLayer((l) => {
        if (l.getLatLng && l.getPopup && l.getPopup()) {
          const p = l.getLatLng();
          if (Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lng - lng) < 1e-6) l.openPopup();
        }
      });
    }, 900);
  }

  const LIVE_STYLE = {
    school: { color: '#23408e', label: 'School' },
    kindergarten: { color: '#5c7ae0', label: 'Nursery school' },
    college: { color: '#7b2fbf', label: 'College' },
    university: { color: '#7b2fbf', label: 'University' },
    hospital: { color: '#c0392b', label: 'Hospital' },
    clinic: { color: '#e57368', label: 'Clinic' },
    marketplace: { color: '#e8a317', label: 'Market' },
    place_of_worship: { color: '#6b4f2a', label: 'Place of worship' },
    bank: { color: '#0b6e4f', label: 'Bank' },
    fuel: { color: '#555', label: 'Filling station' },
    attraction: { color: '#d35400', label: 'Attraction' },
    museum: { color: '#d35400', label: 'Museum' },
    hotel: { color: '#16a085', label: 'Hotel' },
  };

  async function loadLive() {
    if (!map) return { ok: false, msg: 'Map not ready.' };
    if (map.getZoom() < 12) return { ok: false, msg: 'Zoom in closer (to a town) before loading live places.' };
    const b = map.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(4)).join(',');
    const q = `[out:json][timeout:25];(
      nwr["amenity"~"^(school|kindergarten|college|university|hospital|clinic|marketplace|place_of_worship|bank|fuel)$"](${bbox});
      nwr["tourism"~"^(attraction|museum|hotel)$"](${bbox});
    );out center 600;`;
    const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (!res.ok) return { ok: false, msg: `OpenStreetMap server busy (${res.status}). Try again shortly.` };
    const js = await res.json();
    liveLayer.clearLayers();
    let n = 0;
    for (const el of js.elements || []) {
      const lat = el.lat != null ? el.lat : el.center && el.center.lat;
      const lng = el.lon != null ? el.lon : el.center && el.center.lon;
      if (lat == null) continue;
      const tags = el.tags || {};
      const type = tags.amenity || tags.tourism;
      const st = LIVE_STYLE[type] || { color: '#777', label: type };
      const name = tags.name || `Unnamed ${st.label.toLowerCase()}`;
      const extra = [tags['isced:level'] && `Level: ${tags['isced:level']}`, tags.operator && `Operator: ${tags.operator}`, tags.religion && `Religion: ${tags.religion}`, tags['addr:street'] && tags['addr:street']].filter(Boolean).join(' · ');
      L.circleMarker([lat, lng], { radius: 5, color: st.color, weight: 1, fillColor: st.color, fillOpacity: 0.8 })
        .bindPopup(`<h3>${escapeHtml(name)}</h3><span class="pill">${escapeHtml(st.label)}</span><p class="small">${escapeHtml(extra)}</p><a href="https://www.openstreetmap.org/${el.type}/${el.id}" target="_blank" rel="noopener">View on OpenStreetMap ↗</a>`)
        .addTo(liveLayer);
      n++;
    }
    liveLayer.addTo(map);
    return { ok: true, msg: `Loaded ${n} real places from OpenStreetMap.` };
  }

  async function search(q) {
    const url = `${NOMINATIM}?format=json&limit=8&countrycodes=ng&viewbox=2.68,7.98,4.62,6.3&bounded=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Search failed');
    return (await res.json()).map((r) => ({ name: r.display_name, lat: +r.lat, lng: +r.lon, type: r.type }));
  }

  function showSearchResult(r) {
    if (searchMarker) searchMarker.remove();
    searchMarker = L.marker([r.lat, r.lng]).bindPopup(`<h3>${escapeHtml(r.name.split(',')[0])}</h3><p class="small">${escapeHtml(r.name)}</p>`).addTo(map).openPopup();
    focus(r.lat, r.lng, 15);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  root.OGS.Map = { init, setOverlays, updatePlayer, focus, focusMe, invalidate, openAt, loadLive, search, showSearchResult, escapeHtml, KIND_ICON };
})(typeof globalThis !== 'undefined' ? globalThis : this);
