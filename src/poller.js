const { v4: uuidv4 } = require('uuid');
const routeConfig = require('../routes.json');
const google = require('./adapters/google');
const tomtom = require('./adapters/tomtom');
const ola = require('./adapters/ola');
const { appendRecord } = require('./storage');
const { compareRoutes } = require('./routeMatcher');

const INTERVAL = parseInt(process.env.POLL_INTERVAL_MS) || 900_000; // 15 minutes

async function pollOnce() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] Polling ${routeConfig.length} route(s)...`);

  for (const route of routeConfig) {
    const timestamp = Date.now();

    const [googleResult, tomtomResult, olaResult] = await Promise.allSettled([
      google.fetch(route),
      tomtom.fetch(route),
      ola.fetch(route),
    ]);

    const googleData =
      googleResult.status === 'fulfilled'
        ? googleResult.value
        : { error: googleResult.reason?.message || 'Unknown error' };

    const tomtomData =
      tomtomResult.status === 'fulfilled'
        ? tomtomResult.value
        : { error: tomtomResult.reason?.message || 'Unknown error' };

    const olaData =
      olaResult.status === 'fulfilled'
        ? olaResult.value
        : { error: olaResult.reason?.message || 'Unknown error' };

    // Route divergence: compare TomTom and Ola against Google (only if all succeeded)
    if (googleData.polyline) {
      if (tomtomData.polyline) {
        const divergence = compareRoutes(googleData.polyline, tomtomData.polyline);
        if (divergence) {
          tomtomData.routeDivergence = { comparedTo: 'google', ...divergence };
          if (divergence.isDifferentRoute) {
            console.warn(
              `[${ts}] [${route.id}] TomTom suggests a DIFFERENT ROUTE ` +
                `(avg deviation: ${divergence.avgDeviationMeters}m, max: ${divergence.maxDeviationMeters}m)`
            );
          }
        }
      }

      if (olaData.polyline) {
        const divergence = compareRoutes(googleData.polyline, olaData.polyline);
        if (divergence) {
          olaData.routeDivergence = { comparedTo: 'google', ...divergence };
          if (divergence.isDifferentRoute) {
            console.warn(
              `[${ts}] [${route.id}] Ola Maps suggests a DIFFERENT ROUTE ` +
                `(avg deviation: ${divergence.avgDeviationMeters}m, max: ${divergence.maxDeviationMeters}m)`
            );
          }
        }
      }
    }

    const record = {
      id: uuidv4(),
      timestamp,
      routeId: route.id,
      google: googleData,
      tomtom: tomtomData,
      ola: olaData,
    };

    appendRecord(route.id, record);
    console.log(
      `[${ts}] [${route.id}] Saved — ` +
        `Google: ${googleData.durationSeconds ?? 'ERR'}s | ` +
        `TomTom: ${tomtomData.durationSeconds ?? 'ERR'}s | ` +
        `Ola: ${olaData.durationSeconds ?? 'ERR'}s`
    );
  }
}

function startPoller() {
  pollOnce();
  setInterval(pollOnce, INTERVAL);
}

module.exports = { startPoller };
