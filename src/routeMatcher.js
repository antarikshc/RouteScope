/**
 * Polyline sampling and route divergence detection.
 * Compares two encoded polylines to determine if they represent different physical routes.
 */

/**
 * Decode a Google-encoded polyline string into an array of {lat, lng} points.
 */
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

/**
 * Encode an array of {lat, lng} points into a Google-encoded polyline string.
 * Used for TomTom (which returns raw point arrays) to normalize to the same format.
 */
function encodePolyline(points) {
  function encodeValue(value) {
    let v = Math.round(value * 1e5);
    v = v < 0 ? ~(v << 1) : v << 1;
    let result = '';
    while (v >= 0x20) {
      result += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    result += String.fromCharCode(v + 63);
    return result;
  }

  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const point of points) {
    output += encodeValue(point.lat - prevLat);
    output += encodeValue(point.lng - prevLng);
    prevLat = point.lat;
    prevLng = point.lng;
  }
  return output;
}

/**
 * Sample N evenly-spaced points from a points array.
 */
function samplePoints(points, n = 12) {
  if (points.length <= n) return points;
  const result = [];
  const step = (points.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    result.push(points[Math.round(i * step)]);
  }
  return result;
}

/**
 * Haversine distance between two {lat, lng} points in meters.
 */
function haversineDistance(p1, p2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compare two encoded polylines.
 * Returns { avgDeviationMeters, maxDeviationMeters, isDifferentRoute }
 *
 * Algorithm: sample points from routeB, find the nearest point in routeA for each,
 * compute average and max of those minimum distances.
 */
function compareRoutes(polylineA, polylineB, options = {}) {
  const { sampleCount = 12, avgThreshold = 500, maxThreshold = 1000 } = options;

  try {
    const pointsA = decodePolyline(polylineA);
    const pointsB = decodePolyline(polylineB);

    if (pointsA.length === 0 || pointsB.length === 0) {
      return null;
    }

    const sampledB = samplePoints(pointsB, sampleCount);

    let totalDeviation = 0;
    let maxDeviation = 0;

    for (const pb of sampledB) {
      let minDist = Infinity;
      for (const pa of pointsA) {
        const d = haversineDistance(pa, pb);
        if (d < minDist) minDist = d;
      }
      totalDeviation += minDist;
      if (minDist > maxDeviation) maxDeviation = minDist;
    }

    const avgDeviation = totalDeviation / sampledB.length;

    return {
      avgDeviationMeters: Math.round(avgDeviation),
      maxDeviationMeters: Math.round(maxDeviation),
      isDifferentRoute: avgDeviation > avgThreshold || maxDeviation > maxThreshold,
    };
  } catch (err) {
    return null;
  }
}

module.exports = { decodePolyline, encodePolyline, samplePoints, haversineDistance, compareRoutes };
