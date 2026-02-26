// ── Config ────────────────────────────────────────────────────────────────────
const REFRESH_MS = 60_000;
const COLORS = { google: '#4285F4', tomtom: '#FF4757', ola: '#2ed573' };

// Chart.js dark-mode defaults
Chart.defaults.color = '#6470a0';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';

// ── State ─────────────────────────────────────────────────────────────────────
let currentRouteId  = null;
let googleMap       = null;
let activePolylines = [];
let activeMarkers   = [];
let tsChart         = null;  // time-series
let devChart        = null;  // deviation

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const cfg = await apiFetch('/api/config');
    await loadMapsScript(cfg.googleMapsApiKey);
    initMap();
  } catch (e) {
    console.warn('Google Maps unavailable:', e.message);
    document.querySelector('.map-empty').textContent =
      'Map unavailable — check GOOGLE_MAPS_API_KEY';
  }
  await loadRoutes();
  setInterval(refreshData, REFRESH_MS);
}

// ── Google Maps ───────────────────────────────────────────────────────────────
function loadMapsScript(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(); return; }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Maps script failed to load'));
    document.head.appendChild(s);
  });
}

const DARK_STYLE = [
  { elementType: 'geometry',             stylers: [{ color: '#1c2030' }] },
  { elementType: 'labels.text.fill',     stylers: [{ color: '#8b96c0' }] },
  { elementType: 'labels.text.stroke',   stylers: [{ color: '#141720' }] },
  { featureType: 'administrative',       elementType: 'geometry.stroke', stylers: [{ color: '#242838' }] },
  { featureType: 'road',                 elementType: 'geometry',        stylers: [{ color: '#2d3458' }] },
  { featureType: 'road',                 elementType: 'geometry.stroke', stylers: [{ color: '#1c2030' }] },
  { featureType: 'road',                 elementType: 'labels.text.fill',stylers: [{ color: '#5c6490' }] },
  { featureType: 'road.highway',         elementType: 'geometry',        stylers: [{ color: '#3b4480' }] },
  { featureType: 'road.highway',         elementType: 'labels.text.fill',stylers: [{ color: '#9ba3cc' }] },
  { featureType: 'water',                elementType: 'geometry',        stylers: [{ color: '#0a0d16' }] },
  { featureType: 'poi',                  stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',              stylers: [{ visibility: 'off' }] },
];

function initMap() {
  if (!window.google?.maps) return;
  googleMap = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 19.09, lng: 72.86 },
    zoom: 12,
    styles: DARK_STYLE,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    zoomControl: true,
    backgroundColor: '#141720',
  });
  document.querySelector('.map-empty')?.remove();
}

function updateMap(records) {
  if (!googleMap) return;

  activePolylines.forEach(p => p.setMap(null));
  activeMarkers.forEach(m => m.setMap(null));
  activePolylines = [];
  activeMarkers   = [];

  const latest = [...records].reverse().find(r => r.google?.polyline);
  if (!latest) return;

  const bounds = new google.maps.LatLngBounds();

  const layers = [
    { key: 'ola',    color: COLORS.ola,    weight: 5, opacity: 0.8, z: 1 },
    { key: 'tomtom', color: COLORS.tomtom, weight: 5, opacity: 0.8, z: 2 },
    { key: 'google', color: COLORS.google, weight: 5, opacity: 0.9, z: 3 },
  ];

  for (const layer of layers) {
    const encoded = latest[layer.key]?.polyline;
    if (!encoded) continue;
    const path = decodePolyline(encoded);
    const poly = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor:   layer.color,
      strokeOpacity: layer.opacity,
      strokeWeight:  layer.weight,
      zIndex: layer.z,
      map: googleMap,
    });
    activePolylines.push(poly);
    path.forEach(pt => bounds.extend(pt));
  }

  // Origin / destination markers using Google's polyline as reference
  const refPath = decodePolyline(latest.google.polyline);
  if (refPath.length > 0) {
    const mkr = (pos, fillColor, strokeColor) =>
      new google.maps.Marker({
        position: pos,
        map: googleMap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor,
          fillOpacity: 1,
          strokeColor,
          strokeWeight: 2,
        },
      });
    activeMarkers.push(
      mkr(refPath[0],                    '#ffffff', '#1c2030'),
      mkr(refPath[refPath.length - 1],   COLORS.google, '#ffffff')
    );
  }

  googleMap.fitBounds(bounds, { top: 40, right: 24, bottom: 24, left: 24 });
  document.getElementById('map-ts').textContent =
    `Poll: ${new Date(latest.timestamp).toLocaleString()}`;
}

// Decode Google-encoded polyline string → [{lat, lng}]
function decodePolyline(encoded) {
  const pts = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let shift = 0, result = 0, b;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

// ── Route tabs ────────────────────────────────────────────────────────────────
async function loadRoutes() {
  const routes = await apiFetch('/api/routes');
  const tabs = document.getElementById('route-tabs');
  tabs.innerHTML = routes
    .map(r => `<button class="tab-btn" data-id="${r.id}">${r.label}</button>`)
    .join('');
  tabs.querySelectorAll('.tab-btn').forEach(btn =>
    btn.addEventListener('click', () => switchRoute(btn.dataset.id))
  );
  if (routes.length > 0) switchRoute(routes[0].id);
}

function switchRoute(id) {
  currentRouteId = id;
  // Destroy charts so they re-init cleanly for the new route's data range
  tsChart?.destroy();  tsChart = null;
  devChart?.destroy(); devChart = null;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.id === id)
  );
  refreshData();
}

// ── Data refresh ──────────────────────────────────────────────────────────────
async function refreshData() {
  if (!currentRouteId) return;
  try {
    const records = await apiFetch(`/api/data/${currentRouteId}/latest?n=200`);
    document.getElementById('last-updated').textContent =
      `Updated ${new Date().toLocaleTimeString()}`;

    if (!records?.length) {
      setEl('stat-google', '—');
      setEl('stat-tomtom', '—');
      setEl('stat-ola', '—');
      setEl('stat-count', '0');
      return;
    }

    updateStats(records);
    updateMap(records);
    renderTimeSeries(records);
    renderDeviation(records);
    renderAlerts(records);
    renderTable(records);
  } catch (e) {
    console.error('Refresh failed:', e);
  }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function updateStats(records) {
  const last = records[records.length - 1];
  const g = last?.google?.durationSeconds;
  const t = last?.tomtom?.durationSeconds;
  const o = last?.ola?.durationSeconds;

  const toMin  = s => s != null ? `${Math.round(s / 60)} min` : '—';
  const toKm   = m => m != null ? `${(m / 1000).toFixed(1)} km` : '—';
  const pctDev = (a, b) => a != null && b != null && b > 0
    ? ((a - b) / b * 100)
    : null;

  setEl('stat-google',      toMin(g));
  setEl('stat-google-dist', toKm(last?.google?.distanceMeters));
  setEl('stat-tomtom',      toMin(t));
  setEl('stat-tomtom-dist', toKm(last?.tomtom?.distanceMeters));
  setEl('stat-ola',         toMin(o));
  setEl('stat-ola-dist',    toKm(last?.ola?.distanceMeters));
  setEl('stat-count',       `${records.length}`);

  applyDelta('stat-tomtom-delta', pctDev(t, g));
  applyDelta('stat-ola-delta',    pctDev(o, g));

  // Averages over all polls
  const avgPct = (key) => {
    const pairs = records.filter(r => r.google?.durationSeconds != null && r[key]?.durationSeconds != null);
    if (!pairs.length) return null;
    return pairs.reduce((s, r) => s + (r[key].durationSeconds - r.google.durationSeconds) / r.google.durationSeconds * 100, 0) / pairs.length;
  };
  applyAvg('stat-avg-tomtom', avgPct('tomtom'));
  applyAvg('stat-avg-ola',    avgPct('ola'));

  const divs = records.filter(r =>
    r.tomtom?.routeDivergence?.isDifferentRoute ||
    r.ola?.routeDivergence?.isDifferentRoute
  ).length;
  setEl('stat-divergences', `${divs}`);
}

function applyDelta(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === null) { el.textContent = ''; el.className = 'stat-delta'; return; }
  const v = val.toFixed(1);
  el.textContent = `${val > 0 ? '+' : ''}${v}%`;
  el.className   = `stat-delta ${val > 0 ? 'pos' : val < 0 ? 'neg' : 'neu'}`;
}

function applyAvg(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === null) { el.textContent = '—'; return; }
  const v = val.toFixed(1);
  el.textContent = `${val > 0 ? '+' : ''}${v}%`;
  el.style.color = val > 10 ? 'var(--tomtom)' : val < -10 ? 'var(--ola)' : 'var(--text)';
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
const SCALE_X = {
  type: 'time',
  time: { tooltipFormat: 'MMM d, HH:mm' },
  ticks: { color: '#6470a0', maxTicksLimit: 6, font: { size: 10 } },
  grid: { color: 'rgba(255,255,255,0.04)' },
  border: { color: 'rgba(255,255,255,0.06)' },
};
const scaleY = () => ({
  ticks: { color: '#6470a0', font: { size: 10 } },
  grid: { color: 'rgba(255,255,255,0.04)' },
  border: { color: 'rgba(255,255,255,0.06)' },
});
const PLUGINS = {
  legend: {
    position: 'top',
    labels: { color: '#dde2f0', usePointStyle: true, pointStyleWidth: 10, font: { size: 11 }, boxHeight: 6 },
  },
  tooltip: {
    backgroundColor: '#1c2030',
    borderColor: '#242838',
    borderWidth: 1,
    titleColor: '#dde2f0',
    bodyColor: '#6470a0',
    padding: 10,
  },
};

function makeLine(label, data, color, { divergentFor, records } = {}) {
  const pointStyle = divergentFor
    ? records.map(r => r[divergentFor]?.routeDivergence?.isDifferentRoute ? 'triangle' : 'circle')
    : 'circle';
  const pointRadius = divergentFor
    ? records.map(r => r[divergentFor]?.routeDivergence?.isDifferentRoute ? 7 : 2)
    : 2;
  return {
    label,
    data,
    borderColor:     color,
    backgroundColor: color + '18',
    borderWidth: 2,
    pointStyle,
    pointRadius,
    tension: 0.4,
    spanGaps: true,
  };
}

// ── Chart: Travel time ────────────────────────────────────────────────────────
function renderTimeSeries(records) {
  const labels = records.map(r => new Date(r.timestamp));
  const min = s => s != null ? +(s / 60).toFixed(2) : null;

  const datasets = [
    makeLine('Google', records.map(r => min(r.google?.durationSeconds)), COLORS.google),
    makeLine('TomTom', records.map(r => min(r.tomtom?.durationSeconds)), COLORS.tomtom, { divergentFor: 'tomtom', records }),
    makeLine('Ola',    records.map(r => min(r.ola?.durationSeconds)),    COLORS.ola,    { divergentFor: 'ola',    records }),
  ];

  const tooltipCallbacks = {
    afterBody(items) {
      const r = records[items[0]?.dataIndex];
      if (!r) return [];
      const notes = [];
      if (r.tomtom?.routeDivergence?.isDifferentRoute)
        notes.push(`⚠ TomTom different route (avg ${r.tomtom.routeDivergence.avgDeviationMeters}m)`);
      if (r.ola?.routeDivergence?.isDifferentRoute)
        notes.push(`⚠ Ola different route (avg ${r.ola.routeDivergence.avgDeviationMeters}m)`);
      return notes;
    },
  };

  const cfg = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      scales: { x: SCALE_X, y: scaleY() },
      plugins: { ...PLUGINS, tooltip: { ...PLUGINS.tooltip, callbacks: tooltipCallbacks } },
    },
  };

  if (tsChart) { tsChart.data = cfg.data; tsChart.update('none'); }
  else { tsChart = new Chart(document.getElementById('timeseries-chart'), cfg); }
}

// ── Chart: Deviation ──────────────────────────────────────────────────────────
function renderDeviation(records) {
  const labels = records.map(r => new Date(r.timestamp));
  const dev = (api, g) => api != null && g != null && g > 0
    ? +((api - g) / g * 100).toFixed(2) : null;

  const datasets = [
    makeLine('TomTom Δ', records.map(r => dev(r.tomtom?.durationSeconds, r.google?.durationSeconds)), COLORS.tomtom),
    makeLine('Ola Δ',    records.map(r => dev(r.ola?.durationSeconds,    r.google?.durationSeconds)), COLORS.ola),
    {
      label: 'Google (0%)',
      data: records.map(() => 0),
      borderColor: COLORS.google,
      borderDash: [5, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      spanGaps: true,
    },
  ];

  const cfg = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      scales: { x: SCALE_X, y: scaleY() },
      plugins: PLUGINS,
    },
  };

  if (devChart) { devChart.data = cfg.data; devChart.update('none'); }
  else { devChart = new Chart(document.getElementById('deviation-chart'), cfg); }
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function renderAlerts(records) {
  const pill = document.getElementById('alert-pill');
  const list = document.getElementById('alerts-list');

  const div = records.filter(r =>
    r.tomtom?.routeDivergence?.isDifferentRoute ||
    r.ola?.routeDivergence?.isDifferentRoute
  );

  pill.textContent = div.length;
  pill.className = `alert-pill${div.length === 0 ? ' zero' : ''}`;

  if (div.length === 0) {
    list.innerHTML = '<div class="empty-msg">No route divergences detected</div>';
    return;
  }

  list.innerHTML = div.slice(-20).reverse().map(r => {
    const time = new Date(r.timestamp).toLocaleString();
    const rows = [];
    if (r.tomtom?.routeDivergence?.isDifferentRoute) {
      const d = r.tomtom.routeDivergence;
      rows.push(`<div class="alert-row">
        <div class="alert-api">TomTom — Different Route</div>
        <div class="alert-meta">${time} · avg ${d.avgDeviationMeters}m · max ${d.maxDeviationMeters}m</div>
      </div>`);
    }
    if (r.ola?.routeDivergence?.isDifferentRoute) {
      const d = r.ola.routeDivergence;
      rows.push(`<div class="alert-row">
        <div class="alert-api">Ola Maps — Different Route</div>
        <div class="alert-meta">${time} · avg ${d.avgDeviationMeters}m · max ${d.maxDeviationMeters}m</div>
      </div>`);
    }
    return rows.join('');
  }).join('');
}

// ── Distance table ────────────────────────────────────────────────────────────
function renderTable(records) {
  const tbody = document.getElementById('dist-tbody');
  const fmt = m => m != null ? `${(m / 1000).toFixed(2)} km` : '—';
  const diffCell = (a, b) => {
    if (a == null || b == null) return '<td>—</td>';
    const d = ((a - b) / b * 100);
    const cls = d > 0 ? 'dp' : d < 0 ? 'dn' : '';
    return `<td class="${cls}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</td>`;
  };

  tbody.innerHTML = records.slice(-10).reverse().map(r => `
    <tr>
      <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
      <td>${fmt(r.google?.distanceMeters)}</td>
      <td>${fmt(r.tomtom?.distanceMeters)}</td>
      ${diffCell(r.tomtom?.distanceMeters, r.google?.distanceMeters)}
      <td>${fmt(r.ola?.distanceMeters)}</td>
      ${diffCell(r.ola?.distanceMeters, r.google?.distanceMeters)}
    </tr>`
  ).join('');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Go ────────────────────────────────────────────────────────────────────────
init();
