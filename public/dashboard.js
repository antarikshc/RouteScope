const REFRESH_INTERVAL = 60_000; // 1 minute
const COLORS = {
  google: { border: '#4285F4', bg: 'rgba(66,133,244,0.15)' },
  tomtom: { border: '#E53935', bg: 'rgba(229,57,53,0.15)' },
  ola:    { border: '#43A047', bg: 'rgba(67,160,71,0.15)' },
};

let currentRouteId = null;
let timeSeriesChart = null;
let deviationChart = null;

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  await loadRoutes();
  document.getElementById('route-select').addEventListener('change', (e) => {
    currentRouteId = e.target.value;
    refreshData();
  });
  setInterval(refreshData, REFRESH_INTERVAL);
}

async function loadRoutes() {
  try {
    const routes = await apiFetch('/api/routes');
    const sel = document.getElementById('route-select');
    sel.innerHTML = routes
      .map((r) => `<option value="${r.id}">${r.label}</option>`)
      .join('');
    if (routes.length > 0) {
      currentRouteId = routes[0].id;
      await refreshData();
    }
  } catch (err) {
    console.error('Failed to load routes', err);
  }
}

// ── Data refresh ─────────────────────────────────────────────────────────────

async function refreshData() {
  if (!currentRouteId) return;
  try {
    const records = await apiFetch(`/api/data/${currentRouteId}/latest?n=200`);
    const ts = new Date().toLocaleTimeString();
    document.getElementById('last-updated').textContent = `Last updated: ${ts}`;

    if (!records || records.length === 0) {
      document.getElementById('empty-state').style.display = 'block';
      document.getElementById('dashboard').style.display = 'none';
      return;
    }

    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    renderTimeSeries(records);
    renderDeviation(records);
    renderSummaryStats(records);
    renderDivergenceAlerts(records);
    renderDistanceTable(records);
  } catch (err) {
    console.error('Failed to refresh data', err);
  }
}

// ── Chart: Time Series ────────────────────────────────────────────────────────

function renderTimeSeries(records) {
  const labels = records.map((r) => new Date(r.timestamp));

  const toMin = (s) => (s != null ? +(s / 60).toFixed(2) : null);

  const googleData  = records.map((r) => toMin(r.google?.durationSeconds));
  const tomtomData  = records.map((r) => toMin(r.tomtom?.durationSeconds));
  const olaData     = records.map((r) => toMin(r.ola?.durationSeconds));

  // Point styles: mark divergent records
  const tomtomPointStyles = records.map((r) =>
    r.tomtom?.routeDivergence?.isDifferentRoute ? 'triangle' : 'circle'
  );
  const olaPointStyles = records.map((r) =>
    r.ola?.routeDivergence?.isDifferentRoute ? 'triangle' : 'circle'
  );
  const tomtomPointRadius = records.map((r) =>
    r.tomtom?.routeDivergence?.isDifferentRoute ? 7 : 3
  );
  const olaPointRadius = records.map((r) =>
    r.ola?.routeDivergence?.isDifferentRoute ? 7 : 3
  );

  const datasets = [
    {
      label: 'Google Maps',
      data: googleData,
      borderColor: COLORS.google.border,
      backgroundColor: COLORS.google.bg,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: 'TomTom',
      data: tomtomData,
      borderColor: COLORS.tomtom.border,
      backgroundColor: COLORS.tomtom.bg,
      borderWidth: 2,
      pointStyle: tomtomPointStyles,
      pointRadius: tomtomPointRadius,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: 'Ola Maps',
      data: olaData,
      borderColor: COLORS.ola.border,
      backgroundColor: COLORS.ola.bg,
      borderWidth: 2,
      pointStyle: olaPointStyles,
      pointRadius: olaPointRadius,
      tension: 0.3,
      spanGaps: true,
    },
  ];

  const cfg = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'MMM d, HH:mm' }, ticks: { maxTicksLimit: 8 } },
        y: { title: { display: true, text: 'Minutes' } },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const idx = items[0]?.dataIndex;
              if (idx == null) return [];
              const r = records[idx];
              const notes = [];
              if (r.tomtom?.routeDivergence?.isDifferentRoute) {
                notes.push(`⚠ TomTom different route (avg Δ ${r.tomtom.routeDivergence.avgDeviationMeters}m)`);
              }
              if (r.ola?.routeDivergence?.isDifferentRoute) {
                notes.push(`⚠ Ola different route (avg Δ ${r.ola.routeDivergence.avgDeviationMeters}m)`);
              }
              return notes;
            },
          },
        },
      },
    },
  };

  if (timeSeriesChart) {
    timeSeriesChart.data = cfg.data;
    timeSeriesChart.update();
  } else {
    timeSeriesChart = new Chart(document.getElementById('timeseries-chart'), cfg);
  }
}

// ── Chart: Deviation ──────────────────────────────────────────────────────────

function renderDeviation(records) {
  const labels = records.map((r) => new Date(r.timestamp));

  const deviation = (api, google) => {
    if (api == null || google == null || google === 0) return null;
    return +((( api - google) / google) * 100).toFixed(2);
  };

  const tomtomDev = records.map((r) =>
    deviation(r.tomtom?.durationSeconds, r.google?.durationSeconds)
  );
  const olaDev = records.map((r) =>
    deviation(r.ola?.durationSeconds, r.google?.durationSeconds)
  );

  const datasets = [
    {
      label: 'TomTom deviation',
      data: tomtomDev,
      borderColor: COLORS.tomtom.border,
      backgroundColor: COLORS.tomtom.bg,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: 'Ola deviation',
      data: olaDev,
      borderColor: COLORS.ola.border,
      backgroundColor: COLORS.ola.bg,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      spanGaps: true,
    },
    {
      label: 'Zero (Google baseline)',
      data: records.map(() => 0),
      borderColor: COLORS.google.border,
      borderDash: [6, 4],
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
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'MMM d, HH:mm' }, ticks: { maxTicksLimit: 8 } },
        y: { title: { display: true, text: '% difference from Google' } },
      },
      plugins: { legend: { position: 'top' } },
    },
  };

  if (deviationChart) {
    deviationChart.data = cfg.data;
    deviationChart.update();
  } else {
    deviationChart = new Chart(document.getElementById('deviation-chart'), cfg);
  }
}

// ── Summary Stats ─────────────────────────────────────────────────────────────

function renderSummaryStats(records) {
  document.getElementById('stat-count').textContent = records.length;

  const pairs = (apiKey) =>
    records
      .filter((r) => r.google?.durationSeconds != null && r[apiKey]?.durationSeconds != null)
      .map((r) => ({ g: r.google.durationSeconds, a: r[apiKey].durationSeconds }));

  const avgDev = (apiKey) => {
    const ps = pairs(apiKey);
    if (ps.length === 0) return null;
    const sum = ps.reduce((acc, p) => acc + ((p.a - p.g) / p.g) * 100, 0);
    return (sum / ps.length).toFixed(1);
  };

  const pearson = (apiKey) => {
    const ps = pairs(apiKey);
    if (ps.length < 2) return null;
    const n = ps.length;
    const meanG = ps.reduce((s, p) => s + p.g, 0) / n;
    const meanA = ps.reduce((s, p) => s + p.a, 0) / n;
    const num = ps.reduce((s, p) => s + (p.g - meanG) * (p.a - meanA), 0);
    const den = Math.sqrt(
      ps.reduce((s, p) => s + (p.g - meanG) ** 2, 0) *
      ps.reduce((s, p) => s + (p.a - meanA) ** 2, 0)
    );
    return den === 0 ? null : (num / den).toFixed(3);
  };

  const setDev = (elId, cardId, val) => {
    const el = document.getElementById(elId);
    const card = document.getElementById(cardId);
    if (val === null) { el.textContent = 'N/A'; return; }
    el.textContent = `${val > 0 ? '+' : ''}${val}%`;
    card.className = 'card ' + (Math.abs(val) > 15 ? 'danger' : Math.abs(val) > 5 ? 'warning' : 'good');
  };

  setDev('stat-tomtom-dev', 'card-tomtom-dev', avgDev('tomtom'));
  setDev('stat-ola-dev',    'card-ola-dev',    avgDev('ola'));

  const tc = pearson('tomtom');
  const oc = pearson('ola');
  document.getElementById('stat-tomtom-corr').textContent = tc ?? 'N/A';
  document.getElementById('stat-ola-corr').textContent    = oc ?? 'N/A';

  // Divergence count
  const divCount = records.filter(
    (r) =>
      r.tomtom?.routeDivergence?.isDifferentRoute ||
      r.ola?.routeDivergence?.isDifferentRoute
  ).length;
  document.getElementById('stat-divergence').textContent = divCount;
  document.getElementById('card-divergence').className =
    'card ' + (divCount > 0 ? 'warning' : 'good');
}

// ── Divergence Alerts ─────────────────────────────────────────────────────────

function renderDivergenceAlerts(records) {
  const alertsList = document.getElementById('alerts-list');
  const divergent = records.filter(
    (r) =>
      r.tomtom?.routeDivergence?.isDifferentRoute ||
      r.ola?.routeDivergence?.isDifferentRoute
  );

  if (divergent.length === 0) {
    alertsList.innerHTML = '<p class="no-alerts">No route divergences detected.</p>';
    return;
  }

  // Show last 20 divergences, most recent first
  const items = divergent
    .slice(-20)
    .reverse()
    .map((r) => {
      const time = new Date(r.timestamp).toLocaleString();
      const parts = [];
      if (r.tomtom?.routeDivergence?.isDifferentRoute) {
        const d = r.tomtom.routeDivergence;
        parts.push(`
          <div class="alert-item">
            <span class="alert-icon">⚠️</span>
            <div class="alert-body">
              <div class="api-name">TomTom — Different Route</div>
              <div class="alert-detail">
                ${time} &nbsp;|&nbsp;
                Avg deviation: <strong>${d.avgDeviationMeters}m</strong> &nbsp;|&nbsp;
                Max deviation: <strong>${d.maxDeviationMeters}m</strong>
              </div>
            </div>
          </div>
        `);
      }
      if (r.ola?.routeDivergence?.isDifferentRoute) {
        const d = r.ola.routeDivergence;
        parts.push(`
          <div class="alert-item">
            <span class="alert-icon">⚠️</span>
            <div class="alert-body">
              <div class="api-name">Ola Maps — Different Route</div>
              <div class="alert-detail">
                ${time} &nbsp;|&nbsp;
                Avg deviation: <strong>${d.avgDeviationMeters}m</strong> &nbsp;|&nbsp;
                Max deviation: <strong>${d.maxDeviationMeters}m</strong>
              </div>
            </div>
          </div>
        `);
      }
      return parts.join('');
    })
    .join('');

  alertsList.innerHTML = items;
}

// ── Distance Table ────────────────────────────────────────────────────────────

function renderDistanceTable(records) {
  const tbody = document.getElementById('distance-table-body');
  const recent = records.slice(-10).reverse();

  tbody.innerHTML = recent
    .map((r) => {
      const gDist  = r.google?.distanceMeters;
      const ttDist = r.tomtom?.distanceMeters;
      const olaDist = r.ola?.distanceMeters;

      const fmt = (m) => (m != null ? (m / 1000).toFixed(2) : '—');
      const diff = (api, base) => {
        if (api == null || base == null) return '<td>—</td>';
        const d = ((api - base) / base) * 100;
        const cls = d > 0 ? 'diff-pos' : d < 0 ? 'diff-neg' : '';
        return `<td class="${cls}">${d > 0 ? '+' : ''}${d.toFixed(1)}%</td>`;
      };

      return `<tr>
        <td>${new Date(r.timestamp).toLocaleString()}</td>
        <td>${fmt(gDist)}</td>
        <td>${fmt(ttDist)}</td>
        ${diff(ttDist, gDist)}
        <td>${fmt(olaDist)}</td>
        ${diff(olaDist, gDist)}
      </tr>`;
    })
    .join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
