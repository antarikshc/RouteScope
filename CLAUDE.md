# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
./start.sh         # Recommended: checks .env, installs deps, opens browser, starts server
npm start          # Start directly (Express server + poller)
npm run dev        # Start with --watch (auto-restart on file changes)
```

No build step — pure Node.js with no transpilation.

## Architecture

Single Node.js process running two things concurrently:
1. **Polling service** — hits Google Maps, TomTom, and Ola Maps APIs every 15 minutes, appends results to `data/<routeId>.json`
2. **Express server** — serves the live dashboard at `http://localhost:3000` and exposes `/api/` endpoints

### Data flow

```
routes.json → poller.js → adapters/{google,tomtom,ola}.js → storage.js → data/<routeId>.json
                       ↗ routeMatcher.js (divergence detection)
dashboard.js polls /api/data/:routeId/latest → reads data/<routeId>.json
```

### Key files

| File | Responsibility |
|---|---|
| `src/poller.js` | Orchestrates polling with `Promise.allSettled` so one API failure doesn't block others. Runs once immediately on startup, then every `POLL_INTERVAL_MS`. |
| `src/routeMatcher.js` | Pure functions: decode/encode polylines, sample points, Haversine distance, compare two routes. Returns `{ avgDeviationMeters, maxDeviationMeters, isDifferentRoute }`. |
| `src/adapters/google.js` | Uses Directions API with `departure_time=now`. Falls back from `duration_in_traffic.value` to `duration.value`. |
| `src/adapters/tomtom.js` | TomTom returns `{latitude, longitude}` point arrays — encoded to Google polyline format via `encodePolyline()` for consistent storage/comparison. |
| `src/adapters/ola.js` | Ola Maps uses `POST` with all params as query strings and **no request body**. No `Content-Type` header. Response `status` is `"SUCCESS"` (not `"OK"`). `duration`/`distance` are plain numbers in seconds/meters (not nested `{value}` objects). |
| `src/server/routes.js` | Express API: `/api/config` (exposes Google Maps JS key for frontend map), `/api/routes`, `/api/data/:routeId`, `/api/data/:routeId/latest`. |
| `public/dashboard.js` | Loads Google Maps JS API dynamically using key from `/api/config`. Renders dark-themed Chart.js charts (time-series + deviation). Switches between routes via tabs — charts are destroyed and recreated on tab switch. |

### Route divergence detection

After each poll, TomTom and Ola polylines are compared against Google's using `routeMatcher.compareRoutes()`. Samples ~12 evenly-spaced points from route B, finds the nearest point in route A (brute-force O(n²) on sampled points), computes avg/max Haversine deviation. Thresholds: avg > 500m or max > 1km → `isDifferentRoute: true`. Stored as `routeDivergence` on each non-Google result. Divergent points rendered as triangle markers on charts.

### Google Maps dashboard (frontend map)

The frontend loads `https://maps.googleapis.com/maps/api/js` dynamically using the key returned by `GET /api/config`. All 3 route polylines from the latest poll are decoded in-browser (custom `decodePolyline()` — no geometry library needed) and rendered as overlaid `google.maps.Polyline` objects. Draw order: Ola (bottom) → TomTom → Google (top).

### Data storage

One JSON array per route pair in `data/<routeId>.json`. Each record shape:
```json
{
  "id": "uuid",
  "timestamp": 1709000000000,
  "routeId": "route-id",
  "google": { "durationSeconds": 1200, "durationNoTrafficSeconds": 1100, "distanceMeters": 15000, "polyline": "..." },
  "tomtom": { "durationSeconds": 1150, "distanceMeters": 14800, "trafficDelaySeconds": 120,
              "polyline": "...", "routeDivergence": { "comparedTo": "google", "avgDeviationMeters": 85, "maxDeviationMeters": 210, "isDifferentRoute": false } },
  "ola":    { "durationSeconds": 1300, "distanceMeters": 15200,
              "polyline": "...", "routeDivergence": { ... } }
}
```
API errors are stored as `{ "error": "message string" }` on the respective key.

## Configuration

Copy `.env.example` to `.env` and fill in:

```
GOOGLE_MAPS_API_KEY=    # Requires Directions API + Maps JavaScript API enabled
TOMTOM_API_KEY=
OLA_MAPS_API_KEY=
PORT=3000
POLL_INTERVAL_MS=900000
```

`routes.json` — array of route pairs. Each entry: `{ "id", "label", "origin": {"lat","lng"}, "destination": {"lat","lng"} }`.

## Google Maps API requirements

- **Directions API** — used by the backend adapter (`departure_time=now` requires this, not Routes API)
- **Maps JavaScript API** — used by the frontend map to render routes visually

Both must be enabled on the same API key in Google Cloud Console.
