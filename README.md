<div align="center">

# RouteScope

**Compare traffic data from Google Maps, TomTom, and Ola Maps — side by side, in real time.**

Polls all three APIs every 15 minutes. Stores every result. Visualises divergence, deviation, and accuracy on a live dashboard.

<br/>

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

</div>

---

## What it does

| Feature | Detail |
|---|---|
| **Continuous polling** | Hits Google Maps, TomTom, and Ola Maps on a configurable interval (default 15 min) |
| **Route map** | Google Maps overlay showing all 3 API routes for the latest poll in different colours |
| **Time-series charts** | Travel time per API over time — triangle markers flag polls where routes diverged |
| **Deviation analysis** | % difference from Google (baseline) plotted per poll, with running averages |
| **Route divergence detection** | Polyline sampling + Haversine distance — flags when an API suggests a physically different road |
| **Multi-route support** | Configure multiple origin-destination pairs; switch between them via tabs |

---

## Screenshots

> Start the app and open `http://localhost:3000` — the dashboard auto-refreshes every 60 seconds as new data arrives.

---

## Quick start

### 1 — Get API keys

| Service | Console | APIs to enable |
|---|---|---|
| **Google Maps** | [console.cloud.google.com](https://console.cloud.google.com) | Directions API · Maps JavaScript API |
| **TomTom** | [developer.tomtom.com](https://developer.tomtom.com) | Routing API |
| **Ola Maps** | [cloud.olakrutrim.com](https://cloud.olakrutrim.com) | Maps / Directions API |

### 2 — Configure

```bash
cp .env.example .env
```

```env
GOOGLE_MAPS_API_KEY=your_key_here
TOMTOM_API_KEY=your_key_here
OLA_MAPS_API_KEY=your_key_here
PORT=3000
POLL_INTERVAL_MS=900000
```

Edit `routes.json` to set your origin-destination pairs:

```json
[
  {
    "id":          "airport-to-city",
    "label":       "Airport → City Centre",
    "origin":      { "lat": 12.9352, "lng": 77.6245 },
    "destination": { "lat": 12.9716, "lng": 77.5946 }
  }
]
```

> Add as many route pairs as you need — each gets its own tab on the dashboard.

### 3 — Run

```bash
./start.sh
```

Opens `http://localhost:3000` automatically. The first poll fires immediately — no need to wait 15 minutes for initial data.

```bash
npm run dev   # auto-restart on file changes
```

---

## How route divergence works

After each poll, TomTom and Ola polylines are compared against Google's:

1. Sample ~12 evenly-spaced points from the API's route
2. For each sample point, find the closest point on Google's route (Haversine distance)
3. Compute average and maximum deviation

```
avg deviation > 500m  OR  max deviation > 1 km  →  isDifferentRoute: true
```

Divergences are stored in the data record, shown in the alerts panel, and marked as triangle markers on the time-series chart.

---

## Data format

One JSON file per route pair at `data/<route-id>.json`, appended every poll. The `data/` directory is gitignored.

```jsonc
{
  "id":        "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": 1709000000000,
  "routeId":   "airport-to-city",

  "google": {
    "durationSeconds":          1200,
    "durationNoTrafficSeconds": 1050,
    "distanceMeters":           15000,
    "polyline":                 "encoded..."
  },

  "tomtom": {
    "durationSeconds":    1150,
    "distanceMeters":     14800,
    "trafficDelaySeconds": 120,
    "polyline":           "encoded...",
    "routeDivergence": {
      "comparedTo":         "google",
      "avgDeviationMeters": 85,
      "maxDeviationMeters": 210,
      "isDifferentRoute":   false
    }
  },

  "ola": {
    "durationSeconds":  1340,
    "distanceMeters":   15400,
    "polyline":         "encoded...",
    "routeDivergence": {
      "comparedTo":         "google",
      "avgDeviationMeters": 1200,
      "maxDeviationMeters": 2500,
      "isDifferentRoute":   true      // ← different road taken
    }
  }
}
```

> If an API call fails, that key is `{ "error": "message" }` — the other two APIs are unaffected.

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/routes` | All configured route pairs |
| `GET` | `/api/data/:routeId` | Full history for a route |
| `GET` | `/api/data/:routeId/latest?n=100` | Last N records |
| `GET` | `/api/config` | Frontend config (Google Maps JS key) |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | — | Required. Needs Directions API + Maps JavaScript API |
| `TOMTOM_API_KEY` | — | Required |
| `OLA_MAPS_API_KEY` | — | Required |
| `PORT` | `3000` | Dashboard port |
| `POLL_INTERVAL_MS` | `900000` | Poll interval in ms (900000 = 15 min) |

---

## Project structure

```
├── routes.json              # Your route pairs (edit this)
├── .env                     # API keys (gitignored)
├── src/
│   ├── index.js             # Entry point
│   ├── poller.js            # Polling orchestrator
│   ├── routeMatcher.js      # Polyline decode/encode + divergence detection
│   ├── storage.js           # JSON file read/write
│   ├── adapters/
│   │   ├── google.js
│   │   ├── tomtom.js
│   │   └── ola.js
│   └── server/
│       ├── app.js
│       └── routes.js
├── public/                  # Dashboard (served by Express)
│   ├── index.html
│   ├── dashboard.js
│   └── style.css
└── data/                    # Poll results — auto-created, gitignored
    └── <route-id>.json
```
