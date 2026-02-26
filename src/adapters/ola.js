const axios = require('axios');

async function fetch(route) {
  const { origin, destination } = route;

  // Ola Maps uses POST but passes all parameters as query params (no request body)
  let res;
  try {
    res = await axios.post(
      'https://api.olamaps.io/routing/v1/directions',
      null,
      {
        params: {
          api_key: process.env.OLA_MAPS_API_KEY,
          origin: `${origin.lat},${origin.lng}`,
          destination: `${destination.lat},${destination.lng}`,
          steps: true,
          overview: 'full',
        },
        timeout: 10000,
      }
    );
  } catch (err) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data);
    throw new Error(`Ola Maps HTTP ${status}: ${body}`);
  }

  const data = res.data;
  if (data.status !== 'SUCCESS' || !data.routes || data.routes.length === 0) {
    throw new Error(`Ola Maps API error: ${data.status || JSON.stringify(data)}`);
  }

  const route0 = data.routes[0];
  const leg = route0.legs[0];

  // Ola returns duration/distance as plain numbers (seconds/meters), not {value} objects
  return {
    durationSeconds: leg.duration,
    distanceMeters: leg.distance,
    polyline: route0.overview_polyline,
  };
}

module.exports = { fetch };
