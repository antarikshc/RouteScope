const axios = require('axios');
const { encodePolyline } = require('../routeMatcher');

async function fetch(route) {
  const { origin, destination } = route;
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json`;

  const res = await axios.get(url, {
    params: {
      key: process.env.TOMTOM_API_KEY,
      traffic: true,
      travelMode: 'car',
    },
    timeout: 10000,
  });

  const data = res.data;
  if (!data.routes || data.routes.length === 0) {
    throw new Error('TomTom API returned no routes');
  }

  const route0 = data.routes[0];
  const summary = route0.summary;

  // TomTom returns an array of {latitude, longitude} points — normalise to {lat, lng} and encode
  const rawPoints = route0.legs[0].points || [];
  const points = rawPoints.map((p) => ({ lat: p.latitude, lng: p.longitude }));
  const polyline = encodePolyline(points);

  return {
    durationSeconds: summary.travelTimeInSeconds,
    distanceMeters: summary.lengthInMeters,
    trafficDelaySeconds: summary.trafficDelayInSeconds ?? 0,
    polyline,
  };
}

module.exports = { fetch };
