const axios = require('axios');

async function fetch(route) {
  const { origin, destination } = route;
  const res = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    params: {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      departure_time: 'now',
      key: process.env.GOOGLE_MAPS_API_KEY,
    },
    timeout: 10000,
  });

  const data = res.data;
  if (data.status !== 'OK') {
    throw new Error(`Google API error: ${data.status} — ${data.error_message || ''}`);
  }

  const route0 = data.routes[0];
  const leg = route0.legs[0];

  return {
    durationSeconds: leg.duration_in_traffic?.value ?? leg.duration.value,
    durationNoTrafficSeconds: leg.duration.value,
    distanceMeters: leg.distance.value,
    polyline: route0.overview_polyline.points,
  };
}

module.exports = { fetch };
