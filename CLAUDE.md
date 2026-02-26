# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start the app (Express server + poller)
npm run dev        # Start with --watch (auto-restart on file changes)
```

No build step — pure Node.js with no transpilation.

## Architecture

This is a single Node.js process that does two things concurrently:
1. **Polling service** — hits Google Maps, TomTom, and Ola Maps APIs every 15 minutes and appends results to `data/<routeId>.json`
2. **Express server** — serves the live dashboard at `http://localhost:3000` and exposes `/api/` endpoints the frontend polls

### Data flow

```
routes.json → poller.js → adapters/{google,tomtom,ola}.js → storage.js → data/<routeId>.json
                       ↗ routeMatcher.js (divergence detection)
dashboard.js polls /api/data/:routeId/latest → reads data/<routeId>.json
```

### Key files

| File | Responsibility |
|---|---|
| `src/poller.js` | Orchestrates polling with `Promise.allSettled` so one API failure doesn't block others. Runs once immediately, then on `POLL_INTERVAL_MS` interval. |
| `src/routeMatcher.js` | Pure functions: decode/encode polylines, sample points, Haversine distance, compare two routes. Returns `{ avgDeviationMeters, maxDeviationMeters, isDifferentRoute }`. |
| `src/adapters/ola.js` | Ola Maps uses `POST` with all params as query strings (no body). |
| `src/adapters/tomtom.js` | TomTom returns `{latitude, longitude}` point arrays — these are encoded to Google polyline format via `encodePolyline()` for consistent storage/comparison. |
| `public/dashboard.js` | All chart logic. Uses Chart.js 4 with `chartjs-adapter-date-fns` for time-scale X axis. Charts update in-place by calling `chart.update()` on existing instances. |

### Route divergence detection

After each poll, TomTom and Ola polylines are compared against Google's using `routeMatcher.compareRoutes()`. The algorithm samples ~12 evenly-spaced points from route B, finds the nearest point in route A for each (brute-force O(n²) on sampled points — acceptable given small sample size), and computes avg/max Haversine deviation. Thresholds: avg > 500m or max > 1km → `isDifferentRoute: true`. Divergent data points are rendered with triangle markers on the time-series chart.

### Data storage

One JSON array per route pair in `data/<routeId>.json`. Each record shape:
```json
{
  "id": "uuid",
  "timestamp": 1709000000000,
  "routeId": "route-id",
  "google": { "durationSeconds": 1200, "distanceMeters": 15000, "polyline": "..." },
  "tomtom": { "durationSeconds": 1150, "distanceMeters": 14800, "trafficDelaySeconds": 120,
              "polyline": "...", "routeDivergence": { ... } },
  "ola":    { "durationSeconds": 1300, "distanceMeters": 15200,
              "polyline": "...", "routeDivergence": { ... } }
}
```
API errors are stored as `{ "error": "message string" }` on the respective key.

## Configuration

Copy `.env.example` to `.env` and fill in:

```
GOOGLE_MAPS_API_KEY=
TOMTOM_API_KEY=
OLA_MAPS_API_KEY=
PORT=3000
POLL_INTERVAL_MS=900000
```

Edit `routes.json` to configure origin/destination pairs. Each entry needs `id`, `label`, `origin: {lat, lng}`, `destination: {lat, lng}`.

## Google Maps API note

The adapter uses `departure_time=now` which requires the **Directions API** (not Routes API). The response field `duration_in_traffic.value` is only present when traffic data is available; it falls back to `duration.value`.
